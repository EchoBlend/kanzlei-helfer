import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FileIcon, FolderIcon, PaperclipIcon, PencilIcon, RotateCcwIcon, SendIcon, UploadIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichAnsicht, RichText, type RichTextGriff } from "@/components/RichText";
import { Teiler, useGroesse } from "@/components/Teiler";
import { Kopf, type Entwurf, type Weiterer } from "@/App";
import { MailAdressWahl, type SetzeStandard } from "@/ansichten/AdressWahl";
import {
  adressenFuer, braucheLuecken, fehlertext, fuellen, fuellenHtml, groesse, gueltigeMails, hatMailLuecken, htmlVon, istMail, KEINE_ANPASSUNG, htmlZuText, kannMail, kh, nrAusName, offenePlatzhalter,
  PLATZHALTER, platzhalterWerte, ZIEL_TEXT, type Anpassung, type Datei, type Fassung, type Gruppe, type Mandant, type MailErgebnis, type Status, type Vorlage, type Ziel,
} from "@/lib/kh";
import { cn } from "@/lib/utils";

const PAECKCHEN = 5;

interface Props {
  mandanten: Mandant[]; auswahl: Set<number>; setAuswahl: (s: Set<number>) => void; vorlagen: Vorlage[]; status: Status | null; gruppen: Gruppe[];
  setzeStandard: SetzeStandard;
  entwurf: Entwurf; setEntwurf: (f: (e: Entwurf) => Entwurf) => void; zuMandanten: () => void; nachVersand: () => Promise<void>;
}

