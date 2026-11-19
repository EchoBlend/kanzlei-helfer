/**
 * Hülle des Kanzlei-Helfers (Muster aus Machbar, electron/haupt.cjs).
 *
 * - Fester Ursprung app://kanzlei-helfer/ und fester Datenordner %APPDATA%\Kanzlei-Helfer.
 * - Nur eine Instanz.
 * - Nichts geht hinaus: Das Fenster darf nur die App selbst laden; der einzige Netzweg
 *   ist DATEVconnect auf dem LIZENZSERVER (fest, siehe netz.cjs), und den fragt nur der Hauptprozess ab.
 */
const { app, BrowserWindow, Menu, crashReporter, dialog, ipcMain, nativeTheme, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { oeffneAblage } = require("./ablage.cjs");
const { demoQuelle, netzQuelle, ladeMandanten } = require("./datev.cjs");
const { erstelleMails } = require("./versand.cjs");
const { datevAdresse, sichererAbruf } = require("./netz.cjs");

const NAME = "Kanzlei-Helfer";
const URSPRUNG = "app://kanzlei-helfer/";
const WURZEL = path.join(__dirname, "..", "dist");
const GRUND = { hell: "#F6FAFB", dunkel: "#0B1316" };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; " +
  "connect-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";

// Fernsteuerung der fertigen App (Debug-Port) verweigern; die Tests nutzen die ungepackte App.
if (app.isPackaged && ["remote-debugging-port", "remote-debugging-pipe", "inspect", "inspect-brk"].some((s) => app.commandLine.hasSwitch(s))) app.exit(1);

app.setName(NAME);
// KH_DATEN nur für automatische Tests: eigener Ordner, Timos Daten bleiben unberührt.
app.setPath("userData", process.env.KH_DATEN || path.join(app.getPath("appData"), NAME));
// Abstürze: Bericht nur lokal im Datenordner – nie hochladen, nicht an die Windows-Fehlerberichterstattung
// (deren Speicherabbilder könnten Mandantendaten enthalten). Alte Berichte beim Start löschen.
try { fs.rmSync(app.getPath("crashDumps"), { recursive: true, force: true }); } catch { /* egal */ }
crashReporter.start({ uploadToServer: false, ignoreSystemCrashHandler: true });
// Kein HTTP-Cache: DATEV-Antworten (Mandantendaten) landen sonst je nach Server-Kopfzeilen
// in %APPDATA%\Kanzlei-Helfer\Cache auf der Platte.
app.commandLine.appendSwitch("disable-http-cache");
// Immer direkt zu DATEVconnect im Kanzlei-Netz: kein Proxy (auch kein Cloud-Proxy aus den Windows-Einstellungen)
// und keine automatische Proxy-Suche (WPAD/PAC).
app.commandLine.appendSwitch("no-proxy-server");
// Kein DNS-Vorabruf, kein WebRTC über UDP (STUN) – beides läge außerhalb von CSP und Anfrage-Sperre.
app.commandLine.appendSwitch("dns-prefetch-disable");
app.commandLine.appendSwitch("force-webrtc-ip-handling-policy", "disable_non_proxied_udp");
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

const ablage = oeffneAblage(app.getPath("userData"));
ablage.raeumeTmp(); // Reste eines abgebrochenen Outlook-Laufs (enthalten Adressen und Texte)
// DATEVconnect-Adresse wie eingetragen (leer → LIZENZSERVER).
const mitGueltigerAdresse = (e) => ({ ...e, datevconnect: datevAdresse(e.datevconnect) });
let einstellungen = mitGueltigerAdresse(ablage.einstellungen());
// Keine Windows-/Firmen-Anmeldung, an niemanden: Die Liste der Server, denen Chromium das Windows-Konto
// automatisch anbieten darf, enthält nur einen Namen, den es nicht geben kann (.invalid, RFC 2606).
// Zusätzlich fragt die App DATEV mit credentials: "omit" ab (netz.cjs).
app.commandLine.appendSwitch("auth-server-allowlist", "niemand.invalid");
let mandanten = null;
let stand = null;
let fenster = null;

let auftragswesen = null;
let hinweise = [];

const abruf = sichererAbruf((u, o) => net.fetch(u, o), () => datevUrsprung(),
  { nachschlagen: async (host) => (await net.resolveHost(host)).endpoints.map((e) => ({ address: e.address })) });
const quelle = () => (einstellungen.demo ? demoQuelle() : netzQuelle(abruf, einstellungen.datevconnect));
const datevUrsprung = () => { try { return new URL(einstellungen.datevconnect).origin; } catch { return null; } };
const DIST_URL = pathToFileURL(WURZEL).href + "/";
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
    // Rechtschreibprüfung aus: Sie lädt ihr Wörterbuch beim Start von Google (redirector.gvt1.com).
    // Outlook prüft die Rechtschreibung im Entwurf ohnehin.
    webPreferences: { preload: path.join(__dirname, "vorlade.cjs"), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  nativeTheme.on("updated", () => { try { fenster?.setTitleBarOverlay(fensterknoepfe()); } catch { /* Fenster zu */ } });
  fenster.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  fenster.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(URSPRUNG)) e.preventDefault(); });
  fenster.webContents.on("will-redirect", (e, url) => { if (!url.startsWith(URSPRUNG)) e.preventDefault(); });
  if (!process.env.KH_TEST) fenster.maximize();
  fenster.show();
  fenster.loadURL(URSPRUNG + "index.html");
}

