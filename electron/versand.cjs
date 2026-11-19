/**
 * Mail-Vorlagen erstellen: .eml-Dateien (Standard, rein lokal) oder Outlook-Entwürfe (klassisch, per COM).
 * Die App sendet nie selbst.
 *
 * Outlook läuft über ein kurzes PowerShell-Skript. Das Skript geht über stdin hinein,
 * nicht als -EncodedCommand: Den prüft Defender beim Start und das kostet fast 2 s
 * (gemessen bei Machbar, 05.11.). Die Mails selbst liegen als UTF-8-JSON in einer
 * Datei, weil stdin in der Codepage der Konsole gelesen wird.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { MAIL_RE } = require("./pruefung.cjs");

const MAX_ANHANG = 25 * 1024 * 1024;
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const zeilen76 = (s) => s.replace(/(.{76})/g, "$1\r\n");
const crlf = (s) => String(s ?? "").replace(/\r?\n/g, "\r\n");

/** Betreff als RFC-2047-Wörter, gefaltet: keine Kopfzeile über 78 Zeichen, egal wie lang der Betreff ist. */
function kopfText(s) {
  const woerter = [];
  let teil = "";
  for (const z of String(s ?? "")) {
    if (Buffer.byteLength(teil + z, "utf8") > 39) { woerter.push(teil); teil = ""; }
    teil += z;
  }
  if (teil || !woerter.length) woerter.push(teil);
  return woerter.map((w) => `=?utf-8?B?${b64(w)}?=`).join("\r\n ");
}
// RFC 5987: Dateiname für filename*= (zusätzlich zum verbreiteten name="=?utf-8?B?…?=")
const rfc5987 = (s) => encodeURIComponent(s).replace(/['()*!]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

const grenze = () => "KH_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
const MAX_BILDER = 15 * 1024 * 1024;

/** Gleiche Grundschrift und Absätze wie im Editor (src/index.css .mailtext) – so sieht die Mail aus wie geschrieben. */
const htmlDokument = (body) => '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  "<style>p{margin:0}ul,ol{margin-top:0;margin-bottom:0}a{color:#0563C1}</style></head>" +
  `<body style="font-family:Aptos,Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.35;color:#000">${body}</body></html>`;

/**
 * Formatierten Text für die Mail aufbereiten: eingefügte Bilder (data:) werden eingebettete Bilder (cid),
 * Bilder mit fremder Quelle (http, Datei …) fallen weg – die Mail lädt beim Empfänger nichts nach. Ohne Skripte.
 * @returns { html, bilder: [{ cid, typ, name, daten }] }
 */
function bereiteHtml(roh) {
  const bilder = [];
  let summe = 0;
  let h = String(roh ?? "").replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  h = h.replace(/<img\b[^>]*>/gi, (tag) => {
    const t = /\ssrc\s*=\s*"(data:image\/(png|jpeg|gif|webp|bmp);base64,([A-Za-z0-9+/=]+))"/i.exec(tag);
    if (!t) return "";
    const daten = Buffer.from(t[3], "base64");
    summe += daten.length;
    if (summe > MAX_BILDER) throw new Error("Bilder in der Mail zu groß (zusammen max. 15 MB)");
    const nr = bilder.length + 1, art = t[2].toLowerCase();
    const cid = `bild${nr}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@kanzlei-helfer`;
    bilder.push({ cid, typ: `image/${art}`, name: `bild${nr}.${art === "jpeg" ? "jpg" : art}`, daten });
    return tag.replace(t[1], `cid:${cid}`);
  });
  h = h
    // Farben als #RRGGBB: Chromium schreibt rgb(…), ältere Outlook-Fassungen verstehen nur Hex sicher
    .replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)/gi,
      (_g, r, g, b) => "#" + [r, g, b].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("").toUpperCase())
    // Outlook (Word) kennt <mark> nicht: Hervorhebung als <span> mit Hintergrundfarbe
    .replace(/<mark\b([^>]*)>/gi, (_g, a) => `<span${(/\sstyle="[^"]*"/i.exec(a) || [""])[0]}>`).replace(/<\/mark>/gi, "</span>")
    // Absätze ohne Abstand (auch wenn der Empfänger <style> ignoriert); leere Absätze sonst zusammengeklappt
    .replace(/<p\b([^>]*)>/gi, (_g, a) => {
      const stil = /\sstyle="([^"]*)"/i.exec(a);
      return `<p style="margin:0${stil ? ";" + stil[1] : ""}"${a.replace(/\sstyle="[^"]*"/i, "")}>`;
    })
    .replace(/(<p\b[^>]*>)<\/p>/gi, "$1<br></p>");
  return { html: htmlDokument(h), bilder };
}

/** Empfänger stehen immer in BCC (Datenschutz: Empfänger sehen einander nie).
 * .eml mit X-Unsent: 1 — Outlook öffnet die Datei als neue, ungesendete Mail mit Senden-Knopf.
 * Mit m.html: Klartext + formatierte Fassung (multipart/alternative), Bilder eingebettet (multipart/related). */
