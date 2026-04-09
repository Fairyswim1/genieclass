import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 모니터/터치 최적화 전용 하드웨어 가속 강제 (칠판 터치 지연 해소의 핵심)
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('disable-smooth-scrolling');
app.commandLine.appendSwitch('enable-features', 'TouchpadOverscrollHistoryNavigation'); // 스와이프 뒤로가기 방지를 위해 개별 컨트롤

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true, // 선생님 화면용이므로 기본 전체화면
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 개발 환경(Vite 로컬서버) vs 빌드 환경(dist 폴더) 분기 처리
  const devUrl = 'http://localhost:5173';
  const prodUrl = `file://${path.join(__dirname, '../dist/index.html')}`;

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(prodUrl);
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
