// Typen und Hilfen für die Oberfläche. Die Daten kommen über window.kh (electron/vorlade.cjs).

export type Feld = "email" | "telefon" | "anschrift" | "briefanrede" | "geburtsdatum" | "steuernummer" | "finanzamt"
  | "steuerid" | "iban" | "ustid" | "rechtsform" | "register" | "zustaendig";
export const FELDER: Feld[] = ["email", "telefon", "anschrift", "briefanrede", "geburtsdatum", "steuernummer", "finanzamt", "steuerid", "iban", "ustid", "rechtsform", "register", "zustaendig"];

/** Eine E-Mail-Adresse mit Herkunft: eigene (Person, Inhaber, Unternehmen) oder eines Partners (Gesellschafter, Ansprechpartner …). */
export interface Mail {
  adresse: string; rolle: string; wer: string; notiz: string | null; standard: boolean; eigen: boolean; anrede: string | null;
  /** In der App als Standard für Mails festgelegt (überstimmt DATEV). */
  festgelegt?: boolean;
}
export interface Auftrag { art: string; artName: string; jahr: number | null; status: string | null; abrechnung: string | null }
export interface Mandant {
  id: string; nummer: number; name: string; typ: "natural_person" | "individual_enterprise" | "legal_person" | string; status: string;
  seit?: string | null; notiz?: string | null;
  email: string | null; emails: Mail[]; beziehungen: string[];
  /** In der App festgelegte Standard-Adressen (nur gültige, die DATEV beim Mandanten hat); null = DATEV-Standard. */
  festeAdressen?: string[] | null; verbund: string[]; anrede: string | null; titel?: string | null; grussformel?: string | null;
  vorname?: string | null; nachname?: string | null; firma?: string | null; geburtsdatum?: string | null; beruf?: string | null; familienstand?: string | null;
  strasse?: string | null; postfach?: string | null; plz?: string | null; ort?: string | null; land?: string | null;
  telefon?: string | null; fax?: string | null; internet?: string | null;
  iban?: string | null; bic?: string | null; bank?: string | null;
  steuernummer?: string | null; finanzamt?: string | null; steuerid?: string | null; ustid?: string | null; rechtsform?: string | null;
  registergericht?: string | null; registernummer?: string | null; gruendung?: string | null; wirtschaftsjahr?: string | null; branche?: string | null;
  ansprechpartner?: string | null;
  aufgabenbereiche: { bereich: string; mitarbeiter: string | null }[];
  datevGruppen: string[]; kategorien: string[]; auftraege: Auftrag[];
  luecken: Feld[]; fehlerhaft: Feld[]; abruffehler: string | null;
}
export interface Einstellungen {
  datevconnect: string; versand: "outlook" | "eml"; emlOrdner: string; signatur: string; nurAktive: boolean; demo: boolean;
  design: "system" | "hell" | "dunkel"; regeln: Partial<Record<Feld, boolean>>;
}
export interface Status {
  datev: boolean; meldung: string | null; einstellungen: Einstellungen; version: string; daten: string; ausgang: string;
  mica: boolean; auftragswesen: boolean | null; hinweise: string[];
}
/** `text` = reiner Text (für Prüfungen und als Klartext-Teil der Mail); `html` = formatierte Fassung mit Farben und Bildern. */
export interface Vorlage { id: string; name: string; betreff: string; text: string; html?: string }
/** Fertige Fassung für einen Mandanten (Platzhalter schon ersetzt). */
export interface Fassung { betreff: string; text: string; html: string }
export interface Gruppe { id: string; name: string; mitglieder: number[] }
export interface Ansicht { spalten?: string[]; gruppe?: string | null; filterzeile?: boolean; sort?: { id: string; ab: boolean }; breiten?: Record<string, number> }
export interface Protokollzeile { Zeit: string; Modus: string; Vorlage: string; Mandantennr: string; Mandant: string; An: string; Betreff: string; Ergebnis: string; Anhaenge: string }
export interface Datei { pfad: string; name: string; groesse: number }
/** Mandantennummer → festgelegte Standard-Adressen (nur in der App gespeichert). */
export type StandardAdressen = Record<number, string[]>;
export interface MailErgebnis { nummer: number; ok: boolean; info: string; anhaenge: string[] }
export interface Scan { stand: string; mandanten: Mandant[]; auftragswesen: boolean | null; hinweise: string[] }

