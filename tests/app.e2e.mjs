// Ende-zu-Ende: echte App (Electron) gegen den Fake-DATEVconnect (ohne Anmeldung; zum Schluss: App meldet sich nie an).
// Start: npm run pruefe:app   (startet den Fake selbst, eigener Datenordner, Timos Daten bleiben unberührt)
import { _electron as electron } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BILDER = process.env.KH_BILDER || path.join(os.tmpdir(), "kh-bilder");
const PORT = 58456;
fs.mkdirSync(BILDER, { recursive: true });

let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "OK  " : "FAIL"} ${text}`); if (!ok) fehler++; };
const bild = (seite, name) => seite.screenshot({ path: path.join(BILDER, name) });

function starteFake(port = PORT, mitAnmeldung = false) {
  const p = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(WURZEL, "tests", "fake-datevconnect.ps1"), "-Port", String(port), ...(mitAnmeldung ? ["-MitAnmeldung"] : [])], { windowsHide: true });
  return new Promise((ok) => p.stdout.on("data", (d) => { if (String(d).includes("auf http")) ok(p); }));
}

async function starteApp(daten, einstellungen) {
  fs.mkdirSync(daten, { recursive: true });
  if (einstellungen) fs.writeFileSync(path.join(daten, "einstellungen.json"), JSON.stringify(einstellungen));
  // Playwright-Bilder zeigen nur die Webseite; Mica (durchscheinend) ist dort nicht zu sehen → im Test aus
  const app = await electron.launch({ args: [WURZEL], cwd: WURZEL, env: { ...process.env, KH_DATEN: daten, KH_TEST: "1", KH_OHNE_MICA: "1" } });
  const seite = await app.firstWindow();
  await seite.emulateMedia({ colorScheme: null }); // Playwright erzwingt sonst hell; Farbe soll aus nativeTheme kommen
  await seite.waitForSelector("[data-verbindung]:not([data-verbindung=''])", { timeout: 20000 });
  return { app, seite };
}
const nummern = (seite) => seite.$$eval("tr[data-nummer]", (tr) => tr.map((t) => Number(t.dataset.nummer)));

const fake = await starteFake();
const daten = fs.mkdtempSync(path.join(os.tmpdir(), "kh-e2e-"));
try {
  // ---- 1. Scan über DATEVconnect (ohne Anmeldung) ----
  const basis = { datevconnect: `http://localhost:${PORT}/datev/api/master-data/v1`, demo: false, versand: "eml", design: "hell" };
  let { app, seite } = await starteApp(daten, basis);
  pruefe((await seite.getAttribute("[data-verbindung]", "data-verbindung")) === "ok", "DATEVconnect verbunden (ohne Anmeldung)");
  await seite.waitForSelector("tr[data-nummer]", { timeout: 20000 });
  const ampeln = Object.fromEntries(await seite.$$eval("tr[data-nummer]", (tr) => tr.map((t) => [t.dataset.nummer, t.querySelector("[data-ampel]")?.dataset.ampel])));
  pruefe(JSON.stringify([10001, 10002, 10003, 10004, 10006, 10007].map((n) => ampeln[n])) === JSON.stringify(["ok", "fehlt", "fehlt", "fehlt", "fehlt", "pruefen"]), "Ampeln der Testfälle");
  pruefe((await nummern(seite)).length === 25, `25 aktive Mandanten (${(await nummern(seite)).length})`);
  pruefe(await seite.isDisabled('tr[data-nummer="10003"] button[role=checkbox]'), "10003 ohne gültige E-Mail nicht wählbar");
  pruefe((await seite.textContent('tr[data-nummer="10004"]')).includes("Zuständigkeit"), "neue Prüfregel: Zuständigkeit fehlt bei 10004");
  await bild(seite, "1-mandanten-hell.png");

  // ---- 2. Neu scannen ----
  await seite.click("[data-knopf=scannen]");
  await seite.waitForSelector("text=25 Mandanten gescannt", { timeout: 20000 });
  pruefe(true, "Neu scannen mit Rückmeldung");

  // ---- 3. Filterzeile pro Spalte ----
  await seite.click("[data-knopf=filterzeile]");
  await seite.fill("[data-filter=ort]", "Dresden");
  const orte = await seite.$$eval("tr[data-nummer]", (tr) => tr.map((t) => t.textContent));
  pruefe(orte.length > 0 && orte.length < 25 && orte.every((t) => t.includes("Dresden")), `Spaltenfilter Ort = Dresden (${orte.length} Treffer)`);
  await bild(seite, "2-filterzeile-hell.png");
  await seite.click("[data-knopf=filterzeile]");
  pruefe((await nummern(seite)).length === 25, "Filterzeile aus → alle wieder da");

  // ---- 4. Gruppieren nach Leistungen (Mandant in jeder seiner Gruppen) ----
  await seite.click("[data-knopf=gruppieren]");
  await seite.click("[data-gruppieren=aufgabenbereiche]");
  await seite.waitForSelector("tr[data-gruppe='Lohn und Gehalt']");
  await seite.waitForTimeout(400);
  pruefe((await seite.$$('tr[data-nummer="10002"]')).length === 3, "10002 erscheint unter FIBU, Lohn und Jahresabschluss");
  await bild(seite, "3-gruppiert-hell.png");
  await seite.click("tr[data-gruppe='Finanzbuchführung'] button:has-text('Finanzbuchführung')");
  pruefe((await seite.$$('tr[data-nummer="10002"]')).length === 2, "Gruppe einklappen");
  await seite.click("[data-knopf=gruppieren]");
  await seite.click("[role=menuitemradio]:has-text('Nicht gruppieren')");
  await seite.waitForTimeout(400); // Menü schließt mit Animation

  // ---- 5. Spaltenauswahl ----
  await seite.click("[data-knopf=spalten]");
  await seite.waitForSelector("[data-spaltenwahl=zuletzt]");
  await seite.waitForTimeout(300);
  for (const s of ["zuletzt", "rechtsform"]) await seite.click(`[data-spaltenwahl=${s}] button[role=checkbox]`);
  await seite.keyboard.press("Escape");
  pruefe(!!(await seite.$("th[data-spalte=zuletzt]")) && !!(await seite.$("th[data-spalte=rechtsform]")), "Spalten zugeschaltet");
  pruefe((await seite.textContent('tr[data-nummer="10002"] ')).includes("GmbH"), "Rechtsform aus DATEV-Nachschlagetabelle");

  // ---- 6. Eigene Gruppe anlegen ----
  for (const nr of [10001, 10004]) await seite.click(`tr[data-nummer="${nr}"] button[role=checkbox]`);
  await seite.click("[data-knopf=zu-gruppe]");
  await seite.click("[data-menue=neue-gruppe]");
  await seite.fill("[data-feld=gruppenname]", "Test-Gruppe Lohn");
  await seite.click("[data-knopf=gruppe-sichern]");
  await seite.waitForSelector("[data-gruppe-nav='Test-Gruppe Lohn'][data-active=true]");
  pruefe(JSON.stringify(await nummern(seite)) === "[10001,10004]", "Gruppenansicht zeigt nur die zwei Mitglieder");
  const gruppenDatei = JSON.parse(fs.readFileSync(path.join(daten, "gruppen.json"), "utf8"));
  pruefe(gruppenDatei[0]?.name === "Test-Gruppe Lohn" && gruppenDatei[0].mitglieder.join() === "10001,10004", "gruppen.json gespeichert");
  await seite.click("[data-ansicht=mandanten]");

  // ---- 7. Serienmail mit Anhängen für alle + pro Mandant ----
  const anh = fs.mkdtempSync(path.join(os.tmpdir(), "kh-anh-"));
  const fuerAlle = path.join(anh, "Merkblatt Übersicht.pdf"), fuer10004 = path.join(anh, "10004_Test-Bescheid.pdf");
  fs.writeFileSync(fuerAlle, "%PDF-1.4 Merkblatt");
  fs.writeFileSync(fuer10004, "%PDF-1.4 Bescheid 10004");
  fs.writeFileSync(path.join(anh, "99999_fremd.pdf"), "x");
  await seite.click('tr[data-nummer="10006"] button[role=checkbox]');
  await seite.click("[data-knopf=anschreiben]");
  await seite.waitForSelector("[data-empfaenger]");
  await seite.click("#vorlage");
  await seite.click("[role=option]:has-text('Unterlagen Einkommensteuer')");
  const waehle = async (zone, dateien) => {
    await app.evaluate(({ dialog }, d) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: d }); }, dateien);
    await seite.click(`[data-ablage=${zone}] button:has-text('Dateien wählen')`);
    await seite.waitForSelector(`[data-ablage=${zone}] [data-datei="${path.basename(dateien[0])}"]`);
  };
  await waehle("alle", [fuerAlle]);
  await waehle("pro", [fuer10004, path.join(anh, "99999_fremd.pdf")]);
  const gruende = await seite.$$eval("[data-empfaenger] li", (li) => li.map((l) => l.dataset.grund));
  pruefe(JSON.stringify(gruende) === JSON.stringify(["kein eigener Anhang", "", "kein eigener Anhang"]), `Empfänger-Gründe ${JSON.stringify(gruende)}`);
  const vorschau = await seite.textContent("[data-vorschau]");
  pruefe(vorschau.includes("Sehr geehrter Herr Pinsel,") && vorschau.includes(String(new Date().getFullYear() - 1)) && vorschau.includes("Merkblatt Übersicht.pdf, 10004_Test-Bescheid.pdf"), "Vorschau mit Anrede, Vorjahr und beiden Anhängen");
  await bild(seite, "4-serienmail-hell.png");
  await seite.click("[data-knopf=erstellen]");
  await seite.waitForSelector("text=als .eml-Datei gespeichert", { timeout: 15000 });
  const aus = path.join(daten, "ausgang"), emls = fs.readdirSync(aus);
  pruefe(emls.length === 1 && emls[0].includes("_10004_"), `eine .eml für 10004 (${emls})`);
  const eml = fs.readFileSync(path.join(aus, emls[0]), "utf8");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  pruefe(eml.startsWith("X-Unsent: 1\r\nBcc: info@malerbetrieb-test.example"), ".eml-Kopf: X-Unsent und Empfänger");
  pruefe(eml.includes(b64("Merkblatt Übersicht.pdf")) && eml.includes(b64("10004_Test-Bescheid.pdf")) && eml.includes(Buffer.from("%PDF-1.4 Bescheid 10004").toString("base64")), ".eml enthält beide Anhänge mit Inhalt");

  // ---- 8. Protokoll + „Zuletzt angeschrieben“ ----
  await seite.click("[data-ansicht=protokoll]");
  await seite.waitForSelector("tr[data-protokoll='10004']");
  pruefe((await seite.textContent("tr[data-protokoll='10004']")).includes("10004_Test-Bescheid.pdf"), "Protokoll mit Anhängen");
  await seite.click("[data-ansicht=mandanten]");
  pruefe((await seite.textContent('tr[data-nummer="10004"]')).includes("Unterlagen Einkommensteuer"), "Spalte „Zuletzt angeschrieben“");

  // ---- 8b. Mehrere Adressen: GmbH über Gesellschafter, Regel + eigene Wahl ----
  pruefe((await seite.getAttribute('tr[data-nummer="10001"] [data-weitere-mails]', "data-weitere-mails")) === "1", "Tabelle zeigt weitere Mail bei 10001");
  await seite.click('tr[data-nummer="10002"] button[role=checkbox]');
  await seite.click('tr[data-nummer="10026"] button[role=checkbox]');
  await seite.click("[data-knopf=anschreiben]");
  await seite.waitForSelector("[data-empfaenger]");
  const an = (n) => seite.getAttribute(`[data-empfaenger] li[data-nummer="${n}"] [data-an]`, "data-an");
  pruefe(await an(10002) === "anna.muster@example.com;katrin.hartmann@example.com", `GmbH ohne Mail → Gesellschafter (${await an(10002)})`);
  pruefe(await an(10026) === "info.nowak-maschinenbau@example.com", "Standard-Adresse");
  await seite.click("[data-feld=ziel]");
  await seite.click("[data-ziel=alle]");
  pruefe((await an(10026)).split(";").length === 4, "Regel „Eigene + Gesellschafter“");
  await seite.click('[data-empfaenger] li[data-nummer="10026"] [data-knopf=adressen]');
  await seite.click('[data-adresse="petra.nowak@example.com"]');
  await seite.click('[data-adresse="info.nowak-maschinenbau@example.com"]');
  await bild(seite, "6-adresswahl-hell.png");
  await seite.keyboard.press("Escape");
  pruefe(await an(10026) === "buchhaltung.nowak-maschinenbau@example.com;ralf.nowak@example.com", `eigene Wahl pro Mandant (${await an(10026)})`);
  // ---- 8c. Durchgehen: Mail für einen Mandanten anpassen, Wert per Platzhalter-Knopf ----
  await seite.click("[data-knopf=anpassen]");
  await seite.click("#eigen-text");
  await seite.keyboard.press("Control+End");
  await seite.keyboard.type("\nPS für ");
  await seite.click("[data-anpassen] [data-platzhalter=Name]");
  await seite.click("[data-knopf=anpassen-fertig]");
  const angepasst = await seite.$$eval("[data-empfaenger] li", (li) => li.filter((l) => l.querySelector("[data-angepasst]")).length);
  pruefe(angepasst === 1 && (await seite.textContent("[data-vorschau]")).includes("PS für "), "eigene Fassung für einen Mandanten");
  await bild(seite, "7-durchgehen-hell.png");
  for (const n of [10002, 10026]) await seite.click(`[data-empfaenger] li[data-nummer="${n}"] button[aria-label$=entfernen]`);
  await seite.click("[data-ansicht=mandanten]");

  // ---- 9. Vorlage anlegen und löschen ----
  await seite.click("[data-ansicht=vorlagen]");
  await seite.click("[data-knopf=neue-vorlage]");
  await seite.fill("#v-name", "Test: Vollmacht anfordern");
  await seite.fill("#v-betreff", "Vollmacht für {{Name}}");
  await seite.fill("#v-text", "{{Anrede}}\n\nbitte senden Sie uns die Vollmacht zurück.\n\n{{Grussformel}}\n{{Signatur}}");
  await seite.click("[data-knopf=vorlage-speichern]");
  await seite.waitForSelector("[data-vorlage='Test: Vollmacht anfordern']");
  const vl = () => JSON.parse(fs.readFileSync(path.join(daten, "vorlagen.json"), "utf8"));
  pruefe(vl().length === 3 && vl()[2].betreff === "Vollmacht für {{Name}}", "Vorlage gespeichert (mit Umlaut)");
  await seite.click("[data-knopf=vorlage-loeschen]");
  await seite.click("[role=alertdialog] button:has-text('Löschen')");
  await seite.waitForSelector("[data-vorlage='Test: Vollmacht anfordern']", { state: "detached" });
  pruefe(vl().length === 2, "Vorlage gelöscht");

  // ---- 10. Einstellungen: Prüfregel aus, Demodaten an ----
  await seite.click("[data-ansicht=einstellungen]");
  pruefe((await seite.getAttribute("[data-auftragswesen]", "data-auftragswesen")) === "true", "Auftragswesen erkannt");
  await seite.click("#r-zustaendig");
  await seite.click("#e-demo");
  await bild(seite, "5-einstellungen-hell.png");
  await seite.click("[data-knopf=einstellungen-speichern]");
  await seite.waitForSelector("[data-verbindung=demo]");
  const e = JSON.parse(fs.readFileSync(path.join(daten, "einstellungen.json"), "utf8"));
  pruefe(e.demo === true && e.regeln.zustaendig === false, "Demodaten + abgeschaltete Regel gespeichert");
  await seite.click("[data-ansicht=mandanten]");
  await seite.waitForSelector('tr[data-nummer="10004"]');
  pruefe(!(await seite.textContent('tr[data-nummer="10004"]')).includes("Zuständigkeit"), "abgeschaltete Regel wirkt in der Tabelle");
  await app.close();

  // ---- 11. Neustart: Ansicht und Gruppen bleiben ----
  ({ app, seite } = await starteApp(daten));
  await seite.waitForSelector("tr[data-nummer]", { timeout: 20000 });
  pruefe(!!(await seite.$("th[data-spalte=zuletzt]")) && !!(await seite.$("[data-gruppe-nav='Test-Gruppe Lohn']")), "Spaltenauswahl und eigene Gruppe nach Neustart da");
  await app.close();

  // ---- 12. DATEVconnect nicht erreichbar ----
  ({ app, seite } = await starteApp(daten, { ...basis, datevconnect: "http://localhost:59999/datev/api/master-data/v1" }));
  await seite.waitForSelector("[role=alert]", { timeout: 20000 });
  pruefe((await seite.getAttribute("[data-verbindung]", "data-verbindung")) === "aus", "Fehlerbild bei toter Adresse");
  await app.close();

  // ---- 12b. Server verlangt Windows-Anmeldung → App meldet sich NICHT an ----
  const mitAnmeldung = await starteFake(PORT + 1, true);
  try {
    ({ app, seite } = await starteApp(daten, { ...basis, datevconnect: `http://localhost:${PORT + 1}/datev/api/master-data/v1` }));
    await seite.waitForSelector("[role=alert]", { timeout: 20000 });
    pruefe((await seite.textContent("[role=alert]")).includes("Anmeldung"), "keine Windows-Anmeldung: Server mit Anmeldung bleibt zu");
    await app.close();
  } finally { mitAnmeldung.kill(); }

  // ---- 13. Dunkel ----
  ({ app, seite } = await starteApp(daten, { ...basis, design: "dunkel" }));
  await seite.waitForSelector("tr[data-nummer]", { timeout: 20000 });
  await bild(seite, "1-mandanten-dunkel.png");
  await seite.click("[data-knopf=gruppieren]");
  await seite.click("[data-gruppieren=auftraege]");
  await seite.waitForSelector("tr[data-gruppe]");
  await seite.waitForTimeout(400);
  await bild(seite, "3-gruppiert-dunkel.png");
  await app.close();
} finally {
  fake.kill();
}
console.log(fehler ? `${fehler} Fehler` : "E2E bestanden", "· Bilder:", BILDER);
process.exit(fehler ? 1 : 0);
