/**
 * Der einzige Netzweg der App: DATEVconnect im eigenen Netz (Standard: LIZENZSERVER).
 *
 * - Adresse änderbar, aber nur http://<Server>:<Port>/datev/api/master-data/v1 – ohne Zugangsdaten, Parameter, Anker.
 *   Kein https: Zertifikatsprüfungen könnten Chromium zu externen Zertifizierungsstellen schicken.
 * - Vor jeder Anfrage: Der Servername muss ausschließlich auf Adressen im eigenen Netz zeigen (10.x, 172.16–31.x,
 *   192.168.x, Loopback, Link-Local, IPv6 ULA). Sonst – z. B. Laptop zu Hause, Provider-DNS biegt unbekannte Namen
 *   auf Werbeserver um, Tippfehler auf eine Internet-Adresse – wird gar keine Verbindung aufgebaut.
 * - Nur GET, keine Weiterleitungen, keine Anmeldung, keine Cookies (credentials: "omit"), 30 s Zeitlimit.
 */
const dns = require("node:dns");
const net = require("node:net");

const DATEV_STANDARD = "http://LIZENZSERVER:58454/datev/api/master-data/v1";
const DATEV_PFAD = /^\/datev\/api\/master-data\/v1\/?$/i;
const ZEITLIMIT_MS = 30000;

/** Ist das eine zulässige DATEVconnect-Adresse (Form)? Ob der Server im eigenen Netz liegt, prüft sichererAbruf. */
function erlaubteDatevAdresse(adresse) {
  let u;
  try { u = new URL(String(adresse)); } catch { return false; }
  return u.protocol === "http:" && !!u.hostname && !u.username && !u.password && !u.search && !u.hash && DATEV_PFAD.test(u.pathname);
}
const datevAdresse = (adresse) => (erlaubteDatevAdresse(adresse) ? String(adresse).trim() : DATEV_STANDARD);

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
 * @param holen z. B. electron.net.fetch
 * @param ursprung () => erlaubter Ursprung (aus der eingestellten Adresse)
 * @param nachschlagen (host) => [{ address }] – Namensauflösung für die Netzprüfung
 */
function sichererAbruf(holen, ursprung, { nachschlagen } = {}) {
  return async (adresse, optionen = {}) => {
    const u = new URL(adresse);
    if (u.protocol !== "http:" || u.origin !== ursprung()) throw new Error(`Gesperrt: ${u.origin} ist nicht die eingestellte DATEVconnect-Adresse`);
    // bei jeder Anfrage; in der App mit Chromiums eigenem Resolver (net.resolveHost) – derselbe Cache wie beim Abruf
    await pruefeImKanzleinetz(u.hostname, nachschlagen);
    const r = await holen(adresse, { ...optionen, method: "GET", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(ZEITLIMIT_MS) });
    if (r.status === 401 || r.status === 407) throw new Error("DATEVconnect verlangt eine Anmeldung – die App meldet sich bewusst bei niemandem an");
    return r;
  };
}

module.exports = { DATEV_STANDARD, erlaubteDatevAdresse, datevAdresse, privateAdresse, pruefeImKanzleinetz, sichererAbruf };
