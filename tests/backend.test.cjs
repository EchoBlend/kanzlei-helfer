// node --test tests/  — Prüfregeln, Demo-Quelle, .eml-Aufbau, Protokoll
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pruefeIban, pruefeSteuerId } = require("../electron/pruefung.cjs");
const { demoQuelle, ladeMandanten } = require("../electron/datev.cjs");
const { baueEml, erstelleMails } = require("../electron/versand.cjs");
const { oeffneAblage } = require("../electron/ablage.cjs");

test("Prüfziffern", () => {
  assert.ok(pruefeIban("DE89 3704 0044 0532 0130 00"));
  assert.ok(!pruefeIban("DE89370400440532013001"));
  assert.ok(pruefeSteuerId("86095742719"));
  assert.ok(!pruefeSteuerId("86095742718"));
  assert.ok(!pruefeSteuerId("06095742719"));
});

test("Lücken der sieben Testfälle, Sammelabfragen verknüpft", async () => {
  const schritte = [];
  const { mandanten: m, auftragswesen } = await ladeMandanten(demoQuelle(), true, (f, g) => schritte.push([f, g]));
  const kurz = Object.fromEntries(m.filter((x) => x.nummer < 10010).map((x) => [x.nummer, x.abruffehler ? "abruf" : `${x.luecken}|${x.fehlerhaft}`]));
  assert.deepEqual(kurz, {
    10001: "|",
    10002: "email,iban|",
    10003: "telefon,geburtsdatum|email,steuerid,iban",
    10004: "steuernummer,finanzamt,zustaendig|",
    10006: "telefon,anschrift,briefanrede,geburtsdatum,steuernummer,finanzamt,steuerid,iban,zustaendig|",
    10007: "abruf",
  });
  const krümel = m.find((x) => x.nummer === 10002);
  assert.equal(krümel.rechtsform, "GmbH");
  assert.equal(krümel.ustid, "DE123456789");
  assert.deepEqual(krümel.aufgabenbereiche.map((a) => a.bereich).sort(), ["Finanzbuchführung", "Jahresabschluss", "Lohn und Gehalt"]);
  assert.ok(krümel.datevGruppen.includes("A-Mandant"));
  assert.equal(m.find((x) => x.nummer === 10004).anrede, "Sehr geehrter Herr Pinsel,");
  assert.equal(m.find((x) => x.nummer === 10001).auftraege.some((a) => a.art === "EST" && a.status === "in work"), true);
  assert.equal(auftragswesen, true);
  assert.deepEqual(schritte.at(-1), [m.length, m.length]);
  assert.equal(m.every((x) => x.status === "active"), true);
  assert.equal((await ladeMandanten(demoQuelle(), false)).mandanten.length, 27);
});

test("Mehrere E-Mails mit Herkunft, Beziehungen, Gesellschafter-Mails", async () => {
  const { mandanten: m } = await ladeMandanten(demoQuelle(), true);
  const nr = (n) => m.find((x) => x.nummer === n);
  const anna = nr(10001);
  assert.equal(anna.email, "anna.muster@example.com");
  assert.deepEqual(anna.emails.map((e) => [e.adresse, e.rolle, e.notiz, e.eigen]), [
    ["anna.muster@example.com", "Person", null, true], ["praxis@muster-physio.example", "Person", "geschäftlich (Praxis)", true]]);
  assert.ok(anna.beziehungen.includes("ist Gesellschafter von Bäckerei Krümel GmbH (10002)"));
  // GmbH ohne eigene Mail: erreichbar über die Gesellschafter, Lücke bleibt
  const kruemel = nr(10002);
  assert.equal(kruemel.email, null);
  assert.ok(kruemel.luecken.includes("email"));
  assert.deepEqual(kruemel.emails.map((e) => `${e.rolle}:${e.adresse}`), ["Gesellschafter:anna.muster@example.com", "Gesellschafter:katrin.hartmann@example.com"]);
  assert.deepEqual(kruemel.verbund, ["Bäckerei Krümel GmbH"]);
  // Einzelunternehmen: Inhaber privat + Unternehmen, Standard = Unternehmen
  const maler = nr(10004);
  assert.equal(maler.email, "info@malerbetrieb-test.example");
  assert.deepEqual(maler.emails.map((e) => `${e.rolle}:${e.notiz}`), ["Inhaber:privat", "Unternehmen:null"]);
  // Gesellschafter ohne eigenen Mandanten + Ansprechpartner doppelt → einmal
  const nowak = nr(10026);
  assert.deepEqual(nowak.emails.map((e) => e.adresse), ["info.nowak-maschinenbau@example.com", "buchhaltung.nowak-maschinenbau@example.com", "ralf.nowak@example.com", "petra.nowak@example.com"]);
  assert.ok(nowak.beziehungen.includes("Gesellschafter: Nowak, Ralf"));
  assert.ok(nr(10011).beziehungen.includes("ist Ehegatte von Hartmann, Katrin (10010)"));
});

