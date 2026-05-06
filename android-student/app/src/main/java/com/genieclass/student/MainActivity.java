package com.genieclass.student;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * 과제 음성 녹음·퀴즈 등 WebView 미디어 권한을 처리하고, 마이크 권한을 런타임에 요청합니다.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "GenieStudent";
    private static final int PERMISSION_REQUEST_CODE = 200;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestRequiredPermissions();
        setupWebChromeClient();
    }

    private void setupWebChromeClient() {
        try {
            this.bridge.getWebView().setWebChromeClient(
                new BridgeWebChromeClient(this.bridge) {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        Log.d(TAG, "WebView 권한: " + java.util.Arrays.toString(request.getResources()));
                        runOnUiThread(() -> request.grant(request.getResources()));
                    }
                }
            );
            Log.d(TAG, "WebView 권한 핸들러 설정 완료");
        } catch (Exception e) {
            Log.e(TAG, "WebView 권한 핸들러 설정 실패", e);
        }
    }

    private void requestRequiredPermissions() {
        String[] permissions = {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA
        };

        boolean needRequest = false;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest = true;
                break;
            }
        }

        if (needRequest) {
            Log.d(TAG, "런타임 권한 요청 중...");
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "권한 허용: " + permissions[i]);
                } else {
                    Log.w(TAG, "권한 거부: " + permissions[i]);
                }
            }
        }
    }
}
