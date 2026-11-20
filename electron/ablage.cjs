/**
 * Alles, was der Kanzlei-Helfer auf die Platte schreibt, liegt in einem Ordner
 * (%APPDATA%\Kanzlei-Helfer): Einstellungen, Vorlagen, Gruppen (nur Mandantennummern), Ansicht,
 * Protokoll (Zeit, Mandantennr., Name, Empfänger, Betreff, Anhangnamen), festgelegte Standard-Adressen
 * (Mandantennr. → E-Mail-Adressen) und .eml-Ausgang.
 * Die DATEV-Stammdaten selbst leben nur im Arbeitsspeicher. Deinstallieren löscht den Ordner.
 */
const fs = require("node:fs");
const path = require("node:path");
const { FELDER } = require("./pruefung.cjs");
const { DATEV_STANDARD } = require("./netz.cjs");

const STANDARD = {
  datevconnect: DATEV_STANDARD,
  versand: "eml", // "eml" (rein lokal) | "outlook" (Entwurf im Postfach, wird mit Exchange/M365 abgeglichen)
  emlOrdner: "", // Zielordner für .eml-Dateien; leer = Unterordner „ausgang“ im Datenordner
  signatur: "Ihr Team der Steuerkanzlei",
  nurAktive: true,
  demo: false,
  design: "system", // "system" | "hell" | "dunkel"
  regeln: {}, // Prüfregel → false heißt abgeschaltet; fehlt = an
};
const SPALTEN = ["Zeit", "Modus", "Vorlage", "Mandantennr", "Mandant", "An", "Betreff", "Ergebnis", "Anhaenge"];