interface Kh {
  status(): Promise<Status>;
  mandanten(neu?: boolean): Promise<Scan>;
  aufScan(f: (fertig: number, gesamt: number) => void): () => void;
  speichereEinstellungen(e: Partial<Einstellungen>): Promise<Einstellungen>;
  vorlagen(): Promise<Vorlage[]>;
  speichereVorlagen(v: Vorlage[]): Promise<Vorlage[]>;
  gruppen(): Promise<Gruppe[]>;
  speichereGruppen(g: Gruppe[]): Promise<Gruppe[]>;
  ansicht(): Promise<Ansicht>;
  speichereAnsicht(a: Ansicht): Promise<Ansicht>;
  protokoll(): Promise<Protokollzeile[]>;
  standardAdressen(): Promise<StandardAdressen>;
  setzeStandardAdressen(nummer: number, liste: string[] | null): Promise<StandardAdressen>;
  waehleDateien(): Promise<Datei[]>;
  /** Bild für die Mail wählen → data:-URL (bleibt in der App, geht als eingebettetes Bild in die Mail). */
  waehleBild(): Promise<string | null>;
  /** Echte, ins Fenster gezogene Dateien; den Pfad bestimmt vorlade.cjs selbst. */
  dateiInfoVon(dateien: File[]): Promise<Datei[]>;
  mails(a: { modus: "entwurf"; vorlage: string; mails: { nummer: number; name: string; an: string[]; betreff: string; text: string; html: string; anhaenge: string[] }[] }): Promise<{ versand: string; ergebnisse: MailErgebnis[] }>;
  exportiere(a: { name: string; inhalt: string }): Promise<string | null>;
  oeffneOrdner(welcher: "daten" | "ausgang"): Promise<string>;
  waehleOrdner(): Promise<string | null>;
}
declare global { interface Window { kh: Kh } }
export const kh = () => window.kh;
/** Fehler aus dem Hauptprozess ohne Electrons Vorspann „Error invoking remote method '…': Error: “. */
export const fehlertext = (f: unknown) => (f instanceof Error ? f.message : String(f)).replace(/^(Error: )?Error invoking remote method '[^']+': (Error: )?/, "");

export const FELD: Record<Feld, string> = {
  email: "E-Mail", telefon: "Telefon", anschrift: "Anschrift", briefanrede: "Briefanrede", geburtsdatum: "Geburtsdatum",
  steuernummer: "Steuernummer", finanzamt: "Finanzamt", steuerid: "Steuer-ID", iban: "IBAN",
  ustid: "USt-IdNr.", rechtsform: "Rechtsform", register: "Register", zustaendig: "Zuständigkeit",
};
const FELD_MAIL: Record<Feld, string> = {
  email: "E-Mail-Adresse", telefon: "Telefonnummer", anschrift: "Anschrift", briefanrede: "Gewünschte Anrede in Briefen",
  geburtsdatum: "Geburtsdatum", steuernummer: "Steuernummer", finanzamt: "Zuständiges Finanzamt",
  steuerid: "Steuerliche Identifikationsnummer", iban: "Bankverbindung (IBAN)", ustid: "Umsatzsteuer-Identifikationsnummer",
  rechtsform: "Rechtsform", register: "Registergericht und Registernummer", zustaendig: "",
};
/** Was nur die Kanzlei selbst nachtragen kann, gehört nicht in eine Mail an den Mandanten. */
const NUR_INTERN: Feld[] = ["zustaendig"];
export const FELD_ERKLAERUNG: Record<Feld, string> = {
  email: "Mandant hat keine E-Mail-Adresse", telefon: "Keine Telefonnummer", anschrift: "Keine vollständige Anschrift",
  briefanrede: "Keine Briefanrede – Serienmails beginnen dann mit „Sehr geehrte Damen und Herren“", geburtsdatum: "Nur bei Personen",
  steuernummer: "Keine Steuernummer beim Finanzamt", finanzamt: "Kein Finanzamt eingetragen", steuerid: "Nur bei Personen, inkl. Prüfziffer",
  iban: "Keine Bankverbindung, inkl. Prüfziffer", ustid: "Nur bei Gesellschaften", rechtsform: "Nur bei Gesellschaften",
  register: "Nur bei registerpflichtigen Rechtsformen (GmbH, UG, KG, e. K. …)", zustaendig: "Kein Aufgabenbereich oder kein zuständiger Mitarbeiter",
};
export const TYP: Record<string, string> = { natural_person: "Person", individual_enterprise: "Einzelunternehmen", legal_person: "Gesellschaft" };
export const AUFTRAGSSTATUS: Record<string, string> = { "created/planned": "geplant", "in work": "in Arbeit", completed: "erledigt" };

