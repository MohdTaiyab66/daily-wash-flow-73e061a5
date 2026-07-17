package com.urbanwash.isolation;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

public class MainActivity extends Activity implements PaymentResultWithDataListener {
    private static final String DEFAULT_BASE_URL = "https://daily-wash-flow.lovable.app";
    private static final String CREATE_ORDER_SERVER_FN_ID = "c11039392aee38661b33db6357cf41f849f442d1787cd0964b97693392455302";
    private static final String RAZORPAY_CHECKOUT_VERSION = "1.6.41";

    private EditText baseUrlInput;
    private EditText bookingIdInput;
    private EditText bearerTokenInput;
    private EditText manualKeyInput;
    private EditText manualOrderInput;
    private EditText manualAmountInput;
    private Button createAndPayButton;
    private Button manualPayButton;
    private TextView logView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Checkout.preload(getApplicationContext());
        buildUi();
        log("Official SDK isolation app started");
        log("com.razorpay:checkout pinned = " + RAZORPAY_CHECKOUT_VERSION);
        try {
            Package rzpPkg = Checkout.class.getPackage();
            String implVer = rzpPkg != null ? rzpPkg.getImplementationVersion() : null;
            String specVer = rzpPkg != null ? rzpPkg.getSpecificationVersion() : null;
            log("Checkout SDK implementationVersion=" + implVer + " specificationVersion=" + specVer);
        } catch (Throwable t) {
            log("SDK version probe failure: " + t.getMessage());
        }
        log("Capacitor = not present");
        log("Custom checkout config = not present");
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView title = text("Razorpay Official SDK Isolation", 22, true);
        root.addView(title);
        root.addView(text("Uses the published Urban Wash order server-function, then calls Checkout.open(activity, options) directly.", 14, false));

        baseUrlInput = input("Backend base URL", DEFAULT_BASE_URL, false);
        bookingIdInput = input("Existing unpaid booking UUID", "", false);
        bearerTokenInput = input("Customer bearer token (local test only — do not share)", "", true);
        manualKeyInput = input("Manual key_id fallback (optional)", "", false);
        manualOrderInput = input("Manual order_id fallback (optional)", "", false);
        manualAmountInput = input("Manual amount in paise fallback (optional)", "100", false);

        root.addView(label("Backend order API"));
        root.addView(baseUrlInput);
        root.addView(bookingIdInput);
        root.addView(bearerTokenInput);

        createAndPayButton = new Button(this);
        createAndPayButton.setText("Create Order → Checkout.open");
        createAndPayButton.setOnClickListener(v -> createOrderThenOpen());
        root.addView(createAndPayButton);

        root.addView(label("Manual official-SDK fallback"));
        root.addView(manualKeyInput);
        root.addView(manualOrderInput);
        root.addView(manualAmountInput);
        manualPayButton = new Button(this);
        manualPayButton.setText("Open Checkout with manual order");
        manualPayButton.setOnClickListener(v -> openManual());
        root.addView(manualPayButton);

