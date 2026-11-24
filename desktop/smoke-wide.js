// Dev check (not packaged): wide (full-screen) window, coach game, play a few moves by clicking, screenshot.
const { app, BrowserWindow } = require('electron');
const out = process.argv[2];
const fs = require('fs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  require('./main.js');
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  win.setSize(1600, 900);
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[page]', msg.slice(0, 200)); });
  await wait(3000);
  await win.loadURL('http://localhost:17420/game?mode=bot&bot=pip&color=w&tc=600%2B0');
  await wait(6000);
  // Find the board: the biggest square element.
  const box = await win.webContents.executeJavaScript(`(() => { let best=null; for (const el of document.querySelectorAll('div')) { const r = el.getBoundingClientRect(); if (Math.abs(r.width - r.height) < 2 && r.width > 200 && (!best || r.width > best.w)) best = {x:r.x,y:r.y,w:r.width}; } return best; })()`);
  console.log('board', JSON.stringify(box));
  const sq = box.w / 8;
  const at = (s) => ({ x: Math.round(box.x + (s.charCodeAt(0) - 97 + 0.5) * sq), y: Math.round(box.y + (8 - Number(s[1]) + 0.5) * sq) });
  const click = async (s) => { const p = at(s); win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await wait(60); win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await wait(300); };
  for (const [f, t] of [['e2', 'e4'], ['d2', 'd4'], ['g1', 'f3'], ['f1', 'c4'], ['e1', 'g1']]) {
    await click(f); await click(t); await wait(5000);
  }
  fs.writeFileSync(out + '/wide-bot.png', (await win.webContents.capturePage()).toPNG());
  // Resign, then open Game Review.
  const clickText = async (text) => {
    const p = await win.webContents.executeJavaScript(`(() => { window.confirm = () => true; const els = [...document.querySelectorAll('div')].filter((e) => e.childElementCount === 0 && e.textContent.trim().toUpperCase() === ${JSON.stringify(text)}); const e = els.at(-1); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    console.log('click', text, JSON.stringify(p));
    if (!p) return;
    win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await wait(60);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await wait(1500);
  };
  await clickText('RESIGN');
  await wait(1500);
  await clickText('GAME REVIEW');
  await wait(25000);
  fs.writeFileSync(out + '/wide-summary.png', (await win.webContents.capturePage()).toPNG());
  await clickText('START REVIEW  →');
  await wait(1500);
  for (let i = 0; i < 8; i++) { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' }); await wait(250); }
  await wait(1500);
  fs.writeFileSync(out + '/wide-review.png', (await win.webContents.capturePage()).toPNG());
  await win.loadURL('http://localhost:17420/game?mode=coach&color=w&coach=sage');
  await wait(6000);
  fs.writeFileSync(out + '/wide-coach.png', (await win.webContents.capturePage()).toPNG());
  win.setSize(470, 940);
  await wait(1500);
  fs.writeFileSync(out + '/narrow-coach.png', (await win.webContents.capturePage()).toPNG());
  app.quit();
});
