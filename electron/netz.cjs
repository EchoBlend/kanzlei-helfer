/**
 * Der einzige Netzweg der App: DATEVconnect im eigenen Netz (Standard: LIZENZSERVER).
 *
 * - Adresse frei änderbar (Eingabe des Benutzers, keine Prüfung, bleibt so stehen). Für die Abfragen nimmt die App
 *   davon die Basis …/master-data/v1 (datevBasis) und hängt /clients, /addressees … selbst an.
 *   In der Kanzlei antwortet DATEVconnect per https auf Port 58452 (gemessen 19.11.). Das Zertifikat prüft Chromium
 *   gegen den Windows-Zertifikatspeicher; Mandantendaten gehen dabei nirgends hin.
 * - Vor jeder Anfrage: Der Servername muss ausschließlich auf Adressen im eigenen Netz zeigen (10.x, 172.16–31.x,
 *   192.168.x, Loopback, Link-Local, IPv6 ULA). Sonst – z. B. Laptop zu Hause, Provider-DNS biegt unbekannte Namen
 *   auf Werbeserver um, Tippfehler auf eine Internet-Adresse – wird gar keine Verbindung aufgebaut.
 * - Nur GET, keine Weiterleitungen, keine Cookies, 30 s Zeitlimit. Anmeldung wie im Browser: mit dem Windows-Konto
 *   (Kerberos/NTLM), ausschließlich beim eingestellten Server (haupt.cjs) – nie Kennwort-Abfrage, nie an andere.
 */
const dns = require("node:dns");
const net = require("node:net");

const DATEV_STANDARD = "https://LIZENZSERVER:58452/datev/api/master-data/v1";
// Standard bis 1.3.1 (http, Port 58454) – gespeichert wird er auf den neuen Standard umgestellt.
const FRUEHERER_STANDARD = "http://lizenzserver:58454/datev/api/master-data/v1";
const WEB = ["http:", "https:"];
const ZEITLIMIT_MS = 30000;

/** Eingabe aus den Einstellungen, wie eingetragen (nur getrimmt). Leer → Standard; der alte Standard bis 1.3.1 → neuer Standard. */
function datevAdresse(eingabe) {
  const s = String(eingabe ?? "").trim();
  return !s || s.toLowerCase().replace(/\/+$/, "") === FRUEHERER_STANDARD ? DATEV_STANDARD : s;
}
/**
 * Basis für die Abfragen aus der eingetragenen Adresse: ohne Schema → https; Adressen wie
 * …/master-data/v1/clients?select=… → …/master-data/v1; sonst ohne Parameter und Schrägstrich am Ende.
 */
function datevBasis(adresse) {
  let s = datevAdresse(adresse);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    const basis = /^(.*?\/datev\/api\/master-data\/v1)(?=\/|$)/i.exec(u.pathname);
    return `${u.protocol}//${u.host}${basis ? basis[1] : u.pathname.replace(/\/+$/, "")}`;
  } catch { return s; }
}

/** Adresse im eigenen Netz (RFC 1918, Loopback, Link-Local, IPv6 ULA/Link-Local)? */
function privateAdresse(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1") return true;
    const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (v4) return privateAdresse(v4[1]);
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  return false;
}

/** Wirft, wenn der Name nicht ausschließlich auf Adressen im eigenen Netz zeigt. */
async function pruefeImKanzleinetz(host, nachschlagen = dns.promises.lookup) {
  const name = host.replace(/^\[|\]$/g, "");
  const liste = net.isIP(name) ? [{ address: name }] : await nachschlagen(name, { all: true, verbatim: true });
  if (!liste.length || !liste.every((a) => privateAdresse(a.address))) {
    throw new Error(`${host} liegt nicht im eigenen Netz (${liste.map((a) => a.address).join(", ") || "nicht gefunden"}) – keine Verbindung aufgebaut`);
  }
}

/**
 * Abruf für DATEVconnect: prüft Ursprung und Namensauflösung vor jeder Anfrage.
 * @param holen (adresse, { method, redirect, headers, signal }) => Antwort mit ok/status/json(); in der App net.request ohne Cookies
 * @param ursprung () => erlaubter Ursprung (aus der eingestellten Adresse)
 * @param nachschlagen (host) => [{ address }] – Namensauflösung für die Netzprüfung
 */
function sichererAbruf(holen, ursprung, { nachschlagen } = {}) {
  return async (adresse, optionen = {}) => {
    let u;
    try { u = new URL(adresse); } catch { throw new Error(`Keine gültige Adresse: ${adresse}`); }
    if (!WEB.includes(u.protocol) || u.origin !== ursprung()) throw new Error(`Gesperrt: ${u.origin} ist nicht die eingestellte DATEVconnect-Adresse`);
    // bei jeder Anfrage; in der App mit Chromiums eigenem Resolver (net.resolveHost) – derselbe Cache wie beim Abruf
    await pruefeImKanzleinetz(u.hostname, nachschlagen);
    let r;
    try { r = await holen(adresse, { ...optionen, method: "GET", redirect: "error", signal: AbortSignal.timeout(ZEITLIMIT_MS) }); }
    catch (f) {
      if (/ERR_CERT_/.test(String(f?.message))) throw new Error(`Windows vertraut dem Zertifikat von ${u.host} nicht (${f.message}) – keine Daten abgerufen`);
      throw f;
    }
    if (r.status === 401 || r.status === 407) throw new Error(`DATEVconnect lässt das Windows-Konto nicht zu (${r.status}) – Rechte in DATEV prüfen`);
    return r;
  };
}

module.exports = { DATEV_STANDARD, datevAdresse, datevBasis, privateAdresse, pruefeImKanzleinetz, sichererAbruf };