function baueEml(m, anhaenge = []) {
  const kopf = `X-Unsent: 1\r\nBcc: ${[].concat(m.an).join(",\r\n ")}\r\nSubject: ${kopfText(m.betreff)}\r\nMIME-Version: 1.0\r\n`;
  let text = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${zeilen76(b64(crlf(m.text)))}\r\n`;
  const formatiert = m.formatiert ?? (m.html ? bereiteHtml(m.html) : null);
  if (formatiert) {
    let html = `Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${zeilen76(b64(formatiert.html))}\r\n`;
    if (formatiert.bilder.length) {
      const r = grenze();
      html = `Content-Type: multipart/related; boundary="${r}"\r\n\r\n--${r}\r\n${html}` + formatiert.bilder.map((b) =>
        `--${r}\r\nContent-Type: ${b.typ}; name="${b.name}"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${b.cid}>\r\n` +
        `Content-Disposition: inline; filename="${b.name}"\r\n\r\n${zeilen76(b.daten.toString("base64"))}\r\n`).join("") + `--${r}--\r\n`;
    }
    const a = grenze();
    text = `Content-Type: multipart/alternative; boundary="${a}"\r\n\r\n--${a}\r\n${text}--${a}\r\n${html}--${a}--\r\n`;
  }
  if (!anhaenge.length) return kopf + text;
  const g = grenze();
  let eml = `${kopf}Content-Type: multipart/mixed; boundary="${g}"\r\n\r\n--${g}\r\n${text}`;
  for (const p of anhaenge) {
    const datei = path.basename(p);
    const name = `=?utf-8?B?${b64(datei)}?=`;
    const typ = /\.pdf$/i.test(p) ? "application/pdf" : "application/octet-stream";
    eml += `--${g}\r\nContent-Type: ${typ}; name="${name}"\r\nContent-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment;\r\n filename="${name}";\r\n filename*=UTF-8''${rfc5987(datei)}\r\n\r\n${zeilen76(fs.readFileSync(p).toString("base64"))}\r\n`;
  }
  return eml + `--${g}--\r\n`;
}

function pruefeAnhaenge(liste) {
  return (liste || []).map((p) => {
    const st = fs.statSync(p, { throwIfNoEntry: false });
    if (!st || !st.isFile()) throw new Error(`Anhang fehlt: ${path.basename(String(p))}`);
    if (st.size > MAX_ANHANG) throw new Error(`Anhang zu groß (max. 25 MB): ${path.basename(p)}`);
    return p;
  });
}

// Der Pfad der Auftragsdatei kommt über die Umgebung (UTF-16, Umlaute im Benutzernamen bleiben heil),
// nicht als Text im Skript (stdin läuft in der Codepage der Konsole). Pro Mail eine JSON-Zeile:
// Bricht der Lauf ab, sind die schon angelegten Entwürfe trotzdem bekannt (keine Doppelten beim Wiederholen).
const OUTLOOK_SKRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$auftrag = Get-Content -Raw -Encoding UTF8 -LiteralPath $env:KH_AUFTRAG | ConvertFrom-Json
function Melde($nummer, $ok, $info) { [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ nummer = $nummer; ok = $ok; info = [string]$info })); [Console]::Out.Flush() }
try { $ol = New-Object -ComObject Outlook.Application } catch {
  $m = $_.Exception.Message
  foreach ($x in $auftrag.mails) { Melde $x.nummer $false "Outlook nicht erreichbar: $m" }
  exit
}
foreach ($x in $auftrag.mails) {
  try {
    $i = $ol.CreateItem(0)
    $i.BCC = (@($x.an) -join '; '); $i.Subject = $x.betreff; $i.Categories = 'Kanzlei-Helfer'
    foreach ($p in @($x.anhaenge)) { if ($p) { [void]$i.Attachments.Add([string]$p) } }
    # Eingebettete Bilder: Anhang mit Content-ID (PR_ATTACH_CONTENT_ID), versteckt (PR_ATTACHMENT_HIDDEN); das HTML zeigt auf cid:
    foreach ($b in @($x.bilder)) { if ($b) {
      $a = $i.Attachments.Add([string]$b.pfad, 1, 0)
      $a.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', [string]$b.cid)
      $a.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)
    } }
    if ($x.html) { $i.HTMLBody = [string]$x.html } else { $i.Body = $x.text }
    $i.Save()  # nie Send(): Die App legt nur Entwürfe an
    Melde $x.nummer $true ''
  } catch { Melde $x.nummer $false $_.Exception.Message }
}
`;
const POWERSHELL = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

function viaOutlook(mails, tmpOrdner) {
  fs.mkdirSync(tmpOrdner, { recursive: true });
  const lauf = Date.now();
  const datei = path.join(tmpOrdner, `auftrag-${lauf}.json`);
  // Bilder als Dateien neben den Auftrag (Outlook bettet sie aus Dateien ein); das HTML zeigt per cid: darauf
  const bildDateien = [];
  const auftrag = mails.map((m, i) => {
    const bilder = (m.formatiert?.bilder ?? []).map((b, j) => {
      const pfad = path.join(tmpOrdner, `bild-${lauf}-${i}-${j}-${b.name}`);
      fs.writeFileSync(pfad, b.daten);
      bildDateien.push(pfad);
      return { pfad, cid: b.cid };
    });
    return { nummer: m.nummer, an: m.an, betreff: m.betreff, text: crlf(m.text), html: m.formatiert?.html ?? "", bilder, anhaenge: m.anhaenge };
  });
  fs.writeFileSync(datei, JSON.stringify({ mails: auftrag }), "utf8");
  const zeit = Math.min(60000 + 5000 * mails.length, 30 * 60000);
  return new Promise((fertig) => {
    // RemoteSigned statt Bypass: reicht für die signierten Windows-Module, ändert keine Einstellung (nur dieser Prozess).
    const kind = execFile(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-Command", "-"],
      { timeout: zeit, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, KH_AUFTRAG: datei } }, (fehler, aus) => {
        for (const f of [datei, ...bildDateien]) fs.rmSync(f, { force: true }); // enthalten Adressen, Texte, Bilder
        const erg = new Map();
        for (const z of String(aus || "").split(/\r?\n/)) {
          try { const e = JSON.parse(z); if (Number.isInteger(e?.nummer)) erg.set(e.nummer, { nummer: e.nummer, ok: e.ok === true, info: String(e.info ?? "") }); } catch { /* keine Ergebniszeile */ }
        }
        const ohne = fehler ? `Abgebrochen (${fehler.killed ? "Zeitlimit" : fehler.message}) – bitte im Outlook-Ordner „Entwürfe“ nachsehen` : "Keine Rückmeldung von Outlook – bitte im Outlook-Ordner „Entwürfe“ nachsehen";
        fertig(mails.map((m) => erg.get(m.nummer) || { nummer: m.nummer, ok: false, info: ohne }));
      });
    kind.stdin.on("error", () => { /* PowerShell schon beendet; Ergebnis kommt über den Rückruf */ });
    kind.stdin.end(OUTLOOK_SKRIPT + "\n\n"); // Leerzeile nötig, sonst bleibt die Ausgabe leer
  });
}

