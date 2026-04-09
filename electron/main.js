import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 모니터/터치 최적화 전용 하드웨어 가속 강제 (칠판 터치 지연 해소의 핵심)
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('disable-smooth-scrolling');
app.commandLine.appendSwitch('enable-features', 'TouchpadOverscrollHistoryNavigation'); // 스와이프 뒤로가기 방지를 위해 개별 컨트롤

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    autoHideMenuBar: true, // 상단 메뉴바 숨김 (일반 윈도우 창 모드)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.maximize(); // 칠판 화면에 꽉 차게 최대화 (닫기 버튼은 표시됨)

  // 웹 코드에서 일렉트론 앱인지 구분할 수 있도록 꼬리표 달기
  mainWindow.webContents.userAgent += " ElectronApp";

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // 라이브 웹사이트와 다이렉트로 연동 (이제 코드를 고쳐도 exe 빌드를 다시 할 필요 없음)
    mainWindow.loadURL('https://genieclass.vercel.app/');
  }

  // 브라우저의 기본 마우스/터치 기능 통제 방어 (Pinch-zoom, Swipe Navigation 방지)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
