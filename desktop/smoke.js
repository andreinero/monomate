// Dev check only (not packaged): opens the app, plays as Black vs Pip (so the engine must move),
// logs page errors and saves screenshots.
const { app, BrowserWindow } = require('electron');
const out = process.argv[2];
app.whenReady().then(async () => {
  require('./main.js');
  await new Promise((r) => setTimeout(r, 1500));
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[page]', msg.slice(0, 200)); });
  await new Promise((r) => setTimeout(r, 5000));
  require('fs').writeFileSync(out + '/d1.png', (await win.webContents.capturePage()).toPNG());
  await win.loadURL('http://localhost:17420/game?mode=bot&bot=pip&color=b&tc=none');
  await new Promise((r) => setTimeout(r, 9000));
  require('fs').writeFileSync(out + '/d2.png', (await win.webContents.capturePage()).toPNG());
  app.quit();
});
