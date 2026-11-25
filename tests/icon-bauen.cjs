// Baut public/icon.png (512 px) aus demselben Zeichen wie in der App (Akte mit Haken, Petrol).
// Aufruf: npx electron tests/icon-bauen.cjs        → public/icon.png (Petrol)
//        npx electron tests/icon-bauen.cjs pink   → public/icon-pink.png
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const PINK = process.argv.includes("pink");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
  <rect x="1" y="1" width="30" height="30" rx="7" fill="${PINK ? "#BA2371" : "#00665E"}"/>
  <path d="M10 8.5h8.5l4 4V23a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 23V10A1.5 1.5 0 0 1 10 8.5Z" fill="none" stroke="#FCFEFE" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="m12.5 17 2.5 2.5 4.5-5" fill="none" stroke="#FCFEFE" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  await w.loadURL(`data:text/html,<body style="margin:0;background:transparent">${encodeURIComponent(SVG)}</body>`);
  await new Promise((r) => setTimeout(r, 300));
  const bild = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const ziel = path.join(__dirname, "..", "public", PINK ? "icon-pink.png" : "icon.png");
  fs.writeFileSync(ziel, bild.resize({ width: 512, height: 512 }).toPNG());
  console.log("geschrieben:", ziel, bild.getSize());
  app.quit();
});
