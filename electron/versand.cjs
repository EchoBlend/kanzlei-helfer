/**
 * Mails erstellen: Outlook (klassisch, per COM) oder .eml-Dateien.
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

/** .eml mit X-Unsent: 1 — Outlook öffnet die Datei als Entwurf mit Senden-Knopf. */
function baueEml(m, anhaenge = []) {
  const kopf = `X-Unsent: 1\r\nTo: ${[].concat(m.an).join(", ")}\r\nSubject: =?utf-8?B?${b64(m.betreff)}?=\r\nMIME-Version: 1.0\r\n`;
  const text = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${zeilen76(b64(crlf(m.text)))}\r\n`;
  if (!anhaenge.length) return kopf + text;
  const g = "KH_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  let eml = `${kopf}Content-Type: multipart/mixed; boundary="${g}"\r\n\r\n--${g}\r\n${text}`;
  for (const p of anhaenge) {
    const name = `=?utf-8?B?${b64(path.basename(p))}?=`;
    const typ = /\.pdf$/i.test(p) ? "application/pdf" : "application/octet-stream";
    eml += `--${g}\r\nContent-Type: ${typ}; name="${name}"\r\nContent-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename="${name}"\r\n\r\n${zeilen76(fs.readFileSync(p).toString("base64"))}\r\n`;
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

const OUTLOOK_SKRIPT = (datei) => `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$auftrag = Get-Content -Raw -Encoding UTF8 -LiteralPath '${datei.replace(/'/g, "''")}' | ConvertFrom-Json
$erg = @()
try { $ol = New-Object -ComObject Outlook.Application } catch {
  $m = $_.Exception.Message
  foreach ($x in $auftrag.mails) { $erg += @{ nummer = $x.nummer; ok = $false; info = "Outlook nicht erreichbar: $m" } }
  ConvertTo-Json -InputObject @($erg) -Compress; exit
}
foreach ($x in $auftrag.mails) {
  try {
    $i = $ol.CreateItem(0)
    $i.To = (@($x.an) -join '; ');$i.Subject = $x.betreff; $i.Body = $x.text; $i.Categories = 'Kanzlei-Helfer'
    foreach ($p in @($x.anhaenge)) { if ($p) { [void]$i.Attachments.Add([string]$p) } }
    if ($auftrag.modus -eq 'senden') { $i.Send() } else { $i.Save() }
    $erg += @{ nummer = $x.nummer; ok = $true; info = '' }
  } catch { $erg += @{ nummer = $x.nummer; ok = $false; info = $_.Exception.Message } }
}
ConvertTo-Json -InputObject @($erg) -Compress
`;

function viaOutlook(mails, modus, tmpOrdner) {
  fs.mkdirSync(tmpOrdner, { recursive: true });
  const datei = path.join(tmpOrdner, `auftrag-${Date.now()}.json`);
  fs.writeFileSync(datei, JSON.stringify({ modus, mails: mails.map((m) => ({ ...m, text: crlf(m.text) })) }), "utf8");
  return new Promise((fertig) => {
    const kind = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"],
      { timeout: 180000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (fehler, aus) => {
        fs.rmSync(datei, { force: true }); // enthält Adressen und Texte
        try {
          const erg = JSON.parse(String(aus).trim().split(/\r?\n/).pop());
          fertig(Array.isArray(erg) ? erg : [erg]);
        } catch {
          const info = fehler ? fehler.message : "Keine Antwort von Outlook";
          fertig(mails.map((m) => ({ nummer: m.nummer, ok: false, info })));
        }
      });
    kind.stdin.end(OUTLOOK_SKRIPT(datei) + "\n\n"); // Leerzeile nötig, sonst bleibt die Ausgabe leer
  });
}

/**
 * Erstellt alle Mails eines Auftrags. Ungültige Adressen oder fehlende Anhänge
 * scheitern einzeln, der Rest geht trotzdem.
 */
async function erstelleMails({ modus, mails }, { versand, ausgang, tmp }) {
  if (modus !== "entwurf" && modus !== "senden") throw new Error("Modus unbekannt");
  const ergebnisse = new Map();
  const bereit = [];
  for (const m of mails) {
    try {
      const an = [].concat(m.an || []).map((a) => String(a).trim());
      if (!an.length) throw new Error("Keine Adresse");
      for (const a of an) if (!MAIL_RE.test(a)) throw new Error(`Ungültige Adresse: ${a}`);
      bereit.push({ ...m, an, anhaenge: pruefeAnhaenge(m.anhaenge) });
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
    for (const e of await viaOutlook(bereit, modus, tmp)) ergebnisse.set(e.nummer, e);
  }
  return mails.map((m) => ({ ...ergebnisse.get(m.nummer), anhaenge: (m.anhaenge || []).map((p) => path.basename(p)) }));
}

module.exports = { baueEml, erstelleMails, MAX_ANHANG };