/** Abgeschaltete Prüfregeln (Einstellungen) aus Lücken und Fehlern entfernen. */
export const mitRegeln = (m: Mandant, regeln: Partial<Record<Feld, boolean>> = {}): Mandant => ({
  ...m, luecken: m.luecken.filter((f) => regeln[f] !== false), fehlerhaft: m.fehlerhaft.filter((f) => regeln[f] !== false),
});

export type Ampel = "ok" | "pruefen" | "fehlt";
export const ampel = (m: Mandant): Ampel => (m.luecken.length ? "fehlt" : m.fehlerhaft.length || m.abruffehler ? "pruefen" : "ok");
// Gleiche Regel wie electron/pruefung.cjs: keine Trenner (, ; :), Klammern, Anführungszeichen, Steuerzeichen, kein „..“
const MAIL_RE = /^(?!.*\.\.)[^\s@,;:<>()[\]\\"\x00-\x1f\x7f]+@[^\s@,;:<>()[\]\\"\x00-\x1f\x7f.][^\s@,;:<>()[\]\\"\x00-\x1f\x7f]*\.[^\s@,;:<>()[\]\\"\x00-\x1f\x7f]+$/;
export const gueltigeMails = (m: Mandant) => (m.emails ?? []).filter((e) => MAIL_RE.test(e.adresse));
/** Anschreibbar, sobald irgendeine gültige Adresse da ist – auch nur die eines Gesellschafters. */
export const kannMail = (m: Mandant) => gueltigeMails(m).length > 0;

/** Festgelegte Standard-Adressen an den Mandanten hängen (nur solche, die DATEV beim Mandanten noch hat). */
export function mitStandard(m: Mandant, alle: StandardAdressen): Mandant {
  const fest = (alle[m.nummer] ?? []).filter((a) => gueltigeMails(m).some((e) => e.adresse === a));
  if (!fest.length) return m.festeAdressen ? { ...m, festeAdressen: null } : m;
  return { ...m, festeAdressen: fest, emails: m.emails.map((e) => ({ ...e, festgelegt: fest.includes(e.adresse) })) };
}

/** An wen die Serienmail geht. */
export type Ziel = "standard" | "eigene" | "alle";
export const ZIEL_TEXT: Record<Ziel, string> = {
  standard: "Standard-Adressen", eigene: "Alle eigenen Adressen", alle: "Eigene + Beziehungen",
};
/**
 * Adressen für einen Mandanten: eigene Wahl (nur diese Mail) vor der Regel.
 * „Standard“ = in der App festgelegte Adressen, sonst die DATEV-Standard-Adresse;
 * hat der Mandant keine eigene (z. B. GmbH ohne Mail), gehen die der Partner.
 */
export interface Anpassung { ersatz: Record<string, string>; extra: string[] }
export const KEINE_ANPASSUNG: Anpassung = { ersatz: {}, extra: [] };
export const istMail = (a: string) => MAIL_RE.test(a.trim());
/** Regel bzw. eigene Wahl, danach pro Mandant bearbeitete Adressen (ersatz) und von Hand ergänzte (extra). */
export function adressenFuer(m: Mandant, ziel: Ziel, wahl?: string[], anpassung: Anpassung = KEINE_ANPASSUNG): string[] {
  const basis = regelAdressen(m, ziel, wahl).map((a) => anpassung.ersatz[a]?.trim() || a);
  return [...new Set([...basis, ...anpassung.extra.map((a) => a.trim())].filter(istMail))];
}
function regelAdressen(m: Mandant, ziel: Ziel, wahl?: string[]): string[] {
  const g = gueltigeMails(m);
  if (wahl) return g.filter((e) => wahl.includes(e.adresse)).map((e) => e.adresse);
  if (ziel === "standard" && m.festeAdressen?.length) return g.filter((e) => m.festeAdressen!.includes(e.adresse)).map((e) => e.adresse);
  const eigene = g.filter((e) => e.eigen);
  if (ziel === "alle") return g.map((e) => e.adresse);
  if (ziel === "eigene") return (eigene.length ? eigene : g).map((e) => e.adresse);
  const std = eigene.find((e) => e.adresse === m.email) ?? eigene.find((e) => e.standard) ?? eigene[0];
  return std ? [std.adresse] : g.map((e) => e.adresse);
}
export const mailText = (e: Mail) => `${e.rolle}${e.eigen ? "" : " " + e.wer}${e.notiz ? " · " + e.notiz : ""}`;
/** Standard ohne eigene Wahl: festgelegte Adressen, sonst DATEV-Standard. */
export const standardFuer = (m: Mandant) => adressenFuer(m, "standard");

