/**
 * Prüfregeln und Datenblatt für Mandanten-Stammdaten (DATEVconnect master-data v1).
 *
 * Ein Mandant (client) verweist auf einen oder zwei Adressaten (Person und/oder
 * Unternehmen). Geprüft wird die Summe beider: Hat einer von beiden eine E-Mail,
 * gilt sie als vorhanden. Abgelaufene Einträge (currently_valid === false) zählen nicht.
 *
 * Ergebnis je Mandant: ein flaches Datenblatt (für Tabelle, Filter, Gruppen, Platzhalter)
 * plus `luecken` (fehlt ganz) und `fehlerhaft` (eingetragen, Format/Prüfziffer falsch).
 * Bewusst nicht übernommen (Datensparsamkeit): Konfession, SV- und Ausweisnummern.
 */

const FELDER = ["email", "telefon", "anschrift", "briefanrede", "geburtsdatum", "steuernummer", "finanzamt", "steuerid",
  "iban", "ustid", "rechtsform", "register", "zustaendig"];
const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Rechtsformen mit Eintragungspflicht im Handels-, Genossenschafts-, Vereins- oder Partnerschaftsregister.
// ponytail: Erkennung über den Kurznamen; GbR (eGbR freiwillig) bewusst nicht.
const REGISTERPFLICHT = /(gmbh|\bug\b|\bag\b|\bkg\b|\bohg\b|e\.\s?k\.|\beg\b|e\.\s?v\.|\bse\b|kgaa|partg)/i;