// Excel führt Zellen, die mit = + - @ (oder Tab/CR) beginnen, als Formel aus (z. B. =HYPERLINK(...) mit Mandantendaten).
// Solche Werte bekommen ein ' vorangestellt – Excel zeigt sie dann als Text.
const FORMEL = /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/;
const entschaerfe = (w) => (FORMEL.test(w) ? "'" + w : w);
function csvZeile(werte) {
  return werte.map((w) => '"' + entschaerfe(String(w ?? "").replace(/[\r\n]+/g, " ")).replace(/"/g, '""') + '"').join(";");
}

/** Liest Zeilen, die csvZeile geschrieben hat (Felder in "", ; als Trenner). */
function csvLesen(text) {
  const zeilen = [];
  for (const roh of text.replace(/^﻿/, "").split(/\r?\n/).slice(1)) {
    if (!roh.trim()) continue;
    const felder = [];
    let f = "", inQ = false;
    for (let i = 0; i < roh.length; i++) {
      const c = roh[i];
      if (inQ) {
        if (c === '"' && roh[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') inQ = false;
        else f += c;
      } else if (c === '"') inQ = true;
      else if (c === ";") { felder.push(f); f = ""; }
      else f += c;
    }
    felder.push(f);
    zeilen.push(Object.fromEntries(SPALTEN.map((s, i) => [s, (felder[i] ?? "").replace(/^'(?=[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20])/, "")])));
  }
  return zeilen;
}

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x, max) => String(x ?? "").slice(0, max);

function saubereEinstellungen(roh) {
  const r = istObjekt(roh) ? roh : {};
  const e = { ...STANDARD };
  for (const k of Object.keys(STANDARD)) {
    if (!(k in r)) continue;
    if (k === "regeln") e.regeln = Object.fromEntries(Object.entries(istObjekt(r.regeln) ? r.regeln : {}).filter(([n, v]) => FELDER.includes(n) && typeof v === "boolean"));
    else e[k] = typeof STANDARD[k] === "boolean" ? r[k] === true : text(r[k], 2000);
  }
  e.emlOrdner = e.emlOrdner.trim();
  if (e.emlOrdner && !path.isAbsolute(e.emlOrdner)) e.emlOrdner = "";
  if (!["outlook", "eml"].includes(e.versand)) e.versand = STANDARD.versand;
  if (!["system", "hell", "dunkel"].includes(e.design)) e.design = STANDARD.design;
  return e;
}
const saubereVorlagen = (liste) => liste.filter(istObjekt).slice(0, 500)
  .map((v) => ({ id: text(v.id, 100), name: text(v.name, 200), betreff: text(v.betreff, 1000), text: text(v.text, 100000),
    // formatierte Fassung (Farben, eingebettete Bilder als data:) – nur wenn vorhanden
    ...(typeof v.html === "string" && v.html ? { html: v.html.slice(0, 20 * 1024 * 1024) } : {}) }));
const saubereGruppen = (liste) => liste.filter(istObjekt).slice(0, 500).map((g) => ({
  id: text(g.id, 100), name: text(g.name, 80).trim() || "Gruppe",
  mitglieder: [...new Set((Array.isArray(g.mitglieder) ? g.mitglieder : []).map(Number).filter(Number.isInteger))],
}));
/** Festgelegte Standard-Adressen: { Mandantennummer: [Adresse, …] } – nur in der App, DATEV bleibt unverändert. */
function saubereStandardAdressen(roh) {
  const r = {};
  if (!istObjekt(roh)) return r;
  for (const [k, v] of Object.entries(roh).slice(0, 50000)) {
    const nr = Number(k);
    if (!Number.isInteger(nr) || !Array.isArray(v)) continue;
    const liste = [...new Set(v.filter((a) => typeof a === "string" && a.trim() && a.length <= 320).map((a) => a.trim()))].slice(0, 50);
    if (liste.length) r[nr] = liste;
  }
  return r;
}
function saubereAnsicht(a) {
  if (!istObjekt(a)) return {};
  const sauber = {};
  if (Array.isArray(a.spalten)) sauber.spalten = a.spalten.filter((x) => typeof x === "string").slice(0, 100).map((x) => x.slice(0, 50));
  if (typeof a.gruppe === "string" || a.gruppe === null) sauber.gruppe = a.gruppe === null ? null : a.gruppe.slice(0, 50);
  if (typeof a.filterzeile === "boolean") sauber.filterzeile = a.filterzeile;
  if (istObjekt(a.sort) && typeof a.sort.id === "string" && typeof a.sort.ab === "boolean") sauber.sort = { id: a.sort.id.slice(0, 50), ab: a.sort.ab };
  // Spaltenbreiten (Pixel) je Spalte, vom Benutzer gezogen
  if (istObjekt(a.breiten)) {
    sauber.breiten = Object.fromEntries(Object.entries(a.breiten).filter(([k, v]) => k.length <= 50 && Number.isFinite(v))
      .slice(0, 100).map(([k, v]) => [k, Math.round(Math.min(2000, Math.max(48, v)))]));
  }
  return sauber;
}

function oeffneAblage(ordner) {
  fs.mkdirSync(ordner, { recursive: true });
  const datei = (n) => path.join(ordner, n);
  const liesJson = (n, sonst) => {
    try { return JSON.parse(fs.readFileSync(datei(n), "utf8")); } catch { return sonst; }
  };
  const schreibJson = (n, wert) => fs.writeFileSync(datei(n), JSON.stringify(wert, null, 2), "utf8");

  return {
    ordner,
    /** Zielordner der .eml-Dateien: gewählter Ordner oder Standard im Datenordner. */
    get ausgang() {
      const o = String(this.einstellungen().emlOrdner || "").trim();
      return o && path.isAbsolute(o) ? o : datei("ausgang");
    },
    tmp: datei("tmp"),

    einstellungen() {
      return saubereEinstellungen(liesJson("einstellungen.json", {}));
    },
    speichereEinstellungen(neu) {
      const e = saubereEinstellungen({ ...this.einstellungen(), ...(neu && typeof neu === "object" ? neu : {}) });
      schreibJson("einstellungen.json", e);
      return e;
    },

    // Beim Lesen wie beim Speichern geprüft: Eine kaputte oder fremde Datei darf die App nicht lahmlegen.
    vorlagen() {
      const v = liesJson("vorlagen.json", null);
      return Array.isArray(v) ? saubereVorlagen(v) : JSON.parse(fs.readFileSync(path.join(__dirname, "standard-vorlagen.json"), "utf8"));
    },
    speichereVorlagen(liste) {
      if (!Array.isArray(liste)) throw new Error("Vorlagen: Liste erwartet");
      const sauber = saubereVorlagen(liste);
      schreibJson("vorlagen.json", sauber);
      return sauber;
    },

    /** Eigene Mandantengruppen, nur in der App (DATEV bleibt unverändert). */
    gruppen() {
      const g = liesJson("gruppen.json", []);
      return Array.isArray(g) ? saubereGruppen(g) : [];
    },
    speichereGruppen(liste) {
      if (!Array.isArray(liste)) throw new Error("Gruppen: Liste erwartet");
      const sauber = saubereGruppen(liste);
      schreibJson("gruppen.json", sauber);
      return sauber;
    },

    /** Tabellenansicht (sichtbare Spalten, Gruppierung, Filterzeile) überdauert den Neustart. */
    ansicht() {
      return saubereAnsicht(liesJson("ansicht.json", {}));
    },
    speichereAnsicht(a) {
      const sauber = saubereAnsicht(a);
      schreibJson("ansicht.json", sauber);
      return sauber;
    },

    /** Pro Mandant festgelegte Standard-Adressen für Mails (überstimmen die Standard-Adresse aus DATEV). */
    standardAdressen() {
      return saubereStandardAdressen(liesJson("standard-adressen.json", {}));
    },
    /** liste leer oder null → Festlegung aufheben (wieder DATEV-Standard). */
    setzeStandardAdressen(nummer, liste) {
      if (!Number.isInteger(nummer)) throw new Error("Mandantennummer fehlt");
      const alle = this.standardAdressen();
      if (Array.isArray(liste) && liste.length) alle[nummer] = liste; else delete alle[nummer];
      const sauber = saubereStandardAdressen(alle);
      schreibJson("standard-adressen.json", sauber);
      return sauber;
    },

    /** Zwischendateien für Outlook (Adressen, Texte) – beim Start und Beenden weg. */
    raeumeTmp() {
      try { fs.rmSync(datei("tmp"), { recursive: true, force: true }); } catch { /* nächstes Mal */ }
    },

    protokoll() {
      try { return csvLesen(fs.readFileSync(datei("protokoll.csv"), "utf8")); } catch { return []; }
    },
    protokolliere(eintraege) {
      const f = datei("protokoll.csv");
      // BOM, damit Excel die Umlaute richtig zeigt
      if (!fs.existsSync(f)) fs.writeFileSync(f, "﻿" + csvZeile(SPALTEN) + "\r\n", "utf8");
      fs.appendFileSync(f, eintraege.map((e) => csvZeile(SPALTEN.map((s) => e[s])) + "\r\n").join(""), "utf8");
    },
  };
}

module.exports = { oeffneAblage, csvZeile, csvLesen, STANDARD };