test("Mail an mehrere Adressen", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  assert.match(baueEml({ an: ["a@example.com", "b@example.com"], betreff: "x", text: "y" }), /\r\nTo: a@example.com, b@example.com\r\n/);
  const erg = await erstelleMails({ modus: "entwurf", mails: [
    { nummer: 1, name: "A", an: ["a@example.com", "b@example.com"], betreff: "B", text: "T", anhaenge: [] },
    { nummer: 2, name: "B", an: ["a@example.com", "kaputt"], betreff: "B", text: "T", anhaenge: [] },
    { nummer: 3, name: "C", an: [], betreff: "B", text: "T", anhaenge: [] },
  ] }, { versand: "eml", ausgang: dir, tmp: dir });
  assert.deepEqual(erg.map((e) => e.ok), [true, false, false]);
});

test("Register nur bei Pflicht, Auftragswesen fehlt ohne Absturz", async () => {
  const { pruefeMandant } = require("../electron/pruefung.cjs");
  const rf = new Map([["GBR", { short_name: "GbR" }], ["GMBH", { short_name: "GmbH" }]]);
  const firma = (form) => [{ type: "legal_person", current_legal_form_id: form, eu_vat_id_number: "1", detail: { salutation: "x" } }];
  const z = { zustaendigkeiten: [{ employee_id: "e" }], rechtsformen: rf };
  assert.ok(!pruefeMandant({ type: "legal_person" }, firma("GBR"), z).luecken.includes("register"));
  assert.ok(pruefeMandant({ type: "legal_person" }, firma("GMBH"), z).luecken.includes("register"));
  const q = demoQuelle();
  const ohneEO = { stamm: q.stamm, auftrag: async () => { throw new Error("404"); } };
  const r = await ladeMandanten(ohneEO, true);
  assert.equal(r.auftragswesen, false);
  assert.ok(r.mandanten.length > 20);
});

test(".eml mit Anhängen und Umlauten", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  const a = path.join(dir, "Merkblatt Übersicht.pdf");
  fs.writeFileSync(a, "%PDF-1.4 Test");
  const eml = baueEml({ an: "x@example.com", betreff: "Prüfung", text: "Grüße\nZeile 2" }, [a]);
  assert.match(eml, /^X-Unsent: 1\r\nTo: x@example.com\r\n/);
  assert.match(eml, /multipart\/mixed/);
  assert.ok(eml.includes(Buffer.from("%PDF-1.4 Test").toString("base64")));
  assert.ok(eml.includes(Buffer.from("Merkblatt Übersicht.pdf").toString("base64")));

  const erg = await erstelleMails({ modus: "entwurf", mails: [
    { nummer: 1, name: "A", an: "a@example.com", betreff: "B", text: "T", anhaenge: [a] },
    { nummer: 2, name: "B", an: "kaputt", betreff: "B", text: "T", anhaenge: [] },
    { nummer: 3, name: "C", an: "c@example.com", betreff: "B", text: "T", anhaenge: [path.join(dir, "fehlt.pdf")] },
  ] }, { versand: "eml", ausgang: path.join(dir, "aus"), tmp: path.join(dir, "tmp") });
  assert.deepEqual(erg.map((e) => e.ok), [true, false, false]);
  assert.equal(fs.readdirSync(path.join(dir, "aus")).length, 1);
  await assert.rejects(erstelleMails({ modus: "x", mails: [] }, { versand: "eml" }));
});

test("Protokoll und Einstellungen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  const ab = oeffneAblage(dir);
  ab.protokolliere([{ Zeit: "1", Modus: "eml", Vorlage: "V", Mandantennr: 5, Mandant: 'Krümel "GmbH"; Test', An: "a@b.de", Betreff: "x", Ergebnis: "ok", Anhaenge: "a.pdf" }]);
  assert.deepEqual(ab.protokoll()[0].Mandant, 'Krümel "GmbH"; Test');
  assert.equal(ab.speichereEinstellungen({ versand: "quatsch", demo: 1 }).versand, "outlook");
  assert.equal(ab.einstellungen().demo, true);
  assert.equal(ab.vorlagen().length, 2);
});
