// Netz-Wächter: echte App gegen ein Fake-DATEVconnect auf 127.0.0.1, Chromium-NetLog mitschreiben.
// Bricht ab, wenn irgendetwas anderes als DATEV angefragt wird, DATEV etwas anderes als GET bekommt,
// die App sich anmeldet oder Cookies mitschickt, eine Internet-Adresse oder Daten in der Adresse durchgehen
// oder Mandantendaten außerhalb von protokoll.csv / ausgang\ auf der Platte landen.
// Start: npm run pruefe:netz   (läuft auch im Release-Workflow auf Windows)
import { _electron as electron } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEERLAUF_MS = Number(process.env.KH_LEERLAUF_MS || 20000);
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "OK  " : "FAIL"} ${text}`); if (!ok) fehler++; };

// ---- Fake-DATEVconnect aus den Demodaten; Antworten absichtlich cachebar ----
const d = JSON.parse(fs.readFileSync(path.join(WURZEL, "electron", "demodaten.json"), "utf8"));
const methoden = new Set();
let mitAnmeldung = 0, falschePfade = 0;
const server = http.createServer((req, res) => {
  methoden.add(req.method);
  if (req.headers.cookie || req.headers.authorization) mitAnmeldung++;
  if (!req.url.startsWith("/datev/api/")) falschePfade++;
  const u = new URL(req.url, "http://x");
  let p = u.pathname, wert;
  if (p.startsWith("/datev/api/master-data/v1")) {
    p = p.slice("/datev/api/master-data/v1".length);
    if (p === "/version") wert = { version: "fake" };
    else if (p.startsWith("/addressees/")) wert = d.addressees[decodeURIComponent(p.slice(12))];
    else wert = d["master-data"]?.[p];
  } else if (p.startsWith("/datev/api/order-management/v1")) {
    wert = d["order-management"]?.[p.slice("/datev/api/order-management/v1".length)];
    if (Array.isArray(wert) && u.searchParams.has("top")) { const s = +u.searchParams.get("skip") || 0; wert = wert.slice(s, s + +u.searchParams.get("top")); }
  }
  if (wert === undefined) { res.writeHead(404); return res.end(); }
  // absichtlich cachebar und mit Cookie: Beides darf die App weder speichern noch zurückschicken
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "Set-Cookie": "sitzung=geheim; Path=/" });
  res.end(JSON.stringify(wert));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;

const daten = fs.mkdtempSync(path.join(os.tmpdir(), "kh-netz-"));
const netlog = path.join(os.tmpdir(), `kh-netlog-${Date.now()}.json`);
fs.writeFileSync(path.join(daten, "einstellungen.json"), JSON.stringify({ datevconnect: `http://127.0.0.1:${port}/datev/api/master-data/v1`, demo: false, versand: "eml" }));
const args = [`--log-net-log=${netlog}`, "--net-log-capture-mode=Everything", WURZEL];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");