app.on("second-instance", () => { if (fenster) { if (fenster.isMinimized()) fenster.restore(); fenster.focus(); } });
// Für jedes Fenster/jeden Inhalt: keine neuen Fenster, keine eingebetteten Webviews.
app.on("web-contents-created", (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-attach-webview", (e) => e.preventDefault());
});
// Nie nach Benutzername/Passwort fragen und keine gespeicherten Zugangsdaten senden.
app.on("login", (e, _wc, _details, _auth, weiter) => { e.preventDefault(); weiter(); });
// Auch kein Client-Zertifikat aus dem Windows-Speicher (Electron nähme sonst das erste).
app.on("select-client-certificate", (e, _wc, _url, _liste, weiter) => { e.preventDefault(); weiter(); });
app.on("will-quit", () => ablage.raeumeTmp());

app.whenReady().then(() => {
  // Namen nur über Windows auflösen (wie jedes Programm), nie per DNS-über-HTTPS an Google/Cloudflare & Co.
  app.configureHostResolver({ secureDnsMode: "off", enableBuiltInResolver: false });
  Menu.setApplicationMenu(null);
  // Rechtschreibprüfung ganz aus. Chromium lädt sonst selbst bei abgeschalteter Prüfung das Wörterbuch
  // der Systemsprache von Google (gemessen per NetLog). Keine Sprachen = kein Download; die Adresse
  // zeigt zur Sicherheit ins Leere auf diesem PC.
  session.defaultSession.setSpellCheckerDictionaryDownloadURL("http://127.0.0.1:9/");
  session.defaultSession.setSpellCheckerLanguages([]);
  session.defaultSession.setSpellCheckerEnabled(false);
  protocol.handle("app", async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "") || "index.html";
    const datei = path.normalize(path.join(WURZEL, rel));
    if (!datei.startsWith(WURZEL + path.sep) || !fs.existsSync(datei) || !fs.statSync(datei).isFile()) return new Response("Nicht gefunden", { status: 404 });
    const r = await net.fetch(pathToFileURL(datei).toString());
    const kopf = new Headers(r.headers);
    kopf.set("Content-Security-Policy", CSP);
    return new Response(r.body, { status: r.status, headers: kopf });
  });
  // Sperre: nur die App selbst (app://, Dateien aus dist) und DATEVconnect auf dem LIZENZSERVER (exakter Ursprung).
  session.defaultSession.webRequest.onBeforeRequest((d, antwort) => {
    const u = d.url;
    let erlaubt = u.startsWith(URSPRUNG) || u.startsWith(DIST_URL) || u.startsWith("data:") || u.startsWith("blob:");
    // DATEV nur vom Hauptprozess (keine webContentsId) und nur lesend
    if (!erlaubt && /^https?:/i.test(u) && d.method === "GET" && d.webContentsId === undefined) {
      try { erlaubt = new URL(u).origin === datevUrsprung(); } catch { erlaubt = false; }
    }
    antwort({ cancel: !erlaubt });
  });
  // Keine Rechte: Kamera, Mikrofon, Standort, Benachrichtigungen, Zwischenablage-Lesen, USB/HID/Seriell …
  session.defaultSession.setPermissionRequestHandler((_w, _p, ok) => ok(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setDevicePermissionHandler(() => false);
  session.defaultSession.on("will-download", (e) => e.preventDefault());
  oeffneFenster();
});
app.on("window-all-closed", () => app.quit());