/** IBAN nach ISO 13616: Länderkennung + Prüfziffern, mod 97 = 1. */
function pruefeIban(iban) {
  let s = String(iban || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  s = s.slice(4) + s.slice(0, 4);
  let r = 0;
  for (const ch of s) {
    const v = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    r = (r * (v > 9 ? 100 : 10) + v) % 97;
  }
  return r === 1;
}

/** Steuer-ID nach § 139b AO: 11 Ziffern, erste nicht 0, Prüfziffer ISO 7064 MOD 11,10. */
function pruefeSteuerId(id) {
  const s = String(id || "").replace(/\s/g, "");
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  let p = 10;
  for (let i = 0; i < 10; i++) {
    let x = (Number(s[i]) + p) % 10;
    if (x === 0) x = 10;
    p = (x * 2) % 11;
  }
  const c = 11 - p === 10 ? 0 : 11 - p;
  return c === Number(s[10]);
}

const gueltig = (adressaten, feld) =>
  adressaten.flatMap((a) => (Array.isArray(a?.[feld]) ? a[feld] : [])).filter((e) => e && e.currently_valid !== false);
/** Erster Eintrag, bevorzugt der mit der Markierung (z. B. is_main_communication). */
const erster = (liste, markierung) => liste.find((e) => e[markierung]) || liste[0] || null;
const ersterWert = (adressaten, f) => adressaten.map(f).find((v) => v !== undefined && v !== null && v !== "") ?? null;
const ohneDoppelte = (a) => [...new Set(a.filter(Boolean))];
const anzeigeName = (a) => (a?.type === "legal_person" ? a.current_company_name : [a?.firstname, a?.current_surname].filter(Boolean).join(" ")) || "";

/** Beziehungen, die in beide Richtungen gelten (Ehegatte, Lebenspartner, Lebensgefährte …). */
const GEGENSEITIG_RE = /ehe(gatt|frau|mann|partner)|lebens(partner|gef|gemein)|verheiratet/i;
const gegenseitig = (r) => GEGENSEITIG_RE.test(`${r.name || ""} ${r.abbreviation || ""}`.trim());

/**
 * Alle E-Mail-Adressen rund um einen Mandanten, jede mit Herkunft:
 * eigene (Person, Inhaber, Unternehmen) zuerst, dann die der Beziehungspartner
 * (Gesellschafter, Geschäftsführer, Kinder … – der Mandant „hat“ sie) und der Ansprechpartner.
 * DATEV kennt keine Mail-Art (privat/geschäftlich); die steht, wenn überhaupt, in der Bemerkung.
 */
function sammleMails(mandant, adressaten, beziehungen, partner) {
  const liste = [];
  const von = (a, rolle, eigen) => {
    const alle = gueltig([a], "communications").filter((k) => k.type === "email" && k.data_content);
    // ponytail: von Partnern nur die Standard-Adresse; ihre übrigen (Praxis, privat …) gehören zu deren eigenem Mandat.
    for (const k of eigen ? alle : [erster(alle, "is_main_communication")].filter(Boolean)) {
      liste.push({ adresse: String(k.data_content).trim(), rolle, wer: anzeigeName(a), notiz: k.note || null,
        standard: !!k.is_main_communication, eigen, anrede: a.detail?.salutation || null });
    }
  };
  for (const a of adressaten) {
    const rolle = a.type === "legal_person" ? "Unternehmen" : mandant.type === "individual_enterprise" ? "Inhaber" : "Person";
    von(a, rolle, true);
  }
  const eigeneIds = new Set(adressaten.map((a) => a.id));
  for (const r of beziehungen) {
    if (eigeneIds.has(r.has_addressee_id) && partner.get(r.is_addressee_id)) von(partner.get(r.is_addressee_id), r.name || r.abbreviation || "Beziehung", false);
    // Ehe/Lebenspartnerschaft gilt in beide Richtungen: auch die „hat“-Seite ist dann erreichbar.
    else if (eigeneIds.has(r.is_addressee_id) && gegenseitig(r) && partner.get(r.has_addressee_id)) von(partner.get(r.has_addressee_id), r.name || r.abbreviation || "Beziehung", false);
  }
  for (const c of adressaten.flatMap((a) => a.contact_persons || [])) {
    if (partner.get(c.addressee_id)) von(partner.get(c.addressee_id), c.function ? `Ansprechpartner (${c.function})` : "Ansprechpartner", false);
  }
  const gesehen = new Set();
  return liste.filter((m) => { const k = m.adresse.toLowerCase(); return gesehen.has(k) ? false : gesehen.add(k); });
}

/**
 * @param zusatz { zustaendigkeiten, datevGruppen, kategorien, auftraege, rechtsformen: Map, auftragsarten: Map,
 *   beziehungen: Relationship[] (die diesen Mandanten berühren), partner: Map addresseeId → Adressat,
 *   mandantVon: Map addresseeId → Mandantennummer }
 *   jeweils schon auf diesen Mandanten gefiltert (Listen) bzw. als Nachschlagetabellen.
 */
function pruefeMandant(mandant, adressaten, zusatz = {}) {
  const z = { zustaendigkeiten: [], datevGruppen: [], kategorien: [], auftraege: [], rechtsformen: new Map(), auftragsarten: new Map(),
    beziehungen: [], partner: new Map(), mandantVon: new Map(), ...zusatz };
  const luecken = [];
  const fehlerhaft = [];
  const personen = adressaten.filter((a) => a?.type === "natural_person");
  const firma = adressaten.find((a) => a?.type === "legal_person") || null;
  const detail = (f) => ersterWert(adressaten, (a) => a?.detail?.[f]);

  const komm = gueltig(adressaten, "communications");
  const mails = komm.filter((k) => k.type === "email" && k.data_content);
  const telefone = komm.filter((k) => k.type === "phone" && k.data_content);
  const anschriften = gueltig(adressaten, "addresses").filter((a) => a.postal_code && a.city && (a.street || a.post_office_box));
  const aemter = gueltig(adressaten, "tax_offices");
  const konten = gueltig(adressaten, "bank_accounts").filter((k) => k.iban);

  // ---- Prüfung ----
  const mail = erster(mails, "is_main_communication");
  const email = mail ? String(mail.data_content).trim() : null;
  if (!email) luecken.push("email");
  else if (!MAIL_RE.test(email)) fehlerhaft.push("email");
  if (!telefone.length) luecken.push("telefon");
  if (!anschriften.length) luecken.push("anschrift");
  const anrede = detail("salutation");
  if (!anrede) luecken.push("briefanrede");
  if (personen.length && !personen.some((p) => p.date_of_birth)) luecken.push("geburtsdatum");
  if (!aemter.some((a) => a.tax_number)) luecken.push("steuernummer");
  if (!aemter.some((a) => a.tax_office_number || a.tax_office_name)) luecken.push("finanzamt");
  if (personen.length) {
    const ids = personen.filter((p) => p.tax_identification_number);
    if (!ids.length) luecken.push("steuerid");
    else if (ids.some((p) => !pruefeSteuerId(p.tax_identification_number))) fehlerhaft.push("steuerid");
  }
  if (!konten.length) luecken.push("iban");
  else if (konten.some((k) => !pruefeIban(k.iban))) fehlerhaft.push("iban");

  const rf = firma?.current_legal_form_id ? z.rechtsformen.get(firma.current_legal_form_id) : null;
  const rechtsform = rf ? (rf.short_name || rf.display_name || rf.long_name) : firma?.current_legal_form_id || null;
  const registernummer = firma?.detail?.current_registration_number || null;
  if (mandant.type === "legal_person") {
    if (!firma?.eu_vat_id_number) luecken.push("ustid");
    if (!firma?.current_legal_form_id) luecken.push("rechtsform");
    else if (REGISTERPFLICHT.test(`${rf?.short_name ?? ""} ${rf?.long_name ?? ""} ${firma.current_legal_form_id}`) && !registernummer) luecken.push("register");
  }
  if (!z.zustaendigkeiten.length || z.zustaendigkeiten.some((r) => !r.employee_id && !r.employee_display_name)) luecken.push("zustaendig");

  // ---- Datenblatt ----
  const adr = erster(anschriften.filter((a) => a.is_correspondence_address), "is_correspondence_address") || erster(anschriften, "is_main_street_address");
  const tel = erster(telefone, "is_main_communication");
  const konto = erster(konten, "is_main_bank_account");
  const amt = erster(aemter, "is_competent_for_operational_income_tax");
  const person = personen[0] || null;
  const ustid = firma?.eu_vat_id_number ? `${firma.eu_vat_id_country_code || ""}${firma.eu_vat_id_number}` : null;
  const eigeneIds = new Set(adressaten.map((a) => a?.id));
  const nr = (id) => (z.mandantVon.has(id) && !eigeneIds.has(id) ? ` (${z.mandantVon.get(id)})` : "");
  // Aus Sicht des Mandanten: „Gesellschafter: Anna Muster“ bzw. „ist Gesellschafter von Bäckerei Krümel GmbH“.
  const beziehungen = z.beziehungen.map((r) => eigeneIds.has(r.has_addressee_id)
    ? `${r.name}: ${r.is_addressee_display_name}${nr(r.is_addressee_id)}`
    : `ist ${r.name} von ${r.has_addressee_display_name}${nr(r.has_addressee_id)}`);
  // Verbund = das „hat“-Ende (Gesellschaft, Eltern …); Gesellschaft und Gesellschafter landen in derselben Gruppe.
  const verbund = ohneDoppelte(z.beziehungen.map((r) => r.has_addressee_display_name));

  return {
    id: mandant.id, nummer: mandant.number, name: mandant.name, typ: mandant.type, status: mandant.status,
    seit: mandant.client_since || null, notiz: mandant.note || null,
    email, emails: sammleMails(mandant, adressaten, z.beziehungen, z.partner), beziehungen, verbund, anrede, titel: detail("correspondence_title"), grussformel: detail("complimentary_close"),
    vorname: person?.firstname || null, nachname: person?.current_surname || null, firma: firma?.current_company_name || null,
    geburtsdatum: person?.date_of_birth || null, beruf: person?.detail?.current_job_title || null,
    familienstand: person?.detail?.current_marital_status || null,
    strasse: adr?.street || null, postfach: adr?.post_office_box || null, plz: adr?.postal_code || null, ort: adr?.city || null, land: adr?.country_code || null,
    telefon: tel?.data_content || null,
    fax: erster(komm.filter((k) => k.type === "fax"), "is_main_communication")?.data_content || null,
    internet: erster(komm.filter((k) => k.type === "url"), "is_main_communication")?.data_content || null,
    iban: konto?.iban || null, bic: konto?.bic || null, bank: konto?.bank_name || null,
    steuernummer: amt?.tax_number || null, finanzamt: amt?.tax_office_name || (amt?.tax_office_number ? String(amt.tax_office_number) : null),
    steuerid: ersterWert(personen, (p) => p.tax_identification_number), ustid, rechtsform,
    registergericht: firma?.detail?.current_name_of_register_court || null, registernummer,
    gruendung: firma?.date_of_foundation || null, wirtschaftsjahr: firma?.detail?.current_fiscal_year || null,
    branche: detail("current_description_of_classification_of_economic_activities_2008"),
    ansprechpartner: ohneDoppelte(adressaten.flatMap((a) => a?.contact_persons || []).map((c) => c.function ? `${c.display_name} (${c.function})` : c.display_name)).join(", ") || null,
    aufgabenbereiche: z.zustaendigkeiten.map((r) => ({ bereich: r.area_of_responsibility_name || r.area_of_responsibility_id, mitarbeiter: r.employee_display_name || null })),
    datevGruppen: ohneDoppelte(z.datevGruppen.map((g) => g.client_group_type_short_name)),
    kategorien: ohneDoppelte(z.kategorien.map((k) => k.client_category_type_short_name)),
    auftraege: z.auftraege.map((o) => ({
      art: o.ordertype, artName: z.auftragsarten.get(o.ordertype)?.ordertype_name || o.ordertype,
      jahr: o.assessment_year ?? null, status: o.completion_status ?? null, abrechnung: o.billing_status ?? null,
    })),
    luecken, fehlerhaft, abruffehler: null,
  };
}

module.exports = { gegenseitig, FELDER, MAIL_RE, REGISTERPFLICHT, pruefeIban, pruefeSteuerId, pruefeMandant, sammleMails };
