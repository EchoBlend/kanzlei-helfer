/**
 * Mandanten aus DATEVconnect (Desktop-API).
 *   master-data/v1:      /clients, /addressees/{id}?expand=*, Sammelabfragen /responsibilities,
 *                        /client-groups, /client-categories, /legal-forms, /relationships
 *                        (+ Adressaten der Beziehungspartner und Ansprechpartner, für deren E-Mails)
 *   order-management/v1: /orders, /ordertypes (nur mit DATEV Eigenorganisation comfort)
 * Die Anmeldung macht Chromium (net.fetch) mit dem Windows-Konto, wie im DATEV-Arbeitsplatz.
 * Im Demo-Modus kommen dieselben Antworten aus demodaten.json.
 */
const path = require("node:path");
const fs = require("node:fs");
const { pruefeMandant, gegenseitig } = require("./pruefung.cjs");

const fehlt = (pfad) => Object.assign(new Error(`DATEVconnect antwortet 404 (${pfad})`), { status: 404 });

/** Liefert { stamm(pfad), auftrag(pfad) } aus demodaten.json. */
function demoQuelle() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "demodaten.json"), "utf8"));
  const ohneQuery = (p) => p.split("?")[0];
  return {
    async stamm(pfad) {
      const p = ohneQuery(pfad);
      if (p === "/version") return { version: "demo" };
      const id = decodeURIComponent((p.match(/^\/addressees\/(.+)$/) || [])[1] || "");
      if (id) { if (d.addressees[id]) return d.addressees[id]; throw fehlt(p); }
      if (d["master-data"]?.[p]) return d["master-data"][p];
      throw fehlt(p);
    },
    async auftrag(pfad) {
      const p = ohneQuery(pfad);
      const wert = d["order-management"]?.[p];
      if (!wert) throw fehlt(p);
      // Seitenweise wie DATEVconnect: top/skip
      const q = new URLSearchParams(pfad.split("?")[1] || "");
      return Array.isArray(wert) && q.has("top") ? wert.slice(Number(q.get("skip") || 0), Number(q.get("skip") || 0) + Number(q.get("top"))) : wert;
    },
  };
}

function netzQuelle(holen, basis) {
  const stammWurzel = String(basis).replace(/\/+$/, "");
  const auftragWurzel = stammWurzel.replace(/master-data\/v\d+$/i, "order-management/v1");
  const hole = (wurzel) => async (pfad) => {
    const r = await holen(wurzel + pfad, { headers: { Accept: "application/json" } });
    if (!r.ok) throw Object.assign(new Error(`DATEVconnect antwortet ${r.status}${r.statusText ? " " + r.statusText : ""}`), { status: r.status });
    return r.json();
  };
  return { stamm: hole(stammWurzel), auftrag: hole(auftragWurzel) };
}

/** Wie Promise.all, aber höchstens `n` gleichzeitig (DATEVconnect nicht fluten). */
async function jeweils(liste, n, f) {
  const erg = new Array(liste.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (i < liste.length) { const k = i++; erg[k] = await f(liste[k]); }
  }));
  return erg;
}

const nachMandant = (liste) => {
  const m = new Map();
  for (const e of liste || []) { if (!m.has(e.client_id)) m.set(e.client_id, []); m.get(e.client_id).push(e); }
  return m;
};

/** Aufträge seitenweise holen; nur die letzten drei Veranlagungsjahre. Fehlt EO comfort → null. */
async function ladeAuftraege(quelle) {
  const alle = [];
  try {
    for (let seite = 0; seite < 40; seite++) {
      const teil = await quelle.auftrag(`/orders?top=500&skip=${seite * 500}`);
      if (!Array.isArray(teil)) break;
      alle.push(...teil);
      if (teil.length < 500) break;
    }
  } catch { return null; }
  const ab = new Date().getFullYear() - 2;
  return alle.filter((o) => !o.isinternal && (o.assessment_year ?? o.creation_year ?? ab) >= ab);
}

/**
 * Ein Scan: alle Mandanten mit Datenblatt und Prüfung.
 * @param fortschritt (fertig, gesamt) => void
 * @returns { mandanten, auftragswesen: boolean, hinweise: string[] }
 */
