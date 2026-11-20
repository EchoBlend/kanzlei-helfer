// Formatierte Mails und verstellbare Bereiche: echte App mit Demodaten.
// Farbe + Bild in der Serienmail → .eml mit HTML (Farbe) und eingebettetem Bild (cid); Vorlage mit Farbe bleibt gespeichert;
// Spaltenbreite und Breite der Empfängerspalte lassen sich ziehen und bleiben nach Neustart.
// Start: npm run pruefe:editor   (läuft auch im Release-Workflow)
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? "OK  " : "FAIL"} ${text}`); if (!ok) fehler++; };

const daten = fs.mkdtempSync(path.join(os.tmpdir(), "kh-editor-"));
fs.writeFileSync(path.join(daten, "einstellungen.json"), JSON.stringify({ demo: true, versand: "eml", design: "hell" }));
const bild = path.join(daten, "logo.png");
fs.writeFileSync(bild, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M/AwMDAxMDAwMDAAAAOAgEB0MBiOgAAAABJRU5ErkJggg==", "base64"));
const args = [WURZEL];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");
const starte = async () => {
  const app = await electron.launch({ args, cwd: WURZEL, env: { ...process.env, KH_DATEN: daten, KH_TEST: "1", KH_OHNE_MICA: "1" } });
  const seite = await app.firstWindow();
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.waitForSelector('tr[data-nummer="10006"]', { timeout: 30000 });
  // Dateiauswahl für „Bild einfügen“ ohne Fenster: liefert das Testbild
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, bild);
  return { app, seite };
};
const breite = (seite, sel) => seite.$eval(sel, (e) => Math.round(e.getBoundingClientRect().width));
const zieheUm = async (seite, sel, dx) => {
  const b = await seite.locator(sel).boundingBox();
  await seite.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await seite.mouse.down();
  await seite.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 5 });
  await seite.mouse.up();
};

let { app, seite } = await starte();
try {
  // 1. Spaltenbreite ziehen
  const vorher = await breite(seite, "th[data-spalte=name]");
  await zieheUm(seite, "[data-spaltengriff=name]", 120);
  const nachher = await breite(seite, "th[data-spalte=name]");
  pruefe(nachher - vorher >= 100, `Spalte „Mandant“ breiter gezogen (${vorher} → ${nachher})`);

  // 2. Serienmail: Text färben, Bild einfügen
  await seite.click('tr[data-nummer="10006"] button[role=checkbox]');
  await seite.click("[data-knopf=anschreiben]");
  await seite.waitForSelector("[data-empfaenger]");
  await seite.click("#vorlage");
  await seite.click("[role=option]:has-text('Unterlagen Einkommensteuer')");
  const editor = seite.locator("#text");
  await editor.click();
  await seite.keyboard.press("Control+End");
  await seite.keyboard.press("Enter");
  await seite.keyboard.type("Wichtig");
  await seite.keyboard.down("Shift");
  for (let i = 0; i < "Wichtig".length; i++) await seite.keyboard.press("ArrowLeft");
  await seite.keyboard.up("Shift");
  await seite.click("[data-knopf=schriftfarbe]");
  await seite.click('[data-farbe="#FF0000"]');
  await seite.keyboard.press("End");
  await seite.click("[data-knopf=bild]");
  await seite.waitForSelector('#text img[src^="data:image/png"]');
  pruefe(await seite.locator('#text span[style*="color"]', { hasText: "Wichtig" }).count() === 1, "Text im Editor rot gefärbt");
  pruefe(await seite.locator('[data-vorschau] img[src^="data:image/png"]').count() === 1, "Vorschau zeigt das Bild");

  // 3. Rechte Spalte breiter ziehen
  const asideVorher = await breite(seite, "aside");
  await zieheUm(seite, '[data-teiler="Breite von Empfänger und Vorschau"]', -150);
  const asideNachher = await breite(seite, "aside");
  pruefe(asideNachher - asideVorher >= 120, `Empfänger/Vorschau breiter gezogen (${asideVorher} → ${asideNachher})`);

  // 4. .eml: HTML mit Farbe, eingebettetes Bild, Klartext
  await seite.click("[data-knopf=erstellen]");
  await seite.waitForSelector("text=als .eml-Datei gespeichert", { timeout: 15000 });
  const datei = fs.readdirSync(path.join(daten, "ausgang"))[0];
  const eml = fs.readFileSync(path.join(daten, "ausgang", datei), "utf8");
  const teil = (typ) => Buffer.from((new RegExp(`Content-Type: ${typ}; charset=utf-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n--`).exec(eml)?.[1] ?? "").replace(/\r\n/g, ""), "base64").toString("utf8");
  const html = teil("text/html"), text = teil("text/plain");
  const cid = /Content-ID: <([^>]+)>/.exec(eml)?.[1];
  pruefe(/multipart\/alternative/.test(eml) && /multipart\/related/.test(eml), "Mail mit Klartext und formatierter Fassung");
  pruefe(/<span style="color: #FF0000;?">Wichtig<\/span>/i.test(html), `HTML enthält die rote Schrift als Hex (${(/<span[^>]*>Wichtig/.exec(html) || [""])[0]})`);
  pruefe(!!cid && html.includes(`cid:${cid}`) && !html.includes("data:image"), "Bild eingebettet (cid), nicht als data:");
  pruefe(text.includes("Wichtig") && !/</.test(text), "Klartext ohne HTML");
  await app.close();

  // 5. Neustart: Breiten bleiben; Vorlage mit Farbe speichern und wieder öffnen
  ({ app, seite } = await starte());
  pruefe(Math.abs((await breite(seite, "th[data-spalte=name]")) - nachher) <= 2, "Spaltenbreite nach Neustart gleich");
  await seite.click("text=Vorlagen");
  await seite.click("[data-knopf=neue-vorlage]");
  await seite.fill("#v-name", "Farbtest");
  await seite.locator("#v-text").click();
  await seite.keyboard.type("Grün");
  await seite.keyboard.press("Control+A");
  await seite.click("[data-knopf=schriftfarbe]");
  await seite.click('[data-farbe="#00B050"]');
  await seite.click("[data-knopf=vorlage-speichern]");
  await seite.waitForSelector("text=Vorlage gespeichert");
  const vorlagen = JSON.parse(fs.readFileSync(path.join(daten, "vorlagen.json"), "utf8"));
  const v = vorlagen.find((x) => x.name === "Farbtest");
  pruefe(!!v && /color: (#00B050|rgb\(0, 176, 80\))/i.test(v.html ?? "") && v.text.trim() === "Grün", `Vorlage speichert Farbe und Klartext (${v?.html})`);
  await seite.click('[data-vorlage="Unterlagen Einkommensteuer anfordern"]');
  await seite.click('[data-vorlage="Farbtest"]');
  await seite.waitForFunction(() => document.querySelector("#v-text")?.textContent?.includes("Grün"), null, { timeout: 5000 }).catch(() => {});
  pruefe(await seite.locator('#v-text span[style*="color"]', { hasText: "Grün" }).count() === 1, `Vorlage öffnet mit Farbe (${await seite.locator("#v-text").innerHTML()})`);
} finally {
  await app.close();
}
fs.rmSync(daten, { recursive: true, force: true });
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : "\nEditor und Größen: alles gut");
process.exit(fehler ? 1 : 0);