const app = await electron.launch({ args, cwd: WURZEL, env: { ...process.env, KH_DATEN: daten, KH_TEST: "1", KH_OHNE_MICA: "1" } });
try {
  const seite = await app.firstWindow();
  await seite.waitForSelector("tr[data-nummer]", { timeout: 30000 });
  pruefe((await seite.$$("tr[data-nummer]")).length === 25, "Scan über Fake-DATEVconnect");

  // Entwurf als .eml anlegen
  await seite.click('tr[data-nummer="10006"] button[role=checkbox]');
  await seite.click("[data-knopf=anschreiben]");
  await seite.waitForSelector("[data-empfaenger]");
  await seite.click("#vorlage");
  await seite.click("[role=option]:has-text('Unterlagen Einkommensteuer')");
  await seite.click("[data-knopf=erstellen]");
  await seite.waitForSelector("text=als .eml-Datei gespeichert", { timeout: 15000 });
  pruefe(fs.readdirSync(path.join(daten, "ausgang")).length === 1, ".eml-Entwurf angelegt");

  // Abflussversuche aus der Oberfläche müssen scheitern
  const v = await seite.evaluate(async () => {
    const r = {};
    try { await fetch("https://example.com/abfluss"); r.fetch = false; } catch { r.fetch = true; }
    r.bild = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(false); i.onerror = () => ok(true); i.src = "https://example.org/p.png"; });
    try { window.open("https://example.com/"); } catch { /* egal */ }
    r.node = typeof require === "undefined" && typeof process === "undefined";
    return r;
  });
  await seite.evaluate(() => { location.href = "https://example.net/"; }).catch(() => {});
  await seite.waitForTimeout(1500);
  pruefe(v.fetch && v.bild, "fetch und Bild nach außen blockiert");
  pruefe(v.node, "Oberfläche ohne Node-Zugriff");
  pruefe(seite.url().startsWith("app://") && app.windows().length === 1, "Navigation und neue Fenster blockiert");

  // DATEV-Adresse über die Schnittstelle verbiegen: Daten im Pfad und Internet-Adresse müssen scheitern
  const ein = await seite.evaluate(async (p) => {
    const r = {};
    try { await window.kh.speichereEinstellungen({ datevconnect: `http://127.0.0.1:${p}/LEAK/10001-Muster/master-data/v1` }); r.pfad = false; } catch { r.pfad = true; }
    await window.kh.speichereEinstellungen({ datevconnect: "http://93.184.215.14/datev/api/master-data/v1" });
    const s = await window.kh.status();
    r.extern = !s.datev && /nicht im eigenen Netz/.test(s.meldung || "");
    await window.kh.speichereEinstellungen({ datevconnect: `http://127.0.0.1:${p}/datev/api/master-data/v1` });
    r.zurueck = (await window.kh.status()).datev;
    return r;
  }, port);
  pruefe(ein.pfad, "Adresse mit fremdem Pfad abgelehnt");
  pruefe(ein.extern, "Internet-Adresse: keine Verbindung aufgebaut");
  pruefe(ein.zurueck, "zurück auf DATEVconnect im eigenen Netz");

  await seite.waitForTimeout(LEERLAUF_MS); // verspätete Hintergrundanfragen abwarten
} finally {
  await app.close();
  server.close();
}

// ---- Auswertung NetLog ----
let text = fs.readFileSync(netlog, "utf8").trim(), log;
try { log = JSON.parse(text); } catch { log = JSON.parse(text.replace(/,?\s*$/, "") + "]}"); }
const lokal = (h) => /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/i.test(h);
const fremd = new Set();
for (const e of log.events) {
  const p = e.params || {};
  for (const u of [p.url, p.original_url, p.location].filter((x) => typeof x === "string")) {
    if (/^(app|file|data|blob|devtools|chrome):/.test(u)) continue;
    try { if (!lokal(new URL(u).hostname)) fremd.add(u.replace(/\?.*$/, "")); } catch { fremd.add(u); }
  }
  if (typeof p.host === "string") {
    const h = p.host.includes("://") ? new URL(p.host).hostname : p.host.replace(/:\d+$/, "");
    if (!lokal(h)) fremd.add("DNS/Verbindung: " + p.host);
  }
}
pruefe(fremd.size === 0, `keine Anfrage außer DATEVconnect${fremd.size ? ": " + [...fremd].join(", ") : ""}`);
pruefe([...methoden].every((m) => m === "GET"), `DATEVconnect bekommt nur GET (${[...methoden]})`);
pruefe(mitAnmeldung === 0, `keine Anmeldung, keine Cookies an DATEV (${mitAnmeldung})`);
pruefe(falschePfade === 0, `nur DATEV-Pfade angefragt (${falschePfade} fremde)`);

// ---- Mandantendaten auf der Platte nur in protokoll.csv und ausgang\ ----
const namen = d["master-data"]["/clients"].map((c) => c.name).filter((n) => n && n.length >= 6);
const liste = (o, p = "") => fs.readdirSync(o, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? liste(path.join(o, e.name), p + e.name + "/") : [p + e.name]);
const funde = liste(daten).filter((f) => f !== "protokoll.csv" && !f.startsWith("ausgang/")).filter((f) => {
  try { const b = fs.readFileSync(path.join(daten, f)); return [...namen, "sitzung"].some((n) => b.includes(n)); } catch { return false; }
});
pruefe(funde.length === 0, `keine Mandantendaten und kein DATEV-Cookie in Chromium-Ablagen${funde.length ? ": " + funde.join(", ") : ""}`);

fs.rmSync(netlog, { force: true });
fs.rmSync(daten, { recursive: true, force: true });
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : "\nNetz-Wächter: alles dicht");
process.exit(fehler ? 1 : 0);
