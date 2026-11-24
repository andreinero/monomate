// MonoMate for Windows: the app's web build, served from a tiny local server (Lichess login
// needs an http://localhost address to return to) and shown in a phone-shaped window.
const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'app');
// A fixed port keeps the same origin, so saved games and settings survive restarts.
const PORT = 17420;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
};

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = path.normalize(path.join(ROOT, url));
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      // Single-page app: unknown paths (/game, /oauth …) get index.html.
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  await serve().catch(() => {}); // already running (a second window) — reuse it
  const win = new BrowserWindow({
    width: 470,
    height: 940,
    minWidth: 360,
    minHeight: 640,
    title: 'MonoMate',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'app', 'favicon.ico'),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Open filling the screen; F11 toggles true full screen (no title bar or taskbar).
  win.maximize();
  win.show();
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // The Lichess login opens as a popup inside the app; other links go to the real browser.
    if (url.startsWith('https://lichess.org/oauth')) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 760, autoHideMenuBar: true } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(`http://localhost:${PORT}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