export const PLATZHALTER = ["Anrede", "Name", "Vorname", "Nachname", "Firma", "Strasse", "PLZ", "Ort", "Mandantennummer", "FehlendeAngaben", "Grussformel", "Datum", "Jahr", "Vorjahr", "Signatur"] as const;

/** Werte aller Platzhalter für einen Mandanten. */
export function platzhalterWerte(m: Mandant, signatur: string): Record<string, string> {
  const fehlend = [
    ...m.luecken.filter((f) => !NUR_INTERN.includes(f)).map((f) => "– " + FELD_MAIL[f]),
    ...m.fehlerhaft.filter((f) => !NUR_INTERN.includes(f)).map((f) => "– " + FELD_MAIL[f] + " (bitte noch einmal prüfen)"),
  ].join("\n");
  const d = new Date();
  return {
    Anrede: m.anrede || "Sehr geehrte Damen und Herren,", Name: m.name, Vorname: m.vorname || "", Nachname: m.nachname || m.firma || m.name,
    Firma: m.firma || (m.typ === "natural_person" ? "" : m.name), Strasse: m.strasse || "", PLZ: m.plz || "", Ort: m.ort || "",
    Mandantennummer: String(m.nummer), FehlendeAngaben: fehlend, Grussformel: m.grussformel || "Mit freundlichen Grüßen",
    Datum: d.toLocaleDateString("de-DE"), Jahr: String(d.getFullYear()), Vorjahr: String(d.getFullYear() - 1), Signatur: signatur,
  };
}

/** Platzhalter in einem Durchgang ersetzen (ein Wert aus DATEV mit „{{…}}“ wird nicht noch einmal ersetzt). */
export function fuellen(text: string, m: Mandant, signatur: string) {
  const w = platzhalterWerte(m, signatur);
  return text.replace(/\{\{(\w+)\}\}/g, (ganz, k) => (k in w ? w[k] : ganz));
}
/** Hat dieser Mandant etwas, das man ihn per Mail fragen kann? */
export const hatMailLuecken = (m: Mandant) => m.luecken.some((f) => !NUR_INTERN.includes(f)) || m.fehlerhaft.some((f) => !NUR_INTERN.includes(f));
export const braucheLuecken = (s: string) => /\{\{FehlendeAngaben\}\}/.test(s);

// ---------- Formatierte Mails (HTML) ----------
export const htmlSicher = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Alter Klartext (Vorlagen bis 1.3.5) → Absätze wie im Editor. */
export const textZuHtml = (text: string) => String(text ?? "").split(/\r?\n/).map((z) => `<p>${htmlSicher(z)}</p>`).join("");
export const htmlVon = (v: { text: string; html?: string }) => (v.html ? v.html : textZuHtml(v.text));
/** Platzhalter im HTML ersetzen; Werte aus DATEV werden maskiert, Zeilenumbrüche zu <br>. */
export function fuellenHtml(html: string, m: Mandant, signatur: string) {
  const w = platzhalterWerte(m, signatur);
  return html.replace(/\{\{(\w+)\}\}/g, (ganz, k) => (k in w ? htmlSicher(w[k]).replace(/\n/g, "<br>") : ganz));
}
/** Klartext aus dem HTML (Absätze und <br> → Zeilen), für den Klartext-Teil der Mail und die Prüfungen. */
export function htmlZuText(html: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  doc.querySelectorAll("li").forEach((li) => (li.querySelector("p") ?? li).prepend("– "));
  doc.querySelectorAll("img").forEach((i) => i.replaceWith("[Bild]"));
  const zeilen: string[] = [];
  doc.body.querySelectorAll("p, li").forEach((b) => { if (!b.querySelector("p")) zeilen.push(b.textContent ?? ""); });
  return zeilen.length ? zeilen.join("\n") : (doc.body.textContent ?? "");
}
export const offenePlatzhalter = (s: string) => /\{\{\w+\}\}/.test(s);

/** Anhang pro Mandant: Dateiname beginnt mit der Mandantennummer, z. B. „10004_Bescheid.pdf“. */
export const nrAusName = (name: string) => { const t = /^(\d+)[ _\-.]/.exec(name); return t ? Number(t[1]) : null; };
export const groesse = (b: number) => (b >= 1048576 ? (b / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
export const datum = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");
