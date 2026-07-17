# Razorpay Isolation Result

Fill this after physical-device testing.

## Device

- Phone model:
- Android version:
- Installed UPI apps:
- Sample APK build date:

## Packaged versions

```text
Paste `gradle :app:dependencies --configuration debugRuntimeClasspath | findstr /I razorpay` output here.
```

## Redacted order result

```text
keyPrefix=rzp_test_…, orderId=order_…, amount=…, currency=INR
```

## Screenshot

Attach screenshot of Razorpay payment methods.

## Runtime logs

```text
Paste RZP_ISOLATION / Razorpay / Checkout logcat lines here. Do not paste bearer tokens.
```

## Conclusion

Choose one:

- [ ] Urban Wash integration issue
- [ ] capacitor-razorpay plugin issue
- [ ] Official Razorpay Android SDK issue
- [ ] Merchant/account/order configuration issue

Reason:
