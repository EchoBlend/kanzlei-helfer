/**
 * Hülle des Kanzlei-Helfers (Muster aus Machbar, electron/haupt.cjs).
 *
 * - Fester Ursprung app://kanzlei-helfer/ und fester Datenordner %APPDATA%\Kanzlei-Helfer.
 * - Nur eine Instanz.
 * - Nichts geht hinaus: Das Fenster darf nur die App selbst laden; der einzige Netzweg
 *   ist die eingestellte DATEVconnect-Adresse, und die fragt nur der Hauptprozess ab.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { oeffneAblage } = require("./ablage.cjs");
const { demoQuelle, netzQuelle, ladeMandanten } = require("./datev.cjs");
const { erstelleMails } = require("./versand.cjs");

const NAME = "Kanzlei-Helfer";
const URSPRUNG = "app://kanzlei-helfer/";
const WURZEL = path.join(__dirname, "..", "dist");
const GRUND = { hell: "#F6FAFB", dunkel: "#0B1316" };

app.setName(NAME);
// KH_DATEN nur für automatische Tests: eigener Ordner, Timos Daten bleiben unberührt.
app.setPath("userData", process.env.KH_DATEN || path.join(app.getPath("appData"), NAME));
// Windows-Anmeldung (NTLM/Kerberos) gegenüber DATEVconnect. ponytail: "*" statt Hostliste —
// der Hauptprozess ruft ohnehin nur die eingestellte DATEVconnect-Adresse ab (Sperre unten).
app.commandLine.appendSwitch("auth-server-allowlist", "*");
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

const ablage = oeffneAblage(app.getPath("userData"));
let einstellungen = ablage.einstellungen();
let mandanten = null;
let stand = null;
let fenster = null;

let auftragswesen = null;
let hinweise = [];

const quelle = () => (einstellungen.demo ? demoQuelle() : netzQuelle((u, o) => net.fetch(u, o), einstellungen.datevconnect));
const datevUrsprung = () => { try { return new URL(einstellungen.datevconnect).origin; } catch { return null; } };
const themenQuelle = (d) => ({ hell: "light", dunkel: "dark" })[d] || "system";
// Windows 11 (ab 22H2, Build 22621) hat das Material „Mica“ – das Gegenstück zur macOS-Vibrancy.
const MICA = process.platform === "win32" && Number(require("node:os").release().split(".")[2]) >= 22621 && !process.env.KH_OHNE_MICA;
const TITELHOEHE = 52;
const fensterknoepfe = () => ({
  height: TITELHOEHE,
  color: MICA ? "#00000000" : nativeTheme.shouldUseDarkColors ? GRUND.dunkel : GRUND.hell,
  symbolColor: nativeTheme.shouldUseDarkColors ? "#E8EEF0" : "#1F2B30",
});

function oeffneFenster() {
  nativeTheme.themeSource = themenQuelle(einstellungen.design);
  fenster = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680, show: false,
    title: NAME, icon: path.join(__dirname, "..", "public", "icon.png"),
    // Eigene Titelleiste wie bei macOS-Apps: Inhalt bis oben, Windows-Knöpfe als Überlagerung
    titleBarStyle: "hidden", titleBarOverlay: fensterknoepfe(),
    ...(MICA ? { backgroundMaterial: "mica", backgroundColor: "#00000000" } : { backgroundColor: nativeTheme.shouldUseDarkColors ? GRUND.dunkel : GRUND.hell }),
    webPreferences: { preload: path.join(__dirname, "vorlade.cjs"), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  nativeTheme.on("updated", () => { try { fenster?.setTitleBarOverlay(fensterknoepfe()); } catch { /* Fenster zu */ } });
  fenster.webContents.session.setSpellCheckerLanguages(["de-DE"]);
  fenster.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  fenster.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(URSPRUNG)) e.preventDefault(); });
  if (!process.env.KH_TEST) fenster.maximize();
  fenster.show();
  fenster.loadURL(URSPRUNG + "index.html");
}

app.on("second-instance", () => { if (fenster) { if (fenster.isMinimized()) fenster.restore(); fenster.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle("app", (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "") || "index.html";
    const datei = path.normalize(path.join(WURZEL, rel));
    if (!datei.startsWith(WURZEL) || !fs.existsSync(datei)) return new Response("Nicht gefunden", { status: 404 });
    return net.fetch(pathToFileURL(datei).toString());
  });
  // Sperre: nur die App selbst und die eingestellte DATEVconnect-Adresse.
  session.defaultSession.webRequest.onBeforeRequest((d, antwort) => {
    const u = d.url;
    const erlaubt = u.startsWith(URSPRUNG) || u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:") ||
      u.startsWith("devtools:") || (datevUrsprung() && u.startsWith(datevUrsprung()));
    antwort({ cancel: !erlaubt });
  });
  session.defaultSession.setPermissionRequestHandler((_w, _p, ok) => ok(false));
  oeffneFenster();
});
app.on("window-all-closed", () => app.quit());

// ---------- Schnittstelle zur Oberfläche ----------

const fehlerText = (f) => (f && f.message) || String(f);

ipcMain.handle("status", async () => {
  let datev = true, meldung = null;
  try { await quelle().stamm("/version"); } catch (f) { datev = false; meldung = fehlerText(f); }
  return { datev, meldung, einstellungen, version: app.getVersion(), daten: ablage.ordner, ausgang: ablage.ausgang, mica: MICA, auftragswesen, hinweise };
});

// Scan: alle Mandanten neu aus DATEV lesen und prüfen; Fortschritt geht als Ereignis „scan“ ans Fenster.
let laufenderScan = null;
ipcMain.handle("mandanten", async (e, neu) => {
  if (!mandanten || neu) {
    laufenderScan ??= ladeMandanten(quelle(), einstellungen.nurAktive, (fertig, gesamt) => e.sender.send("scan", { fertig, gesamt }))
      .finally(() => { laufenderScan = null; });
    const r = await laufenderScan;
    mandanten = r.mandanten;
    auftragswesen = r.auftragswesen;
    hinweise = r.hinweise;
    stand = new Date().toISOString();
  }
  return { stand, mandanten, auftragswesen, hinweise };
});

ipcMain.handle("gruppen", () => ablage.gruppen());
ipcMain.handle("gruppen:speichern", (_e, liste) => ablage.speichereGruppen(liste));
ipcMain.handle("ansicht", () => ablage.ansicht());
ipcMain.handle("ansicht:speichern", (_e, a) => ablage.speichereAnsicht(a));

ipcMain.handle("einstellungen:speichern", (_e, neu) => {
  const alt = einstellungen;
  einstellungen = ablage.speichereEinstellungen(neu || {});
  if (alt.demo !== einstellungen.demo || alt.datevconnect !== einstellungen.datevconnect || alt.nurAktive !== einstellungen.nurAktive) mandanten = null;
  nativeTheme.themeSource = themenQuelle(einstellungen.design);
  return einstellungen;
});

ipcMain.handle("vorlagen", () => ablage.vorlagen());
ipcMain.handle("vorlagen:speichern", (_e, liste) => ablage.speichereVorlagen(liste));
ipcMain.handle("protokoll", () => ablage.protokoll());

ipcMain.handle("dateien:waehlen", async () => {
  const r = await dialog.showOpenDialog(fenster, { title: "Anhänge auswählen", properties: ["openFile", "multiSelections"] });
  return r.canceled ? [] : r.filePaths.map(dateiInfo);
});
ipcMain.handle("dateien:info", (_e, pfade) => (pfade || []).filter((p) => fs.existsSync(p)).map(dateiInfo));
function dateiInfo(p) { return { pfad: p, name: path.basename(p), groesse: fs.statSync(p).size }; }

ipcMain.handle("mails", async (_e, auftrag) => {
  const versand = einstellungen.demo && einstellungen.versand === "outlook" ? "eml" : einstellungen.versand;
  const erg = await erstelleMails(auftrag, { versand, ausgang: ablage.ausgang, tmp: ablage.tmp });
  const zeit = new Date().toLocaleString("de-DE");
  const modus = versand === "eml" ? "eml" : auftrag.modus;
  ablage.protokolliere(erg.map((e) => {
    const m = auftrag.mails.find((x) => x.nummer === e.nummer) || {};
    return { Zeit: zeit, Modus: modus, Vorlage: auftrag.vorlage, Mandantennr: m.nummer, Mandant: m.name, An: [].concat(m.an || []).join("; "), Betreff: m.betreff,
      Ergebnis: e.ok ? "ok" : `Fehler: ${e.info}`, Anhaenge: e.anhaenge.join(", ") };
  }));
  return { versand, ergebnisse: erg };
});

ipcMain.handle("export", async (_e, { name, inhalt }) => {
  const r = await dialog.showSaveDialog(fenster, { title: "Liste speichern", defaultPath: path.join(app.getPath("documents"), name),
    filters: [{ name: "Excel (CSV)", extensions: ["csv"] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, "﻿" + inhalt, "utf8");
  return r.filePath;
});

ipcMain.handle("ordner:waehlen", async () => {
  const r = await dialog.showOpenDialog(fenster, { title: "Ordner für .eml-Dateien wählen", defaultPath: ablage.ausgang, properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});

ipcMain.handle("ordner", (_e, welcher) => {
  const ziel = welcher === "ausgang" ? ablage.ausgang : ablage.ordner;
  fs.mkdirSync(ziel, { recursive: true });
  return shell.openPath(ziel);
});