/**
 * Erstellt alle Mails eines Auftrags. Ungültige Adressen oder fehlende Anhänge
 * scheitern einzeln, der Rest geht trotzdem.
 */
async function erstelleMails({ modus, mails }, { versand, ausgang, tmp }) {
  if (modus !== "entwurf") throw new Error("Nur Entwürfe: Die App versendet nie selbst");
  const ergebnisse = new Map();
  const bereit = [];
  for (const m of mails) {
    try {
      if (!Number.isInteger(m.nummer)) throw new Error("Mandantennummer fehlt");
      const an = [].concat(m.an || []).map((a) => String(a).trim());
      if (!an.length) throw new Error("Keine Adresse");
      for (const a of an) if (!MAIL_RE.test(a)) throw new Error(`Ungültige Adresse: ${a}`);
      if (m.html !== undefined && typeof m.html !== "string") throw new Error("Formatierter Text ungültig");
      // Formatierte Fassung vorab aufbereiten: zu große Bilder scheitern einzeln, bevor etwas entsteht
      bereit.push({ ...m, an, anhaenge: pruefeAnhaenge(m.anhaenge), formatiert: m.html ? bereiteHtml(m.html) : null });
    } catch (f) { ergebnisse.set(m.nummer, { nummer: m.nummer, ok: false, info: f.message }); }
  }
  if (versand === "eml") {
    fs.mkdirSync(ausgang, { recursive: true });
    for (const m of bereit) {
      try {
        const d = new Date(), z = (n) => String(n).padStart(2, "0");
        const stempel = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
        const datei = path.join(ausgang, `${stempel}_${m.nummer}_${Math.random().toString(36).slice(2, 6)}.eml`);
        fs.writeFileSync(datei, baueEml(m, m.anhaenge), "utf8");
        ergebnisse.set(m.nummer, { nummer: m.nummer, ok: true, info: datei });
      } catch (f) { ergebnisse.set(m.nummer, { nummer: m.nummer, ok: false, info: f.message }); }
    }
  } else if (bereit.length) {
    for (const e of await viaOutlook(bereit, tmp)) ergebnisse.set(e.nummer, e);
  }
  return mails.map((m) => ({ nummer: m.nummer, ok: false, info: "Kein Ergebnis", ...ergebnisse.get(m.nummer), anhaenge: (m.anhaenge || []).map((p) => path.basename(String(p))) }));
}

module.exports = { baueEml, bereiteHtml, erstelleMails, MAX_ANHANG };
