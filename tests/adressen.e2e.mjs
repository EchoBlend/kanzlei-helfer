// Standard-Adressen pro Mandant: in der Mandantenliste festlegen, in der Serienmail benutzen und ändern,
// zurück auf DATEV-Standard, bleibt nach Neustart. Echte App mit Demodaten (ohne DATEV).
// Start: npm run pruefe:adressen   (läuft auch im Release-Workflow)
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "OK  " : "FAIL"} ${text}`); if (!ok) fehler++; };

const NR = 10004, DATEV_STD = "info@malerbetrieb-test.example", PRIVAT = "pinsel.privat@example.com";
const daten = fs.mkdtempSync(path.join(os.tmpdir(), "kh-adressen-"));
fs.writeFileSync(path.join(daten, "einstellungen.json"), JSON.stringify({ demo: true, versand: "eml", design: "hell" }));
const args = [WURZEL];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const starte = async () => {
  const app = await electron.launch({ args, cwd: WURZEL, env: { ...process.env, KH_DATEN: daten, KH_TEST: "1", KH_OHNE_MICA: "1" } });
  const seite = await app.firstWindow();
  await seite.waitForSelector(`tr[data-nummer="${NR}"]`, { timeout: 30000 });
  return { app, seite };
};
const zeile = (seite) => seite.locator(`tr[data-nummer="${NR}"]`);
const gespeichert = () => { try { return JSON.parse(fs.readFileSync(path.join(daten, "standard-adressen.json"), "utf8")); } catch { return {}; } };
const kreuz = (seite, adresse) => seite.locator(`[data-adresse="${adresse}"] button[role=checkbox]`);

let { app, seite } = await starte();
try {
  // 1. Mandantenliste: Standard festlegen (nur die private Adresse)
  await zeile(seite).hover();
  await zeile(seite).locator("[data-knopf=standard-adressen]").click();
  pruefe((await kreuz(seite, DATEV_STD).getAttribute("data-state")) === "checked", "Vorbelegung: DATEV-Standard angehakt");
  await kreuz(seite, DATEV_STD).click();
  await kreuz(seite, PRIVAT).click();
  await seite.click("[data-knopf=standard-speichern]");
  await seite.waitForSelector(`tr[data-nummer="${NR}"] [data-festgelegt]`);
  pruefe(JSON.stringify(gespeichert()[NR]) === JSON.stringify([PRIVAT]), `gespeichert: ${JSON.stringify(gespeichert())}`);
  pruefe((await zeile(seite).innerText()).includes(PRIVAT), "Spalte E-Mail zeigt den festgelegten Standard");

  // 2. Serienmail: Empfänger bekommt den festgelegten Standard
  await zeile(seite).locator("button[role=checkbox]").first().click();
  await seite.click("[data-knopf=anschreiben]");
  await seite.waitForSelector("[data-empfaenger]");
  const an = () => seite.getAttribute(`[data-empfaenger] li[data-nummer="${NR}"] [data-an]`, "data-an");
  pruefe((await an()) === PRIVAT, `Serienmail an festgelegten Standard (${await an()})`);

  // 3. In der Serienmail beide Adressen wählen und als Standard merken
  await seite.click(`[data-empfaenger] li[data-nummer="${NR}"] [data-knopf=adressen]`);
  await kreuz(seite, DATEV_STD).click();
  await seite.click("[data-knopf=als-standard]");
  await seite.waitForFunction((nr) => document.querySelector(`[data-empfaenger] li[data-nummer="${nr}"] [data-an]`)?.textContent?.includes("festgelegter Standard"), NR);
  pruefe([...(gespeichert()[NR] ?? [])].sort().join(";") === [DATEV_STD, PRIVAT].sort().join(";"), `„Als Standard merken“ speichert beide (${JSON.stringify(gespeichert()[NR])})`);
  await seite.keyboard.press("Escape");

  // 4. Entwurf anlegen: .eml geht an beide (BCC)
  await seite.click("#vorlage");
  await seite.click("[role=option]:has-text('Unterlagen Einkommensteuer')");
  await seite.click("[data-knopf=erstellen]");
  await seite.waitForSelector("text=als .eml-Datei gespeichert", { timeout: 15000 });
  const eml = fs.readdirSync(path.join(daten, "ausgang")).map((f) => fs.readFileSync(path.join(daten, "ausgang", f), "utf8")).join("\n");
  const bcc = /^Bcc: ([\s\S]*?)\r\nSubject:/m.exec(eml)?.[1] ?? "";
  pruefe(bcc.includes(DATEV_STD) && bcc.includes(PRIVAT), `Entwurf an beide Standard-Adressen (Bcc: ${bcc.replace(/\s+/g, " ")})`);
  await app.close();

  // 5. Neustart: Festlegung bleibt; dann zurück auf DATEV-Standard
  ({ app, seite } = await starte());
  pruefe(!!(await zeile(seite).locator("[data-festgelegt]").count()), "nach Neustart noch festgelegt");
  await zeile(seite).hover();
  await zeile(seite).locator("[data-knopf=standard-adressen]").click();
  await seite.click("[data-knopf=standard-datev]");
  await seite.waitForFunction((nr) => !document.querySelector(`tr[data-nummer="${nr}"] [data-festgelegt]`), NR);
  pruefe(!gespeichert()[NR], "DATEV-Standard verwenden: Festlegung gelöscht");
  pruefe((await zeile(seite).innerText()).includes(DATEV_STD), "Spalte E-Mail wieder mit DATEV-Standard");
  // nur Adressen, die DATEV beim Mandanten hat
  const fremd = await seite.evaluate((nr) => window.kh.setzeStandardAdressen(nr, ["fremd@example.org"]).then((r) => r[nr] ?? null), NR);
  pruefe(fremd === null, "fremde Adresse wird nicht gespeichert");
} finally {
  await app.close();
}
fs.rmSync(daten, { recursive: true, force: true });
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : "\nStandard-Adressen: alles gut");
process.exit(fehler ? 1 : 0);