export function Serienmail({ mandanten, auswahl, setAuswahl, vorlagen, status, gruppen, setzeStandard, entwurf, setEntwurf, zuMandanten, nachVersand }: Props) {
  const [blick, setBlick] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [stoppt, setStoppt] = useState(false);
  const abbruch = useRef(false);
  const [fehlschlaege, setFehlschlaege] = useState<MailErgebnis[]>([]);
  const textRef = useRef<RichTextGriff>(null);
  const betreffRef = useRef<HTMLInputElement>(null);
  const zuletzt = useRef<"betreff" | "text">("text");
  // Durchgehen: Mail eines Mandanten anpassen; wer schon angesehen wurde
  const [bearbeiten, setBearbeiten] = useState(false);
  const [gesehen, setGesehen] = useState<Set<number>>(new Set());
  const eigenTextRef = useRef<RichTextGriff>(null);
  const eigenBetreffRef = useRef<HTMLInputElement>(null);
  const eigenZuletzt = useRef<"betreff" | "text">("text");

  const rechts = useGroesse("serienmail.rechts", 440, 340, () => Math.max(340, window.innerWidth - 640));
  const listeHoehe = useGroesse("serienmail.empfaenger", 288, 96, () => Math.max(96, window.innerHeight - 220));
  const signatur = status?.einstellungen.signatur ?? "";
  const smtp = !!status && status.einstellungen.versand === "smtp" && !status.einstellungen.demo;
  const alsEml = !status || (!smtp && (status.einstellungen.versand === "eml" || status.einstellungen.demo));
  const setze = (teil: Partial<Entwurf>) => setEntwurf((e) => ({ ...e, ...teil }));

  const empfaenger = useMemo(() => {
    const brauchtLuecken = braucheLuecken(entwurf.betreff + entwurf.text);
    const echte = mandanten.filter((m) => auswahl.has(m.nummer)).map((m) => ({
      m, an: adressenFuer(m, entwurf.ziel, entwurf.wahl[m.nummer], entwurf.adressen[m.nummer]), weiterer: false,
    })).map(({ m, an, weiterer }) => ({
      m, an, weiterer,
      grund: !an.length ? (kannMail(m) ? "keine Adresse gewählt" : "keine gültige E-Mail")
        : brauchtLuecken && !hatMailLuecken(m) ? "keine Lücken"
        : entwurf.pro.length && !entwurf.pro.some((d) => nrAusName(d.name) === m.nummer) ? "kein eigener Anhang" : "",
    }));
    // Von Hand ergänzte Empfänger: eigene Mail ohne Mandantendaten (Standard-Anrede, keine Lücken, nur Anhänge für alle).
    const weitere = entwurf.weitere.map((w) => ({ m: weitererAlsMandant(w), an: istMail(w.adresse) ? [w.adresse.trim()] : [], weiterer: true, grund: istMail(w.adresse) ? "" : "keine gültige E-Mail" }));
    return [...echte, ...weitere];
  }, [mandanten, auswahl, entwurf]);
  const gehen = empfaenger.filter((e) => !e.grund);
  const anhaengeFuer = (m: Mandant) => [...entwurf.alle, ...(m.nummer > 0 ? entwurf.pro.filter((d) => nrAusName(d.name) === m.nummer) : [])];
  const i = Math.min(blick, Math.max(gehen.length - 1, 0));
  const v = gehen[i]?.m, vAn = gehen[i]?.an ?? [];
  /** Was dieser Mandant bekommt: eigene Fassung, sonst die Vorlage mit seinen Werten. */
  const fassung = (m: Mandant): Fassung => {
    const eigen = entwurf.anpassung[m.nummer];
    if (eigen) return eigen;
    const html = fuellenHtml(entwurf.html, m, signatur);
    return { betreff: fuellen(entwurf.betreff, m, signatur), html, text: htmlZuText(html) };
  };
  const setzeAnpassung = (nr: number, f: Fassung | null) => setEntwurf((e) => {
    const anpassung = { ...e.anpassung };
    if (f) anpassung[nr] = f; else delete anpassung[nr];
    return { ...e, anpassung };
  });
  const setzeAdressen = (nr: number, f: (a: Anpassung) => Anpassung) => setEntwurf((e) => ({ ...e, adressen: { ...e.adressen, [nr]: f(e.adressen[nr] ?? KEINE_ANPASSUNG) } }));
  const [neuerName, setNeuerName] = useState(""), [neueAdresse, setNeueAdresse] = useState("");
  const weitererDazu = () => {
    const adresse = neueAdresse.trim();
    if (!istMail(adresse)) { toast.error("Keine gültige E-Mail-Adresse"); return; }
    setEntwurf((e) => ({ ...e, weitere: [...e.weitere, { nummer: -(Math.max(0, ...e.weitere.map((w) => -w.nummer)) + 1), name: neuerName.trim(), adresse }] }));
    setNeuerName(""); setNeueAdresse("");
  };
  useEffect(() => { if (v) setGesehen((g) => (g.has(v.nummer) ? g : new Set(g).add(v.nummer))); }, [v]);
  const durchgesehen = gehen.filter((e) => gesehen.has(e.m.nummer)).length;
  const angepasst = gehen.filter((e) => entwurf.anpassung[e.m.nummer]).length;

  /** Im Anpassen-Modus fügen die Platzhalter-Knöpfe gleich den Wert dieses Mandanten ein. */
  const wertEinfuegen = (p: string) => {
    if (!v) return;
    const f = fassung(v), ins = platzhalterWerte(v, signatur)[p] ?? "";
    if (eigenZuletzt.current !== "betreff") { eigenTextRef.current?.einfuegen(ins); return; }
    const ziel = eigenBetreffRef.current;
    const a = ziel?.selectionStart ?? f.betreff.length, b = ziel?.selectionEnd ?? a;
    setzeAnpassung(v.nummer, { ...f, betreff: f.betreff.slice(0, a) + ins + f.betreff.slice(b) });
    requestAnimationFrame(() => { if (ziel) { ziel.focus(); ziel.selectionStart = ziel.selectionEnd = a + ins.length; } });
  };
  const setzeWahl = (nr: number, adressen: string[] | null) => setEntwurf((e) => {
    const wahl = { ...e.wahl };
    if (adressen) wahl[nr] = adressen; else delete wahl[nr];
    return { ...e, wahl };
  });

  const waehleVorlage = (id: string) => {
    const t = vorlagen.find((x) => x.id === id);
    if (t) setze({ vorlageId: t.id, betreff: t.betreff, text: t.text, html: htmlVon(t) });
  };

  const einfuegen = (p: string) => {
    if (zuletzt.current !== "betreff") { textRef.current?.einfuegen(`{{${p}}}`); return; }
    const ziel = betreffRef.current;
    if (!ziel) return;
    const ins = `{{${p}}}`, a = ziel.selectionStart ?? ziel.value.length, b = ziel.selectionEnd ?? a;
    const neu = ziel.value.slice(0, a) + ins + ziel.value.slice(b);
    setze({ betreff: neu });
    requestAnimationFrame(() => { ziel.focus(); ziel.selectionStart = ziel.selectionEnd = a + ins.length; });
  };

  const uebernehme = (g: Gruppe) => {
    const neu = new Set(auswahl);
    for (const n of g.mitglieder) { const m = mandanten.find((x) => x.nummer === n); if (m && kannMail(m)) neu.add(n); }
    setAuswahl(neu);
    toast.success(`${neu.size - auswahl.size} aus „${g.name}“ übernommen`);
  };
  const gruppenMenue = gruppen.length > 0 && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" data-knopf="gruppe-uebernehmen"><FolderIcon />Gruppe übernehmen</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">{gruppen.map((g) => <DropdownMenuItem key={g.id} onSelect={() => uebernehme(g)}>{g.name}<span className="ms-auto ps-4 text-xs text-muted-foreground zahl">{g.mitglieder.length}</span></DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>
  );

  const fuegeHinzu = (art: "alle" | "pro", neu: Datei[]) =>
    setEntwurf((e) => ({ ...e, [art]: [...e[art], ...neu.filter((d) => !e[art].some((x) => x.pfad === d.pfad))] }));

  /** Adressen, die nicht aus DATEV stammen (bearbeitet, ergänzt, weitere Empfänger): getrennt gemeldet, der Hauptprozess prüft sie nur auf Form. */
  const vonHand = (m: Mandant, an: string[]) => (m.nummer < 0 ? an : an.filter((a) => !gueltigeMails(m).some((e) => e.adresse === a)));

  async function erstellen() {
    const modus = smtp ? "senden" : "entwurf";
    setBestaetigen(false);
    setLaeuft(true);
    setStoppt(false);
    setFortschritt(0);
    abbruch.current = false;
    setFehlschlaege([]);
    try {
      const vorlage = vorlagen.find((x) => x.id === entwurf.vorlageId);
      const liste = gehen.map(({ m, an }) => ({ nummer: m.nummer, name: m.name, an, ...fassung(m), anhaenge: anhaengeFuer(m).map((d) => d.pfad),
        ...(vonHand(m, an).length ? { von_hand: vonHand(m, an) } : {}) }));
      // In Päckchen, damit „Abbrechen“ zwischen den Päckchen greift.
      let versand = "";
      const ergebnisse: MailErgebnis[] = [];
      for (let k = 0; k < liste.length && !abbruch.current; k += PAECKCHEN) {
        const r = await kh().mails({ modus, vorlage: vorlage?.name ?? "(frei)", mails: liste.slice(k, k + PAECKCHEN) });
        versand = r.versand;
        ergebnisse.push(...r.ergebnisse);
        setFortschritt(ergebnisse.length);
      }
      const ok = ergebnisse.filter((e) => e.ok).length;
      const fehl = ergebnisse.filter((e) => !e.ok);
      const wo = versand === "eml" ? "als .eml-Datei gespeichert" : versand === "smtp" ? "gesendet" : "in Outlook unter „Entwürfe“ angelegt";
      if (abbruch.current && ergebnisse.length < liste.length) {
        // Erledigte Mandanten aus der Auswahl nehmen, der Rest bleibt zum erneuten Versand.
        const fertig = new Set(ergebnisse.filter((e) => e.ok).map((e) => e.nummer));
        setAuswahl(new Set([...auswahl].filter((n) => !fertig.has(n))));
        setEntwurf((e) => ({ ...e, weitere: e.weitere.filter((w) => !fertig.has(w.nummer)) }));
        setFehlschlaege(fehl);
        toast.info(`Abgebrochen: ${ok} von ${liste.length} ${wo}`, { description: "Die übrigen Mandanten sind weiter ausgewählt." });
        await nachVersand();
        return;
      }
      if (fehl.length) toast.warning(`${ok} von ${ergebnisse.length} ${wo}`, { description: `${fehl.length} fehlgeschlagen, Details unten.` });
      else toast.success(`${ok} ${ok === 1 ? "Mail" : "Mails"} ${wo}`, { description: versand === "eml" ? status?.ausgang : versand === "smtp" ? "Protokoll unter „Protokoll“" : "Kategorie „Kanzlei-Helfer“" });
      setFehlschlaege(fehl);
      if (!fehl.length) { setAuswahl(new Set()); setGesehen(new Set()); setEntwurf((e) => ({ ...e, alle: [], pro: [], wahl: {}, anpassung: {}, adressen: {}, weitere: [] })); }
      await nachVersand();
    } catch (f) {
      toast.error(smtp ? "Mails nicht gesendet" : "Mails nicht erstellt", { description: fehlertext(f) });
    } finally {
      setLaeuft(false);
    }
  }

  if (!auswahl.size && !entwurf.weitere.length) {
    return (
      <div className="flex h-svh flex-col">
        <Kopf titel="Serienmail" unter="Noch keine Empfänger ausgewählt">{gruppenMenue}</Kopf>
        <div className="m-8 flex max-w-xl flex-col items-start gap-3 rounded-lg border border-dashed p-8">
          <UsersIcon className="size-5 text-muted-foreground" />
          <p className="text-base">Wählen Sie unter Mandanten aus, wer die Mail bekommt, oder übernehmen Sie eine eigene Gruppe. Mandanten ohne gültige E-Mail-Adresse lassen sich nicht anhaken.</p>
          <Button onClick={zuMandanten}>Zu den Mandanten</Button>
        </div>
      </div>
    );
  }

  const uebersprungen = empfaenger.length - gehen.length;
  return (
    <div className="flex h-svh flex-col">
      <Kopf titel="Serienmail"
        unter={<span className="zahl">{gehen.length} von {empfaenger.length} Empfängern{uebersprungen ? ` · ${uebersprungen} übersprungen` : ""}{alsEml ? " · Ausgabe als .eml-Dateien" : ""}</span>}>{gruppenMenue}</Kopf>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `minmax(0,1fr) auto ${rechts.wert}px` }}>
        {/* Links: Nachricht und Anhänge */}
        <section className="min-h-0 overflow-auto px-8 py-6">
          <div className="grid max-w-4xl gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="vorlage">Vorlage</Label>
              <Select value={entwurf.vorlageId ?? undefined} onValueChange={waehleVorlage}>
                <SelectTrigger id="vorlage" className="w-full max-w-md"><SelectValue placeholder="Vorlage wählen" /></SelectTrigger>
                <SelectContent>{vorlagen.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="betreff">Betreff</Label>
              <Input id="betreff" ref={betreffRef} value={entwurf.betreff} onFocus={() => (zuletzt.current = "betreff")} onChange={(e) => setze({ betreff: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="text">Text</Label>
                <span className="text-xs text-muted-foreground">Änderungen gelten nur für diesen Versand</span>
              </div>
              <RichText id="text" label="Text der Mail" ref={textRef} html={entwurf.html} hoehe="22rem" onFokus={() => (zuletzt.current = "text")}
                aendern={(html, text) => setze({ html, text })} />
              <Platzhalter einfuegen={einfuegen} beispiel={v ? (p) => platzhalterWerte(v, signatur)[p] : undefined} />
              {angepasst > 0 && <p className="text-xs text-warn">{angepasst} {angepasst === 1 ? "Mandant hat" : "Mandanten haben"} eine eigene Fassung – Änderungen hier gelten für {angepasst === 1 ? "ihn" : "sie"} nicht mehr.</p>}
            </div>

            <div className="grid gap-3 pt-2">
              <Label>Anhänge</Label>
              <div className="grid grid-cols-2 gap-3">
                <Ablage titel="Für alle Empfänger" hinweis="Geht an jede Mail." dateien={entwurf.alle} art="alle"
                  dazu={(d) => fuegeHinzu("alle", d)} weg={(p) => setze({ alle: entwurf.alle.filter((x) => x.pfad !== p) })} />
                <Ablage titel="Pro Mandant" hinweis="Dateiname beginnt mit der Mandantennummer, z. B. 10004_Bescheid.pdf. Wer keine eigene Datei hat, wird übersprungen."
                  dateien={entwurf.pro} art="pro" dazu={(d) => fuegeHinzu("pro", d)} weg={(p) => setze({ pro: entwurf.pro.filter((x) => x.pfad !== p) })}
                  zuordnung={(d) => {
                    const nr = nrAusName(d.name);
                    if (nr === null) return { ok: false, text: "keine Mandantennr. im Namen" };
                    const m = mandanten.find((x) => x.nummer === nr);
                    return auswahl.has(nr) && m ? { ok: true, text: m.name } : { ok: false, text: `${nr} nicht ausgewählt` };
                  }} />
              </div>
            </div>

            {fehlschlaege.length > 0 && (
              <div className="rounded-lg border border-err/30 bg-err-soft p-4 text-sm" role="alert">
                <div className="font-semibold text-err">Nicht erstellt</div>
                <ul className="mt-2 space-y-1">
                  {fehlschlaege.map((f) => <li key={f.nummer}><span className="kennung">{f.nummer}</span> {mandanten.find((m) => m.nummer === f.nummer)?.name}: {f.info}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>

        <Teiler richtung="x" groesse={rechts} umgekehrt label="Breite von Empfänger und Vorschau" />
        {/* Rechts: Empfänger und Vorschau */}
        <aside className="flex min-h-0 flex-col overflow-auto bg-surface px-6 py-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-xs font-semibold text-muted-foreground">Empfänger</h2>
            <Select value={entwurf.ziel} onValueChange={(z) => setze({ ziel: z as Ziel })}>
              <SelectTrigger size="sm" className="h-7 max-w-64 text-xs" aria-label="An welche Adressen" data-feld="ziel"><SelectValue /></SelectTrigger>
              <SelectContent align="end">{(Object.keys(ZIEL_TEXT) as Ziel[]).map((z) => <SelectItem key={z} value={z} data-ziel={z}>{ZIEL_TEXT[z]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <ul className="flex-none divide-y overflow-auto rounded-lg border bg-background" style={{ maxHeight: listeHoehe.wert }} data-empfaenger>
            {empfaenger.map(({ m, an, grund, weiterer }) => (
              <li key={m.nummer} className={cn("flex items-center gap-3 px-3 py-2", grund && "text-muted-foreground")} data-grund={grund} data-nummer={m.nummer}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground" data-an={an.join(";")}>
                    <span className="kennung">{weiterer ? "manuell" : m.nummer}</span> · {an.length ? an.join(", ") : "keine Adresse"}{entwurf.wahl[m.nummer] ? " · nur diese Mail" : entwurf.ziel === "standard" && m.festeAdressen ? " · festgelegter Standard" : ""}{entwurf.adressen[m.nummer] && (Object.keys(entwurf.adressen[m.nummer].ersatz).length || entwurf.adressen[m.nummer].extra.length) ? " · Adresse angepasst" : ""}
                  </div>
                </div>
                {grund && <span className="shrink-0 rounded-[4px] bg-warn-soft px-1.5 py-px text-xs font-medium text-warn">{grund}</span>}
                {!grund && entwurf.anpassung[m.nummer] && <span className="shrink-0 rounded-[4px] bg-brand-soft px-1.5 py-px text-xs font-medium text-brand" data-angepasst>angepasst</span>}
                {!grund && !entwurf.anpassung[m.nummer] && gesehen.has(m.nummer) && <CheckIcon className="size-3.5 shrink-0 text-ok" aria-label="durchgesehen" />}
                {!weiterer && <MailAdressWahl m={m} an={an} eigeneWahl={!!entwurf.wahl[m.nummer]} setze={(a) => setzeWahl(m.nummer, a)} setzeStandard={setzeStandard}
                  anpassung={entwurf.adressen[m.nummer] ?? KEINE_ANPASSUNG} anpassen={(f) => setzeAdressen(m.nummer, f)} />}
                <Button variant="ghost" size="icon-sm" aria-label={`${m.name} entfernen`}
                  onClick={() => { if (weiterer) setEntwurf((e) => ({ ...e, weitere: e.weitere.filter((w) => w.nummer !== m.nummer) })); else { const s = new Set(auswahl); s.delete(m.nummer); setAuswahl(s); } }}><XIcon /></Button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex items-center gap-2" data-weiterer onSubmit={(e) => { e.preventDefault(); weitererDazu(); }}>
            <Input value={neuerName} onChange={(e) => setNeuerName(e.target.value)} placeholder="Name (optional)" aria-label="Name des weiteren Empfängers" className="h-8 w-32 text-xs" data-feld="weiterer-name" />
            <Input value={neueAdresse} onChange={(e) => setNeueAdresse(e.target.value)} placeholder="Weiterer Empfänger: E-Mail" type="email" aria-label="E-Mail des weiteren Empfängers" className="h-8 min-w-0 flex-1 text-xs" data-feld="weiterer-adresse" />
            <Button type="submit" variant="outline" size="sm" data-knopf="weiterer-dazu"><UserPlusIcon />Hinzufügen</Button>
          </form>
          {empfaenger.length > 3 && <Teiler richtung="y" groesse={listeHoehe} label="Höhe der Empfängerliste" className="mt-0.5" />}

          <div className="mt-5 mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 whitespace-nowrap text-xs font-semibold text-muted-foreground">Durchgehen{v ? <span className="zahl"> · {i + 1} von {gehen.length}</span> : null}</h2>
            {v && !bearbeiten && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setBearbeiten(true)} data-knopf="anpassen"><PencilIcon />Für diesen Mandanten anpassen</Button>}
            <Button variant="outline" size="icon-sm" aria-label="Vorheriger Empfänger" disabled={i <= 0} onClick={() => setBlick(i - 1)}><ChevronLeftIcon /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Nächster Empfänger" disabled={i >= gehen.length - 1} onClick={() => setBlick(i + 1)}><ChevronRightIcon /></Button>
          </div>
          <div className="flex-none rounded-lg border bg-background" data-vorschau>
            {v ? (() => {
              const { betreff, text, html } = fassung(v), anh = anhaengeFuer(v), eigen = !!entwurf.anpassung[v.nummer];
              return (
                <>
                  <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 border-b px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">An</dt><dd className="font-medium">{v.name} <span className="kennung text-xs text-muted-foreground">{v.nummer > 0 ? v.nummer : "manuell"}</span></dd>
                    <dt className="text-muted-foreground">BCC</dt><dd className="break-all">{vAn.join(", ")}</dd>
                    {!bearbeiten && <><dt className="text-muted-foreground">Betreff</dt><dd className="font-medium">{betreff}</dd></>}
                    {anh.length > 0 && <><dt className="text-muted-foreground">Anhänge</dt><dd className="text-xs">{anh.map((d) => d.name).join(", ")}</dd></>}
                  </dl>
                  {bearbeiten ? (
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3" data-anpassen>
                      <Label htmlFor="eigen-betreff" className="text-xs">Betreff nur für {v.name}</Label>
                      <Input id="eigen-betreff" ref={eigenBetreffRef} value={betreff} onFocus={() => (eigenZuletzt.current = "betreff")}
                        onChange={(e) => setzeAnpassung(v.nummer, { betreff: e.target.value, text, html })} />
                      <Label htmlFor="eigen-text" className="mt-1 text-xs">Text nur für {v.name}</Label>
                      <RichText key={v.nummer} id="eigen-text" label={`Text nur für ${v.name}`} ref={eigenTextRef} html={html} hoehe="18rem"
                        onFokus={() => (eigenZuletzt.current = "text")} aendern={(h, t) => setzeAnpassung(v.nummer, { betreff, html: h, text: t })} />
                      <Platzhalter einfuegen={wertEinfuegen} beispiel={(p) => platzhalterWerte(v, signatur)[p]} titel="Wert einfügen:" />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" onClick={() => setBearbeiten(false)} data-knopf="anpassen-fertig"><CheckIcon />Fertig</Button>
                        {i < gehen.length - 1 && <Button size="sm" variant="outline" onClick={() => setBlick(i + 1)}>Nächster Mandant<ChevronRightIcon /></Button>}
                        {eigen && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setzeAnpassung(v.nummer, null)}><RotateCcwIcon />Wie Vorlage</Button>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <RichAnsicht html={html} className="rounded-b-lg px-4 py-4" />
                      {eigen && (
                        <div className="flex items-center gap-2 border-t px-4 py-2 text-xs">
                          <span className="font-medium text-brand">Eigene Fassung für diesen Mandanten</span>
                          <Button size="sm" variant="ghost" className="ms-auto h-6 text-xs" onClick={() => setzeAnpassung(v.nummer, null)}><RotateCcwIcon />Wie Vorlage</Button>
                        </div>
                      )}
                    </>
                  )}
                  {offenePlatzhalter(betreff + text) && <p className="border-t px-4 py-2 text-xs font-medium text-warn">Unbekannter Platzhalter – bitte prüfen.</p>}
                </>
              );
            })() : <p className="p-4 text-sm text-muted-foreground">Kein Empfänger, für den eine Mail erstellt wird.</p>}
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t bg-background px-8 py-3">
        <span className="me-auto text-sm text-muted-foreground zahl" data-durchgesehen={durchgesehen}>
          {gehen.length} {gehen.length === 1 ? "Mail" : "Mails"}{entwurf.alle.length + entwurf.pro.length ? ` · ${entwurf.alle.length + entwurf.pro.length} Anhänge` : ""}
          {gehen.length > 1 ? ` · ${durchgesehen} von ${gehen.length} durchgesehen` : ""}{angepasst ? ` · ${angepasst} angepasst` : ""}
        </span>
        {laeuft && gehen.length > PAECKCHEN && <Button variant="outline" disabled={stoppt} onClick={() => { abbruch.current = true; setStoppt(true); }} data-knopf="abbrechen">{stoppt ? "Wird abgebrochen …" : "Abbrechen"}</Button>}
        {smtp
          ? <Button disabled={!gehen.length || laeuft} onClick={() => setBestaetigen(true)} data-knopf="senden"><SendIcon />{laeuft ? `Sendet … ${fortschritt} von ${gehen.length}` : `Alle ${gehen.length} senden`}</Button>
          : <Button disabled={!gehen.length || laeuft} onClick={() => erstellen()} data-knopf="erstellen">
            {laeuft ? `${fortschritt} von ${gehen.length} …` : alsEml ? "Als .eml-Dateien speichern" : "Als Entwürfe in Outlook anlegen"}
          </Button>}
      </footer>

      <AlertDialog open={bestaetigen} onOpenChange={setBestaetigen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{gehen.length} {gehen.length === 1 ? "Mail" : "Mails"} jetzt senden?</AlertDialogTitle>
            <AlertDialogDescription>Alle Mails gehen sofort über den SMTP-Server hinaus. Das lässt sich nicht zurückholen. Empfänger stehen in BCC. Prüfen Sie vorher die Vorschau.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => erstellen()} data-knopf="senden-bestaetigen">Jetzt senden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

/** Weiterer Empfänger ohne Mandantendaten: Standard-Anrede, keine Lücken. */
const weitererAlsMandant = (w: Weiterer): Mandant => ({
  id: String(w.nummer), nummer: w.nummer, name: w.name || w.adresse, typ: "natural_person", status: "active", email: w.adresse, emails: [], beziehungen: [], verbund: [],
  anrede: w.name ? `Guten Tag ${w.name},` : null, aufgabenbereiche: [], datevGruppen: [], kategorien: [], auftraege: [], luecken: [], fehlerhaft: [], abruffehler: null,
});

/** Platzhalter-Knöpfe; `beispiel` zeigt beim Darüberfahren den Wert für den gerade angezeigten Mandanten. */
export function Platzhalter({ einfuegen, beispiel, titel = "Einfügen:" }: { einfuegen: (p: string) => void; beispiel?: (p: string) => string | undefined; titel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="me-1 text-xs text-muted-foreground">{titel}</span>
      {PLATZHALTER.map((p) => (
        <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => einfuegen(p)} data-platzhalter={p}
          title={beispiel ? `${p}: ${beispiel(p) || "(leer)"}` : undefined}
          className="kennung rounded-[4px] border bg-background px-1.5 py-0.5 text-xs text-muted-foreground hover:border-brand hover:text-foreground">
          {p}
        </button>
      ))}
    </div>
  );
}

function Ablage({ titel, hinweis, dateien, art, dazu, weg, zuordnung }: {
  titel: string; hinweis: string; dateien: Datei[]; art: string; dazu: (d: Datei[]) => void; weg: (pfad: string) => void;
  zuordnung?: (d: Datei) => { ok: boolean; text: string };
}) {
  const [ueber, setUeber] = useState(false);
  const fallen = async (e: React.DragEvent) => {
    e.preventDefault();
    setUeber(false);
    const dateien = [...e.dataTransfer.files];
    if (dateien.length) dazu(await kh().dateiInfoVon(dateien));
  };
  return (
    <div data-ablage={art}
      onDragOver={(e) => { e.preventDefault(); setUeber(true); }} onDragLeave={() => setUeber(false)} onDrop={fallen}
      className={cn("flex min-h-36 flex-col rounded-lg border border-dashed bg-background p-3 transition-colors", ueber && "border-brand bg-brand-soft")}>
      <div className="flex items-start gap-2">
        <PaperclipIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{titel}</div>
          <p className="text-xs text-muted-foreground">{hinweis}</p>
        </div>
      </div>
      {dateien.length > 0 && (
        <ul className="mt-3 space-y-1">
          {dateien.map((d) => {
            const z = zuordnung?.(d);
            return (
              <li key={d.pfad} className="flex items-start gap-2 text-xs" data-datei={d.name}>
                <FileIcon className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate" title={d.pfad}>{d.name}</div>
                  {z && <div className={cn("truncate font-medium", z.ok ? "text-ok" : "text-warn")}>{z.ok ? "→ " : ""}{z.text}</div>}
                </div>
                <span className="shrink-0 text-muted-foreground zahl">{groesse(d.groesse)}</span>
                <button type="button" aria-label={`${d.name} entfernen`} onClick={() => weg(d.pfad)} className="text-muted-foreground hover:text-foreground"><XIcon className="size-3.5" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="ghost" size="sm" className="mt-auto self-start" onClick={async () => dazu(await kh().waehleDateien())}>
        <UploadIcon />Dateien wählen oder hierher ziehen
      </Button>
    </div>
  );
}
