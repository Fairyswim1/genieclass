import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 모니터/터치 최적화 전용 하드웨어 가속 강제 (칠판 터치 지연 해소의 핵심)
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('disable-smooth-scrolling');
app.commandLine.appendSwitch('enable-features', 'TouchpadOverscrollHistoryNavigation'); // 스와이프 뒤로가기 방지를 위해 개별 컨트롤

import http from 'http';
import fs from 'fs';

function serveLocalApp() {
  return new Promise((resolve) => {
    const distPath = path.join(__dirname, '../dist');
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0].split('#')[0];
      if (urlPath === '/') urlPath = '/index.html';
      
      let filePath = path.join(distPath, urlPath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(distPath, 'index.html'); // SPA fallback
      }
      
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.json': 'application/json'
      };
      
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    
    // 포트를 자동 할당받되 'localhost'로 열어야 파이어베이스 구글 로그인이 허용됨
    server.listen(0, 'localhost', () => {
      resolve(`http://localhost:${server.address().port}`);
    });
  });
}

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
    // prodUrl: file:// 대신 가상의 로컬 호스트 서버로 우회하여 브라우저랑 100% 동일한 환경 구성
    const localUrl = await serveLocalApp();
    mainWindow.loadURL(localUrl);
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