// ---------- Schnittstelle zur Oberfläche ----------

const fehlerText = (f) => (f && f.message) || String(f);

/** Nur die eigene Oberfläche (app://kanzlei-helfer) darf die Schnittstelle benutzen. */
function handle(kanal, f) {
  ipcMain.handle(kanal, (e, ...a) => {
    if (!e.senderFrame || !e.senderFrame.url.startsWith(URSPRUNG)) throw new Error("Nicht erlaubt");
    return f(e, ...a);
  });
}

handle("status", async () => {
  let datev = true, meldung = null;
  try {
    // /version kennt nicht jede DATEVconnect-Fassung; dann reicht die Mandantenliste (nur Nummern) als Lebenszeichen.
    await quelle().stamm("/version").catch((f) => { if (f.status === 404) return quelle().stamm("/clients?select=number"); throw f; });
  } catch (f) { datev = false; meldung = fehlerText(f); }
  return { datev, meldung, einstellungen, version: app.getVersion(), daten: ablage.ordner, ausgang: ablage.ausgang, mica: MICA, auftragswesen, hinweise };
});

// Scan: alle Mandanten neu aus DATEV lesen und prüfen; Fortschritt geht als Ereignis „scan“ ans Fenster.
let laufenderScan = null;
handle("mandanten", async (e, neu) => {
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

handle("gruppen", () => ablage.gruppen());
handle("gruppen:speichern", (_e, liste) => ablage.speichereGruppen(liste));
handle("ansicht", () => ablage.ansicht());
handle("ansicht:speichern", (_e, a) => ablage.speichereAnsicht(a));

handle("einstellungen:speichern", (_e, neu) => {
  const alt = einstellungen;
  neu = neu && typeof neu === "object" ? neu : {};
  // Adresse: was der Benutzer einträgt (nur Browser-Adressen auf …/master-data/v1 gekürzt), keine Prüfung
  if ("datevconnect" in neu) neu = { ...neu, datevconnect: datevAdresse(neu.datevconnect) };
  einstellungen = mitGueltigerAdresse(ablage.speichereEinstellungen(neu));
  if (alt.demo !== einstellungen.demo || alt.datevconnect !== einstellungen.datevconnect || alt.nurAktive !== einstellungen.nurAktive) mandanten = null;
  nativeTheme.themeSource = themenQuelle(einstellungen.design);
  return einstellungen;
});

handle("vorlagen", () => ablage.vorlagen());
handle("vorlagen:speichern", (_e, liste) => ablage.speichereVorlagen(liste));
handle("protokoll", () => ablage.protokoll());

// Anhänge: nur Dateien, die der Benutzer in dieser Sitzung selbst gewählt oder ins Fenster gezogen hat.
const freigegeben = new Set();
function dateiInfo(p) {
  const st = fs.statSync(p, { throwIfNoEntry: false });
  if (!st || !st.isFile()) return null;
  freigegeben.add(p);
  return { pfad: p, name: path.basename(p), groesse: st.size };
}
handle("dateien:waehlen", async () => {
  const r = await dialog.showOpenDialog(fenster, { title: "Anhänge auswählen", properties: ["openFile", "multiSelections"] });
  return r.canceled ? [] : r.filePaths.map(dateiInfo).filter(Boolean);
});
// Pfade kommen aus vorlade.cjs (webUtils.getPathForFile auf echten, ins Fenster gezogenen Dateien).
handle("dateien:info", (_e, pfade) => (Array.isArray(pfade) ? pfade : []).filter((p) => typeof p === "string" && path.isAbsolute(p)).map(dateiInfo).filter(Boolean));

/** Prüft einen Mail-Auftrag der Oberfläche gegen den letzten Scan: Adressen müssen die des Mandanten aus DATEV sein. */
function pruefeAuftrag(auftrag) {
  const text = (v, max) => typeof v === "string" && v.length <= max;
  if (!auftrag || auftrag.modus !== "entwurf" || !text(auftrag.vorlage, 500) || !Array.isArray(auftrag.mails) || auftrag.mails.length > 5000) throw new Error("Ungültiger Auftrag");
  const adressen = new Map((mandanten || []).map((m) => [m.nummer, new Set((m.emails || []).map((x) => x.adresse))]));
  const gut = [], schlecht = [];
  for (const m of auftrag.mails) {
    if (!m || !Number.isInteger(m.nummer) || !text(m.name, 500) || !text(m.betreff, 2000) || !text(m.text, 200000) ||
      !Array.isArray(m.an) || !m.an.every((a) => text(a, 320)) || !Array.isArray(m.anhaenge) || !m.anhaenge.every((p) => text(p, 4000))) throw new Error("Ungültiger Auftrag");
    const fremd = m.an.find((a) => !adressen.get(m.nummer)?.has(a));
    const anhang = m.anhaenge.find((p) => !freigegeben.has(p));
    if (fremd) schlecht.push({ nummer: m.nummer, ok: false, info: `Adresse gehört nicht zu Mandant ${m.nummer} in DATEV: ${fremd}`, anhaenge: [] });
    else if (anhang) schlecht.push({ nummer: m.nummer, ok: false, info: `Anhang nicht freigegeben: ${path.basename(anhang)}`, anhaenge: [] });
    else gut.push(m);
  }
  return { gut, schlecht };
}

handle("mails", async (_e, auftrag) => {
  const { gut, schlecht } = pruefeAuftrag(auftrag);
  const versand = einstellungen.demo && einstellungen.versand === "outlook" ? "eml" : einstellungen.versand;
  const erg = [...(gut.length ? await erstelleMails({ modus: "entwurf", mails: gut }, { versand, ausgang: ablage.ausgang, tmp: ablage.tmp }) : []), ...schlecht];
  const zeit = new Date().toLocaleString("de-DE");
  const modus = versand === "eml" ? "eml" : "entwurf";
  ablage.protokolliere(erg.map((e) => {
    const m = auftrag.mails.find((x) => x.nummer === e.nummer) || {};
    return { Zeit: zeit, Modus: modus, Vorlage: auftrag.vorlage, Mandantennr: m.nummer, Mandant: m.name, An: [].concat(m.an || []).join("; "), Betreff: m.betreff,
      Ergebnis: e.ok ? "ok" : `Fehler: ${e.info}`, Anhaenge: (e.anhaenge || []).join(", ") };
  }));
  return { versand, ergebnisse: erg };
});

handle("export", async (_e, auftrag) => {
  const name = path.basename(String(auftrag?.name || "Mandanten.csv")).replace(/[^\w .()-]/g, "_").replace(/(\.csv)?$/i, ".csv");
  const inhalt = String(auftrag?.inhalt ?? "");
  // Downloads statt Dokumente: „Dokumente“ wird bei vielen Windows-PCs automatisch mit OneDrive abgeglichen.
  const r = await dialog.showSaveDialog(fenster, { title: "Liste speichern", defaultPath: path.join(app.getPath("downloads"), name),
    filters: [{ name: "Excel (CSV)", extensions: ["csv"] }] });
  if (r.canceled || !r.filePath) return null;
  const wolke = [process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer]
    .filter(Boolean).some((o) => r.filePath.toLowerCase().startsWith(path.resolve(o).toLowerCase() + path.sep));
  if (wolke) {
    const w = await dialog.showMessageBox(fenster, { type: "warning", buttons: ["Abbrechen", "Trotzdem speichern"], defaultId: 0, cancelId: 0,
      title: "OneDrive-Ordner", message: "Dieser Ordner wird mit OneDrive abgeglichen.", detail: "Die Mandantenliste würde damit in die Cloud hochgeladen. Besser einen Ordner außerhalb von OneDrive wählen." });
    if (w.response !== 1) return null;
  }
  fs.writeFileSync(r.filePath, "\ufeff" + inhalt, "utf8");
  return r.filePath;
});

handle("ordner", (_e, welcher) => {
  const ziel = welcher === "ausgang" ? ablage.ausgang : ablage.ordner;
  fs.mkdirSync(ziel, { recursive: true });
  return shell.openPath(ziel);
});
