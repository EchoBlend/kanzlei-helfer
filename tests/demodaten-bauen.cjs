'use strict';
// Baut electron/demodaten.json neu: erfundene Testdaten im DATEVconnect-Format.
// Aufruf: node tests/demodaten-bauen.cjs
// Die 7 Grundfaelle stehen unten fest im Skript; die alte Datei wird NICHT als Vorlage gelesen.
// Zusatzmandanten 10010-10029 kommen aus einem Zufallsgenerator mit festem Seed (immer dieselbe Datei).

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ZIEL = path.join(__dirname, '..', 'electron', 'demodaten.json');

// Grundfall p-3 (Postfach, kaputte Mailadresse) ist bewusst fehlerhaft:
// IBAN und Steuer-ID von p-3 bestehen die Pruefung absichtlich nicht.
const BEKANNT_UNGUELTIG = ['p-3'];

// ---------- Zufall mit festem Seed (mulberry32) ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const zahl = (von, bis) => von + Math.floor(rnd() * (bis - von + 1));
const wahl = (liste) => liste[Math.floor(rnd() * liste.length)];
const mischen = (liste) => {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pad2 = (n) => String(n).padStart(2, '0');
const ziffern = (n) => Array.from({ length: n }, () => String(zahl(0, 9))).join('');
const datum = (von, bis) => {
  const jahr = zahl(von, bis);
  const monat = zahl(1, 12);
  const tag = zahl(1, 28);
  return `${jahr}-${pad2(monat)}-${pad2(tag)}`;
};
const idx20 = [...Array(20).keys()];

// ---------- Pruefziffern ----------
// IBAN (Deutschland): mod 97 ueber BBAN + "131400" (D=13, E=14, Pruefziffer 00)
function mod97(text) {
  let r = 0;
  for (const c of text) r = (r * 10 + (c.charCodeAt(0) - 48)) % 97;
  return r;
}
function ibanDE(bban) {
  return 'DE' + pad2(98 - mod97(bban + '131400')) + bban;
}
function ibanGueltig(iban) {
  return /^DE\d{20}$/.test(iban) && mod97(iban.slice(4) + '1314' + iban.slice(2, 4)) === 1;
}

// Steuer-ID (ISO 7064 MOD 11,10): 11 Ziffern, letzte ist Pruefziffer
function steuerId(ersteZehn) {
  let p = 10;
  for (const ch of ersteZehn) {
    let x = (Number(ch) + p) % 10;
    if (x === 0) x = 10;
    p = (x * 2) % 11;
  }
  let c = 11 - p;
  if (c === 10) c = 0;
  return ersteZehn + String(c);
}
const steuerGueltig = (id) => /^[1-9]\d{10}$/.test(id) && steuerId(id.slice(0, 10)) === id;
const steuerNummerNeu = () => steuerId(String(zahl(1, 9)) + ziffern(9));

const slug = (t) =>
  t
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

// ---------- Stammdaten (Typen, Listen) ----------
const RECHTSFORMEN = [
  { id: 'GMBH', short_name: 'GmbH', long_name: 'Gesellschaft mit beschränkter Haftung', display_name: 'GmbH' },
  { id: 'UG', short_name: 'UG', long_name: 'Unternehmergesellschaft (haftungsbeschränkt)', display_name: 'UG (haftungsbeschränkt)' },
  { id: 'KG', short_name: 'KG', long_name: 'Kommanditgesellschaft', display_name: 'KG' },
  { id: 'GMBHCOKG', short_name: 'GmbH & Co. KG', long_name: 'GmbH & Co. Kommanditgesellschaft', display_name: 'GmbH & Co. KG' },
  { id: 'EK', short_name: 'e. K.', long_name: 'eingetragene Kauffrau/eingetragener Kaufmann', display_name: 'e. K.' },
  { id: 'GBR', short_name: 'GbR', long_name: 'Gesellschaft bürgerlichen Rechts', display_name: 'GbR' },
  { id: 'AG', short_name: 'AG', long_name: 'Aktiengesellschaft', display_name: 'AG' },
];

const BEREICHE = [
  { id: 'FIBU', name: 'Finanzbuchführung' },
  { id: 'LOHN', name: 'Lohn und Gehalt' },
  { id: 'JA', name: 'Jahresabschluss' },
  { id: 'EST', name: 'Einkommensteuer' },
  { id: 'UST', name: 'Umsatzsteuer' },
  { id: 'BER', name: 'Beratung' },
];

const MITARBEITER = [
  { nr: 101, name: 'Weber, Lena' },
  { nr: 102, name: 'Hartmann, Jan' },
  { nr: 103, name: 'Schulze, Miriam' },
  { nr: 104, name: 'Richter, Stefan' },
  { nr: 105, name: 'Lange, Marie' },
];

const GRUPPENTYPEN = [
  { id: 'g-a', short_name: 'A-Mandant', name: 'A-Mandanten' },
  { id: 'g-lohn', short_name: 'Lohnkunde', name: 'Lohnkunden' },
  { id: 'g-neu', short_name: 'Neu 2026', name: 'Neumandanten 2026' },
];

const KATEGORIETYPEN = [
  { id: 'k-hand', short_name: 'Handwerk', name: 'Handwerk' },
  { id: 'k-heil', short_name: 'Heilberufe', name: 'Heilberufe' },
  { id: 'k-gast', short_name: 'Gastronomie', name: 'Gastronomie' },
  { id: 'k-frei', short_name: 'Freiberufler', name: 'Freiberufler' },
];

const ARTEN = {
  FIBU: 'Finanzbuchführung',
  LOHN: 'Lohn und Gehalt',
  JA: 'Jahresabschluss',
  EST: 'Einkommensteuererklärung',
  UST: 'Umsatzsteuererklärung',
};

const ORTE = [
  { stadt: 'Leipzig', plz: '04', vorwahl: '0341', fa: { nr: 3232, name: 'Leipzig II', prefix: '231' }, gericht: 'Amtsgericht Leipzig' },
  { stadt: 'Dresden', plz: '01', vorwahl: '0351', fa: { nr: 3202, name: 'Dresden-Nord', prefix: '202' }, gericht: 'Amtsgericht Dresden' },
  { stadt: 'Chemnitz', plz: '09', vorwahl: '0371', fa: { nr: 3211, name: 'Chemnitz-Süd', prefix: '211' }, gericht: 'Amtsgericht Chemnitz' },
  { stadt: 'Halle', plz: '06', vorwahl: '0345', fa: { nr: 3251, name: 'Halle-Nord', prefix: '251' }, gericht: 'Amtsgericht Halle (Saale)' },
];

const BANKEN = [
  { name: 'Musterbank Leipzig eG', bic: 'MUSTDE81LEI' },
  { name: 'Beispielbank Dresden', bic: 'BEISDE81DRE' },
  { name: 'Probe-Volksbank Chemnitz', bic: 'PROBDE81CHE' },
  { name: 'Testsparkasse Halle', bic: 'TESTDE81HAL' },
];

const BERUFE = [
  'Projektleitung', 'Sachbearbeitung', 'Technische Leitung', 'Vertrieb', 'Einkauf',
  'Pflegedienstleitung', 'Redaktion', 'Bauleitung', 'Controlling', 'Personalreferat',
];

// Zusatzmandanten: Index 0-11 Privatpersonen, 12-15 Einzelunternehmen, 16-19 Juristische Personen
const PERSONEN = [
  { v: 'Katrin', n: 'Hartmann', w: true },
  { v: 'Thomas', n: 'Schulze', w: false },
  { v: 'Sandra', n: 'Berger', w: true },
  { v: 'Michael', n: 'Zimmermann', w: false },
  { v: 'Nicole', n: 'Kühn', w: true },
  { v: 'Andreas', n: 'Roth', w: false },
  { v: 'Claudia', n: 'Engel', w: true },
  { v: 'Stefan', n: 'Pohl', w: false },
  { v: 'Franziska', n: 'Winkler', w: true },
  { v: 'Frank', n: 'Wagner', w: false },
  { v: 'Heike', n: 'Gruber', w: true },
  { v: 'Jens', n: 'Otto', w: false },
];
const EINZEL = [
  { p: { v: 'Matthias', n: 'Lindner', w: false }, firma: 'Tischlerei Lindner e.K.', mail: 'tischlerei-lindner', form: 'EK' },
  { p: { v: 'Yvonne', n: 'Vogt', w: true }, firma: 'Friseursalon Vogt e.K.', mail: 'friseur-vogt', form: 'EK' },
  { p: { v: 'Robert', n: 'Keller', w: false }, firma: 'Elektro Keller e.K.', mail: 'elektro-keller', form: 'EK' },
  { p: { v: 'Ina', n: 'Brandt', w: true }, firma: 'Gartenbau Brandt e.K.', mail: 'gartenbau-brandt', form: 'EK' },
];
const JUR = [
  { firma: 'Nowak Maschinenbau GmbH', mail: 'nowak-maschinenbau', form: 'GMBH', ansprech: 'Nowak, Ralf', funktion: 'Geschäftsführer' },
  { firma: 'Peters Logistik UG (haftungsbeschränkt)', mail: 'peters-logistik', form: 'UG', ansprech: 'Peters, Carmen', funktion: 'Geschäftsführerin' },
  { firma: 'Fischer & Söhne GmbH & Co. KG', mail: 'fischer-soehne', form: 'GMBHCOKG', ansprech: 'Fischer, Oliver', funktion: 'Geschäftsführer' },
  { firma: 'Heinrich Ingenieurbüro AG', mail: 'heinrich-ingenieure', form: 'AG', ansprech: 'Heinrich, Dagmar', funktion: 'Vorstand' },
];
const typOf = (i) => (i < 12 ? 'natural' : i < 16 ? 'individual' : 'legal');

// ---------- Grundfaelle (7 Testfaelle, Felder wie DATEVconnect) ----------
const BASIS_KLIENTEN = [
  { id: 'c-10001', number: 10001, name: 'Muster, Anna', status: 'active', type: 'natural_person', natural_person_id: 'p-1' },
  { id: 'c-10002', number: 10002, name: 'Bäckerei Krümel GmbH', status: 'active', type: 'legal_person', legal_person_id: 'l-2' },
  { id: 'c-10003', number: 10003, name: 'Beispiel, Jürgen', status: 'active', type: 'natural_person', natural_person_id: 'p-3' },
  { id: 'c-10004', number: 10004, name: 'Malerbetrieb Test e.K.', status: 'active', type: 'individual_enterprise', natural_person_id: 'p-4', legal_person_id: 'l-4' },
  { id: 'c-10005', number: 10005, name: 'Alt, Otto (inaktiv)', status: 'inactive', type: 'natural_person', natural_person_id: 'p-5' },
  { id: 'c-10006', number: 10006, name: 'Leer, Sabine', status: 'active', type: 'natural_person', natural_person_id: 'p-6' },
  { id: 'c-10007', number: 10007, name: 'Fehlt, Adressat', status: 'active', type: 'natural_person', natural_person_id: 'p-gibt-es-nicht' },
];

const BASIS_ADRESSATEN = {
  'p-1': {
    id: 'p-1', type: 'natural_person', status: 'active', firstname: 'Anna', current_surname: 'Muster',
    date_of_birth: '1985-04-12',
    tax_identification_number: '86095742719',
    detail: { salutation: 'Sehr geehrte Frau Muster,' },
    addresses: [ { type: 'street', street: 'Hauptstraße 1', postal_code: '04109', city: 'Leipzig', currently_valid: true, is_correspondence_address: true } ],
    communications: [
      { type: 'email', data_content: 'anna.muster@example.com', is_main_communication: true },
      { type: 'phone', data_content: '0341 123456', is_main_communication: true },
    ],
    bank_accounts: [ { iban: 'DE89370400440532013000', currently_valid: true, is_main_bank_account: true } ],
    tax_offices: [ { tax_number: '231/123/45678', tax_office_number: 3231, tax_office_name: 'Leipzig I', currently_valid: true } ],
  },
  'l-2': {
    id: 'l-2', type: 'legal_person', status: 'active', current_company_name: 'Bäckerei Krümel GmbH',
    current_legal_form_id: 'GMBH', eu_vat_id_country_code: 'DE', eu_vat_id_number: '123456789',
    detail: {
      salutation: 'Sehr geehrte Damen und Herren,',
      current_registration_number: 'HRB 12345',
      current_name_of_register_court: 'Amtsgericht Dresden',
    },
    addresses: [ { type: 'street', street: 'Brötchenweg 7', postal_code: '01067', city: 'Dresden' } ],
    communications: [ { type: 'phone', data_content: '0351 987654' } ],
    bank_accounts: [ { iban: 'DE12500105170648489890', currently_valid: false } ],
    tax_offices: [ { tax_number: '202/111/22222', tax_office_number: 3202, tax_office_name: 'Dresden-Nord' } ],
  },
  'p-3': {
    id: 'p-3', type: 'natural_person', status: 'active', current_surname: 'Beispiel',
    tax_identification_number: '86095742718',
    detail: { salutation: 'Sehr geehrter Herr Beispiel,' },
    addresses: [ { type: 'post_office_box', post_office_box: '100 200', postal_code: '04001', city: 'Leipzig' } ],
    communications: [ { type: 'email', data_content: 'juergen.beispiel(at)example.com' } ],
    bank_accounts: [ { iban: 'DE89370400440532013001' } ],
    tax_offices: [ { tax_number: '231/999/00001', tax_office_name: 'Leipzig II' } ],
  },
  'p-4': {
    id: 'p-4', type: 'natural_person', status: 'active', current_surname: 'Pinsel',
    date_of_birth: '1971-09-30',
    tax_identification_number: '47258361908',
    detail: { salutation: 'Sehr geehrter Herr Pinsel,' },
  },
  'l-4': {
    id: 'l-4', type: 'legal_person', status: 'active', current_company_name: 'Malerbetrieb Test e.K.',
    addresses: [ { type: 'street', street: 'Farbgasse 3', postal_code: '04103', city: 'Leipzig' } ],
    communications: [
      { type: 'email', data_content: 'info@malerbetrieb-test.example', is_main_communication: true },
      { type: 'phone', data_content: '0341 555000' },
    ],
    bank_accounts: [ { iban: 'DE02120300000000202051' } ],
  },
  'p-5': { id: 'p-5', type: 'natural_person', status: 'inactive', current_surname: 'Alt' },
  'p-6': {
    id: 'p-6', type: 'natural_person', status: 'active', current_surname: 'Leer',
    communications: [ { type: 'email', data_content: 'sabine.leer@example.com' } ],
  },
};

// ---------- Bausteine fuer Zusatzmandanten ----------
function adresse(ort) {
  const str = wahl(['Hauptstraße', 'Lindenweg', 'Bahnhofstraße', 'Gartenweg', 'Ringstraße', 'Kastanienallee', 'Schillerstraße', 'Am Markt']);
  const hausNr = zahl(1, 80);
  return {
    type: 'street',
    street: `${str} ${hausNr}`,
    postal_code: ort.plz + String(zahl(100, 999)),
    city: ort.stadt,
    country_code: 'DE',
    currently_valid: true,
    is_correspondence_address: true,
  };
}
function kontakt(mail, ort) {
  return [
    { type: 'email', data_content: mail, is_main_communication: true },
    { type: 'phone', data_content: `${ort.vorwahl} ${ziffern(6)}` },
  ];
}
function konto() {
  const bank = wahl(BANKEN);
  return {
    iban: ibanDE(ziffern(18)),
    bic: bank.bic,
    bank_name: bank.name,
    currently_valid: true,
    is_main_bank_account: true,
  };
}
function finanzamt(ort) {
  return {
    tax_number: `${ort.fa.prefix}/${ziffern(3)}/${ziffern(5)}`,
    tax_office_number: ort.fa.nr,
    tax_office_name: ort.fa.name,
    currently_valid: true,
  };
}
function adressatPerson(id, p, ort, status, beruf) {
  const anrede = p.w ? `Sehr geehrte Frau ${p.n},` : `Sehr geehrter Herr ${p.n},`;
  return {
    id,
    type: 'natural_person',
    status,
    firstname: p.v,
    current_surname: p.n,
    date_of_birth: datum(1948, 1998),
    tax_identification_number: steuerNummerNeu(),
    detail: { salutation: anrede, current_job_title: beruf },
    addresses: [adresse(ort)],
    communications: kontakt(`${slug(p.v)}.${slug(p.n)}@example.com`, ort),
    bank_accounts: [konto()],
    tax_offices: [finanzamt(ort)],
  };
}
function adressatFirma(id, f, ort, status) {
  return {
    id,
    type: 'legal_person',
    status,
    current_company_name: f.firma,
    current_legal_form_id: f.form,
    eu_vat_id_country_code: 'DE',
    eu_vat_id_number: ziffern(9),
    detail: {
      salutation: 'Sehr geehrte Damen und Herren,',
      current_registration_number: `${f.form === 'EK' ? 'HRA' : 'HRB'} ${zahl(10000, 99999)}`,
      current_name_of_register_court: ort.gericht,
    },
    addresses: [adresse(ort)],
    communications: kontakt(`info.${f.mail}@example.com`, ort),
    bank_accounts: [konto()],
    tax_offices: [finanzamt(ort)],
    contact_persons: [{ display_name: f.ansprech, function: f.funktion }],
  };
}

// Luecken (fehlende Daten) bei Zusatzmandanten
const POOL = {
  natural: ['email', 'phone', 'iban', 'dob', 'salutation', 'steuernr'],
  individual: ['email', 'phone', 'iban', 'dob', 'salutation', 'ustid', 'steuernr'],
  legal: ['email', 'phone', 'iban', 'salutation', 'ustid', 'steuernr'],
};
function luecke(adr, op) {
  if (op === 'email') adr.communications = (adr.communications || []).filter((c) => c.type !== 'email');
  if (op === 'phone') adr.communications = (adr.communications || []).filter((c) => c.type !== 'phone');
  if (op === 'iban') delete adr.bank_accounts;
  if (op === 'dob') delete adr.date_of_birth;
  if (op === 'salutation' && adr.detail) delete adr.detail.salutation;
  if (op === 'ustid') {
    delete adr.eu_vat_id_country_code;
    delete adr.eu_vat_id_number;
  }
  if (op === 'steuernr') adr.tax_offices = [];
}

// ---------- Plan fuer Zufallsteile ----------
const zustPlan = mischen(idx20);
const OHNE_ZUST = zustPlan[0];
const OHNE_MA = [zustPlan[1], zustPlan[2]];
const gapIdx = mischen(idx20).slice(0, 7);
const LUECKEN = {};
for (const i of gapIdx) LUECKEN[i] = mischen(POOL[typOf(i)]).slice(0, zahl(1, 2));

// ---------- Zuständigkeiten, Gruppen, Kategorien, Aufträge ----------
const zustaendig = [];
function zustaendigkeit(bereichId, ma, c) {
  const b = BEREICHE.find((x) => x.id === bereichId);
  zustaendig.push({
    id: zustaendig.length + 1,
    area_of_responsibility_id: b.id,
    area_of_responsibility_name: b.name,
    employee_id: ma ? ma.nr : null,
    employee_display_name: ma ? ma.name : null,
    employee_number: ma ? ma.nr : null,
    employee_status: ma ? 'active' : null,
    client_id: c.id,
    client_name: c.name,
    client_number: c.number,
    client_status: c.status,
  });
}

const gruppen = [];
function gruppe(typ, c) {
  gruppen.push({
    id: gruppen.length + 1,
    client_group_type_id: typ.id,
    client_group_type_short_name: typ.short_name,
    client_id: c.id,
    client_name: c.name,
    client_number: c.number,
    client_status: c.status,
  });
}
const kategorien = [];
function kategorie(typ, c) {
  kategorien.push({
    id: kategorien.length + 1,
    client_category_type_id: typ.id,
    client_category_type_short_name: typ.short_name,
    client_id: c.id,
    client_name: c.name,
    client_number: c.number,
    client_status: c.status,
  });
}

const auftraege = [];
let auftragNr = 0;
function neuerAuftrag(c, art, jahr, status, abrechnung) {
  auftragNr += 1;
  const nr = 1000 + auftragNr;
  return {
    id: 'o-' + nr,
    order_id: nr,
    creation_year: jahr,
    order_number: `${jahr}-${String(auftragNr).padStart(4, '0')}`,
    order_name: `${ARTEN[art]} ${jahr}`,
    ordertype: art,
    assessment_year: jahr,
    client_id: c.id,
    completion_status: status,
    billing_status: abrechnung,
    isinternal: false,
  };
}

// ---------- Zusammenbau ----------
const klienten = [...BASIS_KLIENTEN];
const adressaten = { ...BASIS_ADRESSATEN };
const luekenBericht = [];
const ohneZustand = [];
const ohneMitarbeiter = [];

// Grundfaelle: Zustaendigkeiten
const b1 = BASIS_KLIENTEN[0];
const b2 = BASIS_KLIENTEN[1];
const b3 = BASIS_KLIENTEN[2];
const b4 = BASIS_KLIENTEN[3];
zustaendigkeit('EST', MITARBEITER[0], b1);
zustaendigkeit('FIBU', MITARBEITER[1], b2);
zustaendigkeit('LOHN', MITARBEITER[2], b2);
zustaendigkeit('JA', MITARBEITER[3], b2);
zustaendigkeit('EST', MITARBEITER[4], b3);
zustaendigkeit('FIBU', null, b4);

// Grundfaelle: Gruppen und Kategorien
const gTyp = (id) => GRUPPENTYPEN.find((t) => t.id === id);
const kTyp = (id) => KATEGORIETYPEN.find((t) => t.id === id);
gruppe(gTyp('g-a'), b1);
gruppe(gTyp('g-a'), b2);
gruppe(gTyp('g-lohn'), b2);
gruppe(gTyp('g-neu'), b3);
gruppe(gTyp('g-a'), b4);
kategorie(kTyp('k-heil'), b1);
kategorie(kTyp('k-gast'), b2);
kategorie(kTyp('k-frei'), b3);
kategorie(kTyp('k-hand'), b4);

// Zusatzmandanten 10010-10029
for (let i = 0; i < 20; i++) {
  const num = 10010 + i;
  const typ = typOf(i);
  const status = num === 10029 ? 'inactive' : 'active';
  const ort = wahl(ORTE);
  const seit = datum(2005, 2024);
  const pid = `p-${num}`;
  const lid = `l-${num}`;
  const cid = `c-${num}`;
  const neue = [];
  let klient;

  if (typ === 'natural') {
    const p = PERSONEN[i];
    const a = adressatPerson(pid, p, ort, status, wahl(BERUFE));
    neue.push(a);
    adressaten[pid] = a;
    klient = { id: cid, number: num, name: `${p.n}, ${p.v}`, status, type: 'natural_person', natural_person_id: pid, client_since: seit };
  } else if (typ === 'individual') {
    const e = EINZEL[i - 12];
    const a1 = adressatPerson(pid, e.p, ort, status, 'Inhaber');
    const a2 = adressatFirma(lid, { ...e, ansprech: `${e.p.n}, ${e.p.v}`, funktion: 'Inhaber' }, ort, status);
    neue.push(a1, a2);
    adressaten[pid] = a1;
    adressaten[lid] = a2;
    klient = { id: cid, number: num, name: e.firma, status, type: 'individual_enterprise', natural_person_id: pid, legal_person_id: lid, client_since: seit };
  } else {
    const f = JUR[i - 16];
    const a = adressatFirma(lid, f, ort, status);
    neue.push(a);
    adressaten[lid] = a;
    klient = { id: cid, number: num, name: f.firma, status, type: 'legal_person', legal_person_id: lid, client_since: seit };
  }

  if (LUECKEN[i]) {
    for (const op of LUECKEN[i]) neue.forEach((a) => luecke(a, op));
    luekenBericht.push(`${num} ${klient.name}: ${LUECKEN[i].join(', ')}`);
  }
  klienten.push(klient);

  if (i === OHNE_ZUST) {
    ohneZustand.push(num);
  } else {
    const anz = zahl(1, 3);
    mischen(BEREICHE)
      .slice(0, anz)
      .forEach((b, k) => {
        const ma = OHNE_MA.includes(i) && k === 0 ? null : wahl(MITARBEITER);
        if (ma === null) ohneMitarbeiter.push(`${num} ${b.id}`);
        zustaendigkeit(b.id, ma, klient);
      });
  }
}

// Zusatzmandanten: Gruppen und Kategorien (je 8)
for (const i of mischen(idx20).slice(0, 8)) gruppe(wahl(GRUPPENTYPEN), klienten[7 + i]);
for (const i of mischen(idx20).slice(0, 8)) kategorie(wahl(KATEGORIETYPEN), klienten[7 + i]);

// Auftraege: 1-3 je Mandant, c-10006 ohne Auftraege
const ARTKEYS = Object.keys(ARTEN);
for (const c of klienten) {
  if (c.id === 'c-10006') continue;
  const anz = zahl(1, 3);
  for (let k = 0; k < anz; k++) {
    if (c.id === 'c-10001' && k === 0) {
      auftraege.push(neuerAuftrag(c, 'EST', 2025, 'in work', 'not billed'));
    } else {
      auftraege.push(
        neuerAuftrag(
          c,
          wahl(ARTKEYS),
          wahl([2024, 2025]),
          wahl(['created/planned', 'in work', 'completed']),
          wahl(['not billed', 'billed'])
        )
      );
    }
  }
}

const AUFTRAGSARTEN = ARTKEYS.map((code, i) => ({
  id: i + 1,
  ordertype_id: code,
  ordertype: code,
  ordertype_name: ARTEN[code],
  active: true,
}));

// ---------- Beziehungen und mehrere E-Mails (ohne Zufall, damit der Rest gleich bleibt) ----------
const BEZ_TYPEN = [
  { id: 'r-ges', abbreviation: 'GES', name: 'Gesellschafter', standard: true, type: 2 },
  { id: 'r-gf', abbreviation: 'GF', name: 'Geschäftsführer', standard: true, type: 2 },
  { id: 'r-ehe', abbreviation: 'EHE', name: 'Ehegatte', standard: true, type: 2 },
  { id: 'r-kind', abbreviation: 'KIND', name: 'Kind', standard: true, type: 2 },
];
// Personen, die selbst keine Mandanten sind (nur Adressaten)
const nurAdressat = (id, v, n, w, mail, notiz) => {
  adressaten[id] = { id, type: 'natural_person', status: 'active', firstname: v, current_surname: n,
    detail: { salutation: w ? `Sehr geehrte Frau ${n},` : `Sehr geehrter Herr ${n},` },
    communications: [{ type: 'email', data_content: mail, is_main_communication: true, note: notiz }] };
};
nurAdressat('p-g-1', 'Ralf', 'Nowak', false, 'ralf.nowak@example.com', 'privat');
nurAdressat('p-g-2', 'Petra', 'Nowak', true, 'petra.nowak@example.com', 'privat');
nurAdressat('p-g-3', 'Carmen', 'Peters', true, 'c.peters@peters-logistik.example', 'geschäftlich');
nurAdressat('p-g-4', 'Lena', 'Hartmann', true, 'lena.hartmann@example.com', null);
const nameVon = (id) => { const a = adressaten[id]; return a.type === 'legal_person' ? a.current_company_name : `${a.current_surname}, ${a.firstname}`; };
const beziehungen = [];
const bez = (typ, hat, ist) => {
  const t = BEZ_TYPEN.find((x) => x.id === typ);
  beziehungen.push({ id: `rel-${beziehungen.length + 1}`, abbreviation: t.abbreviation, name: t.name, standard: true, type_id: t.id,
    has_addressee_id: hat, has_addressee_display_name: nameVon(hat), has_addressee_type: adressaten[hat].type,
    is_addressee_id: ist, is_addressee_display_name: nameVon(ist), is_addressee_type: adressaten[ist].type });
};
// Bäckerei Krümel GmbH (ohne eigene Mail): zwei Gesellschafter, beide selbst Mandanten
bez('r-ges', 'l-2', 'p-1');
bez('r-ges', 'l-2', 'p-10010');
bez('r-gf', 'l-2', 'p-1');
// Nowak Maschinenbau GmbH: zwei Gesellschafter, die keine Mandanten sind
bez('r-ges', 'l-10026', 'p-g-1');
bez('r-ges', 'l-10026', 'p-g-2');
bez('r-gf', 'l-10026', 'p-g-1');
// Peters Logistik UG: Gesellschafter-Geschäftsführerin
bez('r-ges', 'l-10027', 'p-g-3');
bez('r-gf', 'l-10027', 'p-g-3');
// Familie: Hartmann und Schulze verheiratet, Tochter Lena
bez('r-ehe', 'p-10010', 'p-10011');
bez('r-kind', 'p-10010', 'p-g-4');
// Mehrere Mails mit DATEV-Bemerkung
adressaten['p-1'].communications.push({ type: 'email', data_content: 'praxis@muster-physio.example', note: 'geschäftlich (Praxis)' });
adressaten['p-4'].communications = [{ type: 'email', data_content: 'pinsel.privat@example.com', note: 'privat' }];
adressaten['l-10026'].communications.push({ type: 'email', data_content: 'buchhaltung.nowak-maschinenbau@example.com', note: 'Buchhaltung' });
adressaten['l-10026'].contact_persons[0].addressee_id = 'p-g-1';

// ---------- Ausgabe ----------
const ausgabe = {
  _hinweis: 'Erfundene Testdaten im DATEVconnect-Format. Keine echten Mandanten.',
  'master-data': {
    '/clients': klienten,
    '/responsibilities': zustaendig,
    '/client-groups': gruppen,
    '/client-group-types': GRUPPENTYPEN,
    '/client-categories': kategorien,
    '/client-category-types': KATEGORIETYPEN,
    '/legal-forms': RECHTSFORMEN,
    '/relationships': beziehungen,
    '/relationship-types': BEZ_TYPEN,
  },
  addressees: adressaten,
  'order-management': {
    '/orders': auftraege,
    '/ordertypes': AUFTRAGSARTEN,
  },
};
fs.writeFileSync(ZIEL, JSON.stringify(ausgabe, null, 2) + '\n', 'utf8');

// ---------- Selbstpruefung (laeuft bei jedem Lauf mit) ----------
const geprueft = JSON.parse(fs.readFileSync(ZIEL, 'utf8'));
const md = geprueft['master-data'];
assert.strictEqual(md['/clients'].length, 27, 'Mandanten muessen 27 sein');
const fehler = [];
for (const [id, a] of Object.entries(geprueft.addressees)) {
  if (BEKANNT_UNGUELTIG.includes(id)) continue;
  for (const b of a.bank_accounts || []) {
    if (b.iban && !ibanGueltig(b.iban)) fehler.push(`IBAN ungueltig: ${id} ${b.iban}`);
  }
  if (a.tax_identification_number && !steuerGueltig(a.tax_identification_number)) {
    fehler.push(`Steuer-ID ungueltig: ${id} ${a.tax_identification_number}`);
  }
}
assert.deepStrictEqual(fehler, [], 'Pruefziffern');
for (const c of md['/clients']) {
  const pers = c.natural_person_id || c.legal_person_id;
  assert.ok(geprueft.addressees[pers] || c.id === 'c-10007', `Adressat fehlt fuer ${c.id}`);
}
assert.ok(!geprueft['order-management']['/orders'].some((o) => o.client_id === 'c-10006'), 'c-10006 ohne Auftraege');
assert.ok(!md['/responsibilities'].some((z) => z.client_id === 'c-10006'), 'c-10006 ohne Zustaendigkeit');
assert.strictEqual(md['/responsibilities'].filter((z) => z.client_id === 'c-10001' && z.employee_id === 101 && z.area_of_responsibility_id === 'EST').length, 1);
const extraIds = md['/clients'].filter((c) => c.number >= 10010).map((c) => c.id);
assert.strictEqual(extraIds.length, 20);
assert.strictEqual(new Set(extraIds.filter((id) => !md['/responsibilities'].some((z) => z.client_id === id))).size, 1, 'genau 1 Zusatzmandant ohne Zustaendigkeit');
assert.strictEqual(md['/responsibilities'].filter((z) => extraIds.includes(z.client_id) && z.employee_id === null).length, 2, 'genau 2 Bereiche ohne Mitarbeiter');

console.log(`demodaten.json geschrieben: ${md['/clients'].length} Mandanten, ${md['/responsibilities'].length} Zustaendigkeiten, ${md['/client-groups'].length} Gruppen-Zuordnungen, ${md['/client-categories'].length} Kategorie-Zuordnungen, ${geprueft['order-management']['/orders'].length} Auftraege.`);
console.log('Selbstpruefung bestanden (IBAN mod-97, Steuer-ID-Pruefziffer; p-3 bewusst fehlerhaft).');
console.log('Zusatzmandanten mit Luecken:');
for (const z of luekenBericht) console.log('  ' + z);
console.log('Zusatzmandant ohne Zustaendigkeit: ' + ohneZustand.join(', '));
console.log('Bereiche ohne Mitarbeiter: ' + ohneMitarbeiter.join(', '));
