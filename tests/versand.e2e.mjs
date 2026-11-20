// Serienmail: Adresse bearbeiten, eigene Adresse ergänzen, weiterer Empfänger von Hand – alles muss als .eml ankommen
// (der Hauptprozess lässt Handeingaben nur zu, wenn sie als „von_hand“ gemeldet sind). Echte App mit Demodaten.
// Start: npm run pruefe:versand   (läuft auch im Release-Workflow)
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "OK  " : "FAIL"} ${text}`); if (!ok) fehler++; };

const NR = 10004, DATEV_STD = "info@malerbetrieb-test.example";
const BEARBEITET = "korrigiert@example.org", ERGAENZT = "zusatz@example.org", WEITERER = "extern@example.net";
const daten = fs.mkdtempSync(path.join(os.tmpdir(), "kh-versand-"));
fs.writeFileSync(path.join(daten, "einstellungen.json"), JSON.stringify({ demo: true, versand: "eml", design: "hell" }));
const args = [WURZEL];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const app = await electron.launch({ args, cwd: WURZEL, env: { ...process.env, KH_DATEN: daten, KH_TEST: "1", KH_OHNE_MICA: "1" } });
try {
  const seite = await app.firstWindow();
  await seite.waitForSelector(`tr[data-nummer="${NR}"]`, { timeout: 30000 });
  await seite.locator(`tr[data-nummer="${NR}"] button[role=checkbox]`).first().click();
  await seite.click("[data-knopf=anschreiben]");
  await seite.waitForSelector("[data-empfaenger]");
  await seite.click("#vorlage");
  await seite.click("[role=option]:has-text('Unterlagen Einkommensteuer')");

  // Adresse bearbeiten und eine eigene ergänzen
  await seite.click(`[data-empfaenger] li[data-nummer="${NR}"] [data-knopf=adressen]`);
  await seite.click(`[data-adresse="${DATEV_STD}"] ~ [data-knopf=adresse-bearbeiten]`);
  await seite.fill("[data-feld=adresse-bearbeiten]", BEARBEITET);
  await seite.keyboard.press("Enter");
  await seite.fill("[data-feld=adresse-neu]", ERGAENZT);
  await seite.click("[data-knopf=adresse-neu]");
  await seite.keyboard.press("Escape");
  const an = await seite.getAttribute(`[data-empfaenger] li[data-nummer="${NR}"] [data-an]`, "data-an");
  pruefe(an.includes(BEARBEITET) && an.includes(ERGAENZT) && !an.includes(DATEV_STD), `Empfängerliste zeigt bearbeitete und ergänzte Adresse (${an})`);

  // Weiterer Empfänger von Hand
  await seite.fill("[data-feld=weiterer-name]", "Frau Extern");
  await seite.fill("[data-feld=weiterer-adresse]", WEITERER);
  await seite.click("[data-knopf=weiterer-dazu]");
  await seite.waitForSelector("[data-empfaenger] li[data-nummer^='-']");

  await seite.click("[data-knopf=erstellen]");
  await seite.waitForSelector("text=als .eml-Datei gespeichert", { timeout: 15000 });
  const emls = fs.readdirSync(path.join(daten, "ausgang")).map((f) => fs.readFileSync(path.join(daten, "ausgang", f), "utf8"));
  const bcc = (e) => /^Bcc: ([\s\S]*?)\r\nSubject:/m.exec(e)?.[1].replace(/\s+/g, " ") ?? "";
  pruefe(emls.length === 2, `zwei Mails angelegt (${emls.length})`);
  pruefe(emls.some((e) => bcc(e).includes(BEARBEITET) && bcc(e).includes(ERGAENZT) && !bcc(e).includes(DATEV_STD)), "Mandant: bearbeitete und ergänzte Adresse in BCC, Original nicht");
  pruefe(emls.some((e) => bcc(e) === WEITERER), `weiterer Empfänger in BCC (${emls.map(bcc).join(" | ")})`);
  const protokoll = fs.readFileSync(path.join(daten, "protokoll.csv"), "utf8");
  pruefe(protokoll.includes(WEITERER) && protokoll.includes("ok"), "Protokoll enthält den weiteren Empfänger");
} finally {
  await app.close();
}
fs.rmSync(daten, { recursive: true, force: true });
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : "\nVersand und Adressen: alles gut");
process.exit(fehler ? 1 : 0);
