// Alle Spalten der Mandantentabelle an einem Ort: Titel, Wert, Breite, ob gruppierbar.
// Mehrwertige Spalten (Aufgabenbereiche, Gruppen …) liefern ein Array; beim Gruppieren
// erscheint ein Mandant dann in jeder seiner Gruppen – wie in DATEV.
import { AUFTRAGSSTATUS, ampel, datum, FELD, mailText, TYP, type Gruppe, type Mandant, type Protokollzeile } from "@/lib/kh";

export interface Umgebung { gruppen: Gruppe[]; zuletzt: Map<string, Protokollzeile> }
export interface Spalte {
  id: string; titel: string; bereich: string; breite: number;
  wert: (m: Mandant, u: Umgebung) => string | number | string[] | null | undefined;
  gruppierbar?: boolean; mono?: boolean; gruppenWert?: (m: Mandant, u: Umgebung) => string[];
}

const jahr = (iso?: string | null) => (iso ? String(new Date(iso).getFullYear()) : "");
export const AMPEL_TEXT = { fehlt: "Lücken", pruefen: "Prüfen", ok: "Vollständig" } as const;

export const SPALTEN: Spalte[] = [
  { id: "nummer", titel: "Nr.", bereich: "Allgemein", breite: 84, mono: true, wert: (m) => m.nummer },
  { id: "name", titel: "Mandant", bereich: "Allgemein", breite: 240, wert: (m) => m.name },
  { id: "typ", titel: "Typ", bereich: "Allgemein", breite: 130, gruppierbar: true, wert: (m) => TYP[m.typ] ?? m.typ },
  { id: "stand", titel: "Stand", bereich: "Prüfung", breite: 120, gruppierbar: true, wert: (m) => AMPEL_TEXT[ampel(m)] },
  { id: "luecken", titel: "Was fehlt", bereich: "Prüfung", breite: 240, gruppierbar: true,
    wert: (m) => [...m.luecken.map((f) => FELD[f]), ...m.fehlerhaft.map((f) => `${FELD[f]} prüfen`)],
    gruppenWert: (m) => m.luecken.length || m.fehlerhaft.length ? [...m.luecken.map((f) => `${FELD[f]} fehlt`), ...m.fehlerhaft.map((f) => `${FELD[f]} prüfen`)] : ["Nichts"] },
  { id: "seit", titel: "Mandant seit", bereich: "Allgemein", breite: 110, gruppierbar: true, wert: (m) => datum(m.seit), gruppenWert: (m) => [jahr(m.seit)] },
  { id: "notiz", titel: "Notiz", bereich: "Allgemein", breite: 200, wert: (m) => m.notiz },

  // Standard für Mails: in der App festgelegte Adressen, sonst die Standard-Adresse aus DATEV
  { id: "email", titel: "E-Mail", bereich: "Kontakt", breite: 260, wert: (m) => (m.festeAdressen?.length ? m.festeAdressen.join(", ") : m.email) },
  { id: "emails", titel: "Alle E-Mails", bereich: "Kontakt", breite: 320,
    wert: (m) => (m.emails ?? []).map((e) => `${e.adresse} (${mailText(e)})`),
    gruppierbar: true, gruppenWert: (m) => [...new Set((m.emails ?? []).map((e) => e.rolle))] },
  { id: "telefon", titel: "Telefon", bereich: "Kontakt", breite: 140, wert: (m) => m.telefon },
  { id: "fax", titel: "Fax", bereich: "Kontakt", breite: 140, wert: (m) => m.fax },
  { id: "internet", titel: "Internet", bereich: "Kontakt", breite: 180, wert: (m) => m.internet },
  { id: "anrede", titel: "Briefanrede", bereich: "Kontakt", breite: 230, wert: (m) => m.anrede },
  { id: "titel", titel: "Anrede", bereich: "Kontakt", breite: 100, gruppierbar: true, wert: (m) => m.titel },
  { id: "grussformel", titel: "Grußformel", bereich: "Kontakt", breite: 180, wert: (m) => m.grussformel },
  { id: "ansprechpartner", titel: "Ansprechpartner", bereich: "Kontakt", breite: 220, wert: (m) => m.ansprechpartner },

  { id: "vorname", titel: "Vorname", bereich: "Person", breite: 130, wert: (m) => m.vorname },
  { id: "nachname", titel: "Nachname", bereich: "Person", breite: 140, wert: (m) => m.nachname },
  { id: "geburtsdatum", titel: "Geburtsdatum", bereich: "Person", breite: 120, gruppierbar: true, wert: (m) => datum(m.geburtsdatum), gruppenWert: (m) => [jahr(m.geburtsdatum)] },
  { id: "beruf", titel: "Beruf", bereich: "Person", breite: 150, gruppierbar: true, wert: (m) => m.beruf },
  { id: "familienstand", titel: "Familienstand", bereich: "Person", breite: 130, gruppierbar: true, wert: (m) => m.familienstand },

  { id: "strasse", titel: "Straße", bereich: "Anschrift", breite: 190, wert: (m) => m.strasse || (m.postfach ? `Postfach ${m.postfach}` : null) },
  { id: "plz", titel: "PLZ", bereich: "Anschrift", breite: 80, mono: true, gruppierbar: true, wert: (m) => m.plz },
  { id: "ort", titel: "Ort", bereich: "Anschrift", breite: 140, gruppierbar: true, wert: (m) => m.ort },
  { id: "land", titel: "Land", bereich: "Anschrift", breite: 70, gruppierbar: true, wert: (m) => m.land },

  { id: "steuernummer", titel: "Steuernummer", bereich: "Steuer", breite: 140, mono: true, wert: (m) => m.steuernummer },
  { id: "finanzamt", titel: "Finanzamt", bereich: "Steuer", breite: 150, gruppierbar: true, wert: (m) => m.finanzamt },
  { id: "steuerid", titel: "Steuer-ID", bereich: "Steuer", breite: 130, mono: true, wert: (m) => m.steuerid },
  { id: "ustid", titel: "USt-IdNr.", bereich: "Steuer", breite: 130, mono: true, wert: (m) => m.ustid },

  { id: "iban", titel: "IBAN", bereich: "Bank", breite: 230, mono: true, wert: (m) => m.iban?.replace(/(.{4})/g, "$1 ").trim() },
  { id: "bic", titel: "BIC", bereich: "Bank", breite: 120, mono: true, wert: (m) => m.bic },
  { id: "bank", titel: "Bank", bereich: "Bank", breite: 180, gruppierbar: true, wert: (m) => m.bank },

  { id: "firma", titel: "Firma", bereich: "Gesellschaft", breite: 200, wert: (m) => m.firma },
  { id: "rechtsform", titel: "Rechtsform", bereich: "Gesellschaft", breite: 130, gruppierbar: true, wert: (m) => m.rechtsform },
  { id: "registergericht", titel: "Registergericht", bereich: "Gesellschaft", breite: 170, gruppierbar: true, wert: (m) => m.registergericht },
  { id: "registernummer", titel: "Registernummer", bereich: "Gesellschaft", breite: 130, mono: true, wert: (m) => m.registernummer },
  { id: "gruendung", titel: "Gründung", bereich: "Gesellschaft", breite: 110, wert: (m) => datum(m.gruendung) },
  { id: "wirtschaftsjahr", titel: "Wirtschaftsjahr", bereich: "Gesellschaft", breite: 130, gruppierbar: true, wert: (m) => m.wirtschaftsjahr },
  { id: "branche", titel: "Branche (WZ 2008)", bereich: "Gesellschaft", breite: 200, gruppierbar: true, wert: (m) => m.branche },

  { id: "beziehungen", titel: "Beziehungen", bereich: "Beziehungen", breite: 280, wert: (m) => m.beziehungen ?? [] },
  { id: "verbund", titel: "Verbund", bereich: "Beziehungen", breite: 200, gruppierbar: true, wert: (m) => m.verbund ?? [] },

  { id: "aufgabenbereiche", titel: "Leistungen", bereich: "Leistungen", breite: 230, gruppierbar: true, wert: (m) => m.aufgabenbereiche.map((a) => a.bereich) },
  { id: "zustaendige", titel: "Zuständig", bereich: "Leistungen", breite: 180, gruppierbar: true,
    wert: (m) => [...new Set(m.aufgabenbereiche.map((a) => a.mitarbeiter).filter((x): x is string => !!x))] },
  { id: "auftraege", titel: "Aufträge", bereich: "Leistungen", breite: 240, gruppierbar: true,
    wert: (m) => m.auftraege.map((a) => `${a.art}${a.jahr ? " " + a.jahr : ""}${a.status ? " · " + (AUFTRAGSSTATUS[a.status] ?? a.status) : ""}`),
    gruppenWert: (m) => [...new Set(m.auftraege.map((a) => a.artName))] },

  { id: "eigeneGruppen", titel: "Eigene Gruppen", bereich: "Gruppen", breite: 180, gruppierbar: true,
    wert: (m, u) => u.gruppen.filter((g) => g.mitglieder.includes(m.nummer)).map((g) => g.name) },
  { id: "datevGruppen", titel: "DATEV-Gruppen", bereich: "Gruppen", breite: 170, gruppierbar: true, wert: (m) => m.datevGruppen },
  { id: "kategorien", titel: "DATEV-Kategorien", bereich: "Gruppen", breite: 170, gruppierbar: true, wert: (m) => m.kategorien },
  { id: "zuletzt", titel: "Zuletzt angeschrieben", bereich: "Gruppen", breite: 170,
    wert: (m, u) => { const z = u.zuletzt.get(String(m.nummer)); return z ? `${z.Zeit.split(",")[0]} · ${z.Vorlage}` : null; } },
];
export const SPALTE = new Map(SPALTEN.map((s) => [s.id, s]));
export const STANDARD_SPALTEN = ["nummer", "name", "email", "stand", "luecken", "aufgabenbereiche", "zustaendige", "ort"];

/** Wert als Text, für Suche, Sortierung und Export. */
export const alsText = (v: ReturnType<Spalte["wert"]>) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));
/** Schlüssel zum Gruppieren: leer → „(ohne)“, mehrwertig → mehrere. */
export function gruppenSchluessel(s: Spalte, m: Mandant, u: Umgebung): string[] {
  const roh = s.gruppenWert ? s.gruppenWert(m, u) : s.wert(m, u);
  const liste = (Array.isArray(roh) ? roh : [roh]).map((x) => (x == null ? "" : String(x))).filter(Boolean);
  return liste.length ? liste : ["(ohne)"];
}
