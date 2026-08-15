package com.urbanwash.partner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.urbanwash.push.UrbanwashNativeDiagnosticsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UrbanwashNativeDiagnosticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
