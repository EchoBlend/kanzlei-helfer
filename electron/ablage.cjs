/**
 * Alles, was der Kanzlei-Helfer auf die Platte schreibt, liegt in einem Ordner
 * (%APPDATA%\Kanzlei-Helfer): Einstellungen, Vorlagen, Protokoll, .eml-Ausgang.
 * Mandantendaten aus DATEV werden nie gespeichert, sie leben nur im Arbeitsspeicher.
 */
const fs = require("node:fs");
const path = require("node:path");
const { FELDER } = require("./pruefung.cjs");

const STANDARD = {
  datevconnect: "http://localhost:58454/datev/api/master-data/v1",
  versand: "outlook", // "outlook" | "eml"
  signatur: "Ihr Team der Steuerkanzlei",
  nurAktive: true,
  demo: false,
  design: "system", // "system" | "hell" | "dunkel"
  regeln: {}, // Prüfregel → false heißt abgeschaltet; fehlt = an
};
const SPALTEN = ["Zeit", "Modus", "Vorlage", "Mandantennr", "Mandant", "An", "Betreff", "Ergebnis", "Anhaenge"];

function csvZeile(werte) {
  return werte.map((w) => '"' + String(w ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""') + '"').join(";");
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
    zeilen.push(Object.fromEntries(SPALTEN.map((s, i) => [s, felder[i] ?? ""])));
  }
  return zeilen;
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
    ausgang: datei("ausgang"),
    tmp: datei("tmp"),

    einstellungen() {
      return { ...STANDARD, ...liesJson("einstellungen.json", {}) };
    },
    speichereEinstellungen(neu) {
      const e = { ...this.einstellungen() };
      for (const k of Object.keys(STANDARD)) {
        if (!(k in neu)) continue;
        if (k === "regeln") e.regeln = Object.fromEntries(Object.entries(neu.regeln || {}).filter(([r, v]) => FELDER.includes(r) && typeof v === "boolean"));
        else e[k] = typeof STANDARD[k] === "boolean" ? !!neu[k] : String(neu[k]);
      }
      if (!["outlook", "eml"].includes(e.versand)) e.versand = STANDARD.versand;
      if (!["system", "hell", "dunkel"].includes(e.design)) e.design = STANDARD.design;
      schreibJson("einstellungen.json", e);
      return e;
    },

    vorlagen() {
      const v = liesJson("vorlagen.json", null);
      return Array.isArray(v) ? v : JSON.parse(fs.readFileSync(path.join(__dirname, "standard-vorlagen.json"), "utf8"));
    },
    speichereVorlagen(liste) {
      if (!Array.isArray(liste)) throw new Error("Vorlagen: Liste erwartet");
      const sauber = liste.map((v) => ({ id: String(v.id), name: String(v.name), betreff: String(v.betreff ?? ""), text: String(v.text ?? "") }));
      schreibJson("vorlagen.json", sauber);
      return sauber;
    },

    /** Eigene Mandantengruppen, nur in der App (DATEV bleibt unverändert). */
    gruppen() {
      const g = liesJson("gruppen.json", []);
      return Array.isArray(g) ? g : [];
    },
    speichereGruppen(liste) {
      if (!Array.isArray(liste)) throw new Error("Gruppen: Liste erwartet");
      const sauber = liste.map((g) => ({
        id: String(g.id), name: String(g.name).trim().slice(0, 80) || "Gruppe",
        mitglieder: [...new Set((g.mitglieder || []).map(Number).filter(Number.isFinite))],
      }));
      schreibJson("gruppen.json", sauber);
      return sauber;
    },

    /** Tabellenansicht (sichtbare Spalten, Gruppierung, Filterzeile) überdauert den Neustart. */
    ansicht() {
      const a = liesJson("ansicht.json", {});
      return a && typeof a === "object" && !Array.isArray(a) ? a : {};
    },
    speichereAnsicht(a) {
      if (!a || typeof a !== "object" || Array.isArray(a) || JSON.stringify(a).length > 20000) throw new Error("Ansicht ungültig");
      schreibJson("ansicht.json", a);
      return a;
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
