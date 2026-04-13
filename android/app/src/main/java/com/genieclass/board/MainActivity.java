package com.genieclass.board;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "GenieClass";
    private static final int PERMISSION_REQUEST_CODE = 200;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Android 런타임 권한 요청 (매니페스트만으로 부족, 반드시 필요)
        requestRequiredPermissions();

        // 2. Capacitor의 BridgeWebChromeClient를 확장하여 WebView 권한 요청 처리
        //    ※ 기존 BridgeWebChromeClient를 상속하므로 Capacitor JS 브리지는 정상 유지됨
        try {
            this.bridge.getWebView().setWebChromeClient(
                new BridgeWebChromeClient(this.bridge) {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        Log.d(TAG, "WebView 권한 요청: " + java.util.Arrays.toString(request.getResources()));
                        // 오디오/비디오 캡처 권한을 WebView에서 허용
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
        } else {
            Log.d(TAG, "모든 권한 이미 허용됨");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "권한 허용됨: " + permissions[i]);
                } else {
                    Log.w(TAG, "권한 거부됨: " + permissions[i]);
                }
            }
        }
    }
}