async function ladeMandanten(quelle, nurAktive, fortschritt = () => {}) {
  const clients = await quelle.stamm("/clients");
  if (!Array.isArray(clients)) throw new Error("DATEVconnect: unerwartete Antwort auf /clients");
  const liste = clients.filter((c) => !nurAktive || c.status === "active");
  fortschritt(0, liste.length);

  const hinweise = [];
  const sammel = async (pfad, name) => {
    try { const r = await quelle.stamm(pfad); return Array.isArray(r) ? r : []; }
    catch (f) { hinweise.push(`${name} nicht lesbar: ${f.message}`); return []; }
  };
  const [zust, gruppen, kategorien, rechtsformen, auftraege, arten, beziehungen] = await Promise.all([
    sammel("/responsibilities", "Zuständigkeiten"), sammel("/client-groups", "Mandantengruppen"),
    sammel("/client-categories", "Mandantenkategorien"), sammel("/legal-forms", "Rechtsformen"),
    ladeAuftraege(quelle), quelle.auftrag("/ordertypes").catch(() => []), sammel("/relationships", "Beziehungen"),
  ]);
  const zz = nachMandant(zust), gg = nachMandant(gruppen), kk = nachMandant(kategorien), aa = nachMandant(auftraege || []);
  const rf = new Map(rechtsformen.map((r) => [r.id, r]));
  const art = new Map((Array.isArray(arten) ? arten : []).map((a) => [a.ordertype, a]));
  const mandantVon = new Map(clients.flatMap((c) => [c.natural_person_id, c.legal_person_id].filter(Boolean).map((id) => [id, c.number])));

  // 1) Adressaten der Mandanten
  const adressat = new Map(); // id → Adressat | Error
  const hole = async (id) => {
    if (adressat.has(id)) return;
    try { adressat.set(id, await quelle.stamm(`/addressees/${encodeURIComponent(id)}?expand=*`)); }
    catch (f) { adressat.set(id, f); }
  };
  let fertig = 0;
  await jeweils(liste, 4, async (c) => {
    await Promise.all([c.natural_person_id, c.legal_person_id].filter(Boolean).map(hole));
    fortschritt(++fertig, liste.length);
  });
  // 2) Partner, deren Mail man braucht: Beziehungen („hat“-Seite ist ein Mandant) und Ansprechpartner
  const bezVon = new Map();
  for (const r of beziehungen) for (const id of [r.has_addressee_id, r.is_addressee_id]) {
    if (!bezVon.has(id)) bezVon.set(id, []);
    bezVon.get(id).push(r);
  }
  const ok = (x) => x && !(x instanceof Error);
  const partnerIds = new Set([
    ...beziehungen.filter((r) => ok(adressat.get(r.has_addressee_id))).map((r) => r.is_addressee_id),
    ...beziehungen.filter((r) => gegenseitig(r) && ok(adressat.get(r.is_addressee_id))).map((r) => r.has_addressee_id),
    ...[...adressat.values()].filter(ok).flatMap((a) => (a.contact_persons || []).map((k) => k.addressee_id)),
  ].filter(Boolean));
  await jeweils([...partnerIds], 4, hole);
  const partner = new Map([...adressat].filter(([, a]) => ok(a)));

  const erg = liste.map((c) => {
    const ids = [c.natural_person_id, c.legal_person_id].filter(Boolean);
    const kaputt = ids.map((id) => adressat.get(id)).find((a) => a instanceof Error);
    if (kaputt) {
      return { id: c.id, nummer: c.number, name: c.name, typ: c.type, status: c.status, email: null, emails: [], beziehungen: [], verbund: [], anrede: null,
        aufgabenbereiche: [], datevGruppen: [], kategorien: [], auftraege: [], luecken: [], fehlerhaft: [], abruffehler: kaputt.message };
    }
    const bez = [...new Map(ids.flatMap((id) => bezVon.get(id) || []).map((r) => [r.id, r])).values()];
    return pruefeMandant(c, ids.map((id) => adressat.get(id)), {
      zustaendigkeiten: zz.get(c.id) || [], datevGruppen: gg.get(c.id) || [], kategorien: kk.get(c.id) || [],
      auftraege: aa.get(c.id) || [], rechtsformen: rf, auftragsarten: art, beziehungen: bez, partner, mandantVon,
    });
  });
  return { mandanten: erg.sort((a, b) => a.nummer - b.nummer), auftragswesen: auftraege !== null, hinweise };
}

module.exports = { demoQuelle, netzQuelle, ladeMandanten };