        logView = text("", 12, false);
        logView.setTextIsSelectable(true);
        root.addView(label("Runtime log"));
        root.addView(logView);
        setContentView(scroll);
    }

    private TextView label(String value) {
        TextView v = text(value, 14, true);
        v.setPadding(0, dp(18), 0, dp(6));
        return v;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        view.setPadding(0, dp(4), 0, dp(4));
        return view;
    }

    private EditText input(String hint, String value, boolean secret) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(false);
        input.setMinLines(secret ? 2 : 1);
        input.setInputType(secret ? (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD) : InputType.TYPE_CLASS_TEXT);
        return input;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void createOrderThenOpen() {
        String baseUrl = trimTrailingSlash(baseUrlInput.getText().toString().trim());
        String bookingId = bookingIdInput.getText().toString().trim();
        String token = bearerTokenInput.getText().toString().trim();
        if (baseUrl.isEmpty() || bookingId.isEmpty() || token.isEmpty()) {
            log("Missing base URL, booking ID, or bearer token.");
            return;
        }

        setBusy(true);
        new Thread(() -> {
            try {
                log("POST " + baseUrl + "/_serverFn/" + CREATE_ORDER_SERVER_FN_ID);
                Order order = callCreateOrder(baseUrl, bookingId, token);
                log("Order API result: keyPrefix=" + redactKey(order.keyId) + ", orderId=" + order.orderId + ", amount=" + order.amount + ", currency=" + order.currency);
                runOnUiThread(() -> openCheckout(order));
            } catch (Exception e) {
                log("ERROR createOrder: " + e.getMessage());
            } finally {
                runOnUiThread(() -> setBusy(false));
            }
        }).start();
    }

    private void openManual() {
        String key = manualKeyInput.getText().toString().trim();
        String orderId = manualOrderInput.getText().toString().trim();
        int amount = parseAmount(manualAmountInput.getText().toString().trim());
        if (key.isEmpty() || orderId.isEmpty() || amount <= 0) {
            log("Manual fallback requires key_id, order_id, and amount paise.");
            return;
        }
        openCheckout(new Order(key, orderId, amount, "INR", bookingIdInput.getText().toString().trim()));
    }

    private Order callCreateOrder(String baseUrl, String bookingId, String bearerToken) throws Exception {
        URL url = new URL(baseUrl + "/_serverFn/" + CREATE_ORDER_SERVER_FN_ID);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("x-tsr-serverFn", "true");
        conn.setRequestProperty("Authorization", bearerToken.startsWith("Bearer ") ? bearerToken : "Bearer " + bearerToken);

        String body = tanstackPayloadForBooking(bookingId).toString();
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }

        int status = conn.getResponseCode();
        String response = readAll(status >= 400 ? conn.getErrorStream() : conn.getInputStream());
        log("Order API HTTP " + status + ", content-type=" + conn.getContentType());
        if (status >= 400) throw new IllegalStateException(response);

        JSONObject decoded = decodeTanstackResponse(response);
        return new Order(
                decoded.getString("keyId"),
                decoded.getString("orderId"),
                decoded.getInt("amount"),
                decoded.optString("currency", "INR"),
                decoded.optString("bookingId", bookingId)
        );
    }

    private JSONObject tanstackPayloadForBooking(String bookingId) throws Exception {
        JSONObject bookingValue = new JSONObject()
                .put("t", 10)
                .put("i", 1)
                .put("p", new JSONObject()
                        .put("k", new JSONArray().put("bookingId"))
                        .put("v", new JSONArray().put(new JSONObject().put("t", 1).put("s", bookingId))))
                .put("o", 0);
        JSONObject dataValue = new JSONObject()
                .put("t", 10)
                .put("i", 0)
                .put("p", new JSONObject()
                        .put("k", new JSONArray().put("data"))
                        .put("v", new JSONArray().put(bookingValue)))
                .put("o", 0);
        return new JSONObject().put("t", dataValue).put("f", 63).put("m", new JSONArray());
    }

    private JSONObject decodeTanstackResponse(String response) throws Exception {
        String jsonText = extractJson(response);
        JSONObject root = new JSONObject(jsonText);
        Object decoded = decodeValue(root.has("t") && root.has("f") ? root.getJSONObject("t") : root);
        if (!(decoded instanceof JSONObject)) throw new IllegalStateException("Decoded response is not an object: " + response);
        JSONObject obj = (JSONObject) decoded;
        if (!obj.has("keyId") && response.contains("rzp_")) {
            throw new IllegalStateException("Could not decode TanStack response, raw contained a key but no keyId field was decoded.");
        }
        return obj;
    }

    private Object decodeValue(JSONObject node) throws Exception {
        int type = node.optInt("t", -1);
        if (type == 0) return node.get("s");
        if (type == 1 || type == 3) return node.optString("s");
        if (type == 4) return node.optBoolean("s");
        if (type == 10 || type == 11) {
            JSONObject out = new JSONObject();
            JSONObject props = node.getJSONObject("p");
            JSONArray keys = props.getJSONArray("k");
            JSONArray values = props.getJSONArray("v");
            for (int i = 0; i < keys.length(); i++) {
                out.put(keys.getString(i), decodeValue(values.getJSONObject(i)));
            }
            return out;
        }
        if (type == 7) {
            JSONArray values = node.getJSONArray("a");
            JSONArray out = new JSONArray();
            for (int i = 0; i < values.length(); i++) out.put(decodeValue(values.getJSONObject(i)));
            return out;
        }
        throw new IllegalStateException("Unsupported Seroval node type " + type + ": " + node);
    }

    private String extractJson(String response) {
        String trimmed = response.trim();
        if (trimmed.startsWith("{")) return trimmed;
        int first = trimmed.indexOf('{');
        int last = trimmed.lastIndexOf('}');
        if (first >= 0 && last > first) return trimmed.substring(first, last + 1);
        return trimmed;
    }

    private void openCheckout(Order order) {
        try {
            Checkout checkout = new Checkout();
            checkout.setKeyID(order.keyId);

            JSONObject options = new JSONObject();
            options.put("key", order.keyId);
            options.put("name", "Urban Wash");
            options.put("description", "Official Android SDK isolation");
            options.put("order_id", order.orderId);
            options.put("currency", order.currency);
            options.put("amount", order.amount);
            options.put("prefill", new JSONObject());
            options.put("notes", new JSONObject()
                    .put("booking_id", order.bookingId)
                    .put("source", "android_official_sdk_isolation"));
            options.put("theme", new JSONObject().put("color", "#FF6B1A"));

            log("Checkout.open payload keys: " + keys(options));
            log("Checkout.open redacted: keyPrefix=" + redactKey(order.keyId) + ", orderId=" + order.orderId + ", amount=" + order.amount + ", hasConfig=" + options.has("config"));
            checkout.open(this, options);
        } catch (Exception e) {
            log("ERROR Checkout.open: " + e.getMessage());
        }
    }

    @Override
    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
        log("PAYMENT SUCCESS paymentId=" + razorpayPaymentId + ", orderId=" + paymentData.getOrderId());
        log("PaymentData=" + String.valueOf(paymentData.getData()));
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData paymentData) {
        log("PAYMENT ERROR code=" + code + ", description=" + description);
        if (paymentData != null) log("PaymentData=" + String.valueOf(paymentData.getData()));
    }

    private String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line).append('\n');
        }
        return out.toString();
    }

    private String keys(JSONObject object) {
        StringBuilder builder = new StringBuilder("[");
        Iterator<String> iterator = object.keys();
        while (iterator.hasNext()) {
            if (builder.length() > 1) builder.append(", ");
            builder.append(iterator.next());
        }
        return builder.append(']').toString();
    }

    private String redactKey(String key) {
        if (key == null || key.length() < 8) return "<missing>";
        return key.substring(0, 8) + "…" + key.substring(key.length() - 4);
    }

    private String trimTrailingSlash(String value) {
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private int parseAmount(String value) {
        try { return Integer.parseInt(value); } catch (Exception ignored) { return 0; }
    }

    private void setBusy(boolean busy) {
        if (createAndPayButton != null) createAndPayButton.setEnabled(!busy);
        if (manualPayButton != null) manualPayButton.setEnabled(!busy);
    }

    private void log(String line) {
        runOnUiThread(() -> {
            String next = "• " + line + "\n";
            if (logView == null) return;
            logView.append(next);
            android.util.Log.d("RZP_ISOLATION", line);
        });
    }

    private static final class Order {
        final String keyId;
        final String orderId;
        final int amount;
        final String currency;
        final String bookingId;

        Order(String keyId, String orderId, int amount, String currency, String bookingId) {
            this.keyId = keyId;
            this.orderId = orderId;
            this.amount = amount;
            this.currency = currency;
            this.bookingId = bookingId;
        }
    }
}