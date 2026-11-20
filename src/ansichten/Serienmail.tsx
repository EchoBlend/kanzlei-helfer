import { useMemo, useRef, useState } from "react";
import { AtSignIcon, ChevronLeftIcon, PencilIcon, PlusIcon, UserPlusIcon, ChevronRightIcon, FileIcon, FolderIcon, PaperclipIcon, SendIcon, UploadIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Kopf, type Entwurf, type Weiterer } from "@/App";
import {
  adressenFuer, braucheLuecken, fuellen, groesse, gueltigeMails, hatMailLuecken, istMail, KEINE_ANPASSUNG, kannMail, kh, nrAusName, offenePlatzhalter, PLATZHALTER, ZIEL_TEXT,
  type Anpassung, type Datei, type Gruppe, type Mandant, type MailErgebnis, type Status, type Vorlage, type Ziel,
} from "@/lib/kh";
import { cn } from "@/lib/utils";

interface Props {
  mandanten: Mandant[]; auswahl: Set<number>; setAuswahl: (s: Set<number>) => void; vorlagen: Vorlage[]; status: Status | null; gruppen: Gruppe[];
  entwurf: Entwurf; setEntwurf: (f: (e: Entwurf) => Entwurf) => void; zuMandanten: () => void; nachVersand: () => Promise<void>;
}

export function Serienmail({ mandanten, auswahl, setAuswahl, vorlagen, status, gruppen, entwurf, setEntwurf, zuMandanten, nachVersand }: Props) {
  const [blick, setBlick] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [fehlschlaege, setFehlschlaege] = useState<MailErgebnis[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const betreffRef = useRef<HTMLInputElement>(null);
  const zuletzt = useRef<"betreff" | "text">("text");

  const signatur = status?.einstellungen.signatur ?? "";
  const alsEml = !status || status.einstellungen.versand === "eml" || status.einstellungen.demo;
  const setze = (teil: Partial<Entwurf>) => setEntwurf((e) => ({ ...e, ...teil }));

  const empfaenger = useMemo(() => {
    const brauchtLuecken = braucheLuecken(entwurf.betreff + entwurf.text);
    const echte = mandanten.filter((m) => auswahl.has(m.nummer)).map((m) => ({
      m, an: adressenFuer(m, entwurf.ziel, entwurf.wahl[m.nummer], entwurf.anpassung[m.nummer]), weiterer: false,
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
  const setzeWahl = (nr: number, adressen: string[] | null) => setEntwurf((e) => {
    const wahl = { ...e.wahl };
    if (adressen) wahl[nr] = adressen; else delete wahl[nr];
    return { ...e, wahl };
  });

  const setzeAnpassung = (nr: number, f: (a: Anpassung) => Anpassung) => setEntwurf((e) => ({ ...e, anpassung: { ...e.anpassung, [nr]: f(e.anpassung[nr] ?? KEINE_ANPASSUNG) } }));
  const [neuerName, setNeuerName] = useState(""), [neueAdresse, setNeueAdresse] = useState("");
  const weitererDazu = () => {
    const adresse = neueAdresse.trim();
    if (!istMail(adresse)) { toast.error("Keine gültige E-Mail-Adresse"); return; }
    setEntwurf((e) => ({ ...e, weitere: [...e.weitere, { nummer: -(Math.max(0, ...e.weitere.map((w) => -w.nummer)) + 1), name: neuerName.trim(), adresse }] }));
    setNeuerName(""); setNeueAdresse("");
  };

  const waehleVorlage = (id: string) => {
    const t = vorlagen.find((x) => x.id === id);
    if (t) setze({ vorlageId: t.id, betreff: t.betreff, text: t.text });
  };

  const einfuegen = (p: string) => {
    const ziel = zuletzt.current === "betreff" ? betreffRef.current : textRef.current;
    if (!ziel) return;
    const ins = `{{${p}}}`, a = ziel.selectionStart ?? ziel.value.length, b = ziel.selectionEnd ?? a;
    const neu = ziel.value.slice(0, a) + ins + ziel.value.slice(b);
    setze(zuletzt.current === "betreff" ? { betreff: neu } : { text: neu });
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

  async function erstellen(modus: "entwurf" | "senden") {
    setBestaetigen(false);
    setLaeuft(true);
    setFehlschlaege([]);
    try {
      const vorlage = vorlagen.find((x) => x.id === entwurf.vorlageId);
      const { versand, ergebnisse } = await kh().mails({
        modus, vorlage: vorlage?.name ?? "(frei)",
        mails: gehen.map(({ m, an }) => ({ nummer: m.nummer, name: m.name, an, betreff: fuellen(entwurf.betreff, m, signatur),
          text: fuellen(entwurf.text, m, signatur), anhaenge: anhaengeFuer(m).map((d) => d.pfad) })),
      });
      const ok = ergebnisse.filter((e) => e.ok).length;
      const fehl = ergebnisse.filter((e) => !e.ok);
      const wo = versand === "eml" ? "als .eml-Datei gespeichert" : modus === "senden" ? "gesendet" : "in Outlook unter „Entwürfe“ angelegt";
      if (fehl.length) toast.warning(`${ok} von ${ergebnisse.length} ${wo}`, { description: `${fehl.length} fehlgeschlagen, Details unten.` });
      else toast.success(`${ok} ${ok === 1 ? "Mail" : "Mails"} ${wo}`, { description: versand === "eml" ? status?.ausgang : "Kategorie „Kanzlei-Helfer“" });
      setFehlschlaege(fehl);
      if (!fehl.length) { setAuswahl(new Set()); setEntwurf((e) => ({ ...e, alle: [], pro: [], wahl: {}, anpassung: {}, weitere: [] })); }
      await nachVersand();
    } catch (f) {
      toast.error("Mails nicht erstellt", { description: String(f) });
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        {/* Links: Nachricht und Anhänge */}
        <section className="min-h-0 overflow-auto border-r px-8 py-6">
          <div className="grid max-w-3xl gap-5">
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
              <Textarea id="text" ref={textRef} value={entwurf.text} rows={15} onFocus={() => (zuletzt.current = "text")}
                onChange={(e) => setze({ text: e.target.value })} className="min-h-72 text-base leading-relaxed" />
              <Platzhalter einfuegen={einfuegen} />
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

        {/* Rechts: Empfänger und Vorschau */}
        <aside className="flex min-h-0 flex-col overflow-auto bg-surface px-6 py-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-xs font-semibold text-muted-foreground">Empfänger</h2>
            <Select value={entwurf.ziel} onValueChange={(z) => setze({ ziel: z as Ziel })}>
              <SelectTrigger size="sm" className="h-7 max-w-64 text-xs" aria-label="An welche Adressen" data-feld="ziel"><SelectValue /></SelectTrigger>
              <SelectContent align="end">{(Object.keys(ZIEL_TEXT) as Ziel[]).map((z) => <SelectItem key={z} value={z} data-ziel={z}>{ZIEL_TEXT[z]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <ul className="max-h-72 flex-none divide-y overflow-auto rounded-lg border bg-background" data-empfaenger>
            {empfaenger.map(({ m, an, grund, weiterer }) => (
              <li key={m.nummer} className={cn("flex items-center gap-3 px-3 py-2", grund && "text-muted-foreground")} data-grund={grund} data-nummer={m.nummer}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground" data-an={an.join(";")}>
                    {weiterer ? <span className="kennung">manuell</span> : <span className="kennung">{m.nummer}</span>} · {an.length ? an.join(", ") : "keine Adresse"}{entwurf.wahl[m.nummer] ? " · eigene Wahl" : ""}{entwurf.anpassung[m.nummer] && (Object.keys(entwurf.anpassung[m.nummer].ersatz).length || entwurf.anpassung[m.nummer].extra.length) ? " · angepasst" : ""}
                  </div>
                </div>
                {grund && <span className="shrink-0 rounded-[4px] bg-warn-soft px-1.5 py-px text-xs font-medium text-warn">{grund}</span>}
                {!weiterer && <AdressWahl m={m} an={an} ziel={entwurf.ziel} eigeneWahl={!!entwurf.wahl[m.nummer]} setze={(a) => setzeWahl(m.nummer, a)}
                  anpassung={entwurf.anpassung[m.nummer] ?? KEINE_ANPASSUNG} anpassen={(f) => setzeAnpassung(m.nummer, f)} />}
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

          <div className="mt-6 mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-xs font-semibold text-muted-foreground">Vorschau{v ? <span className="zahl"> {i + 1} von {gehen.length}</span> : null}</h2>
            <Button variant="outline" size="icon-sm" aria-label="Vorheriger Empfänger" disabled={i <= 0} onClick={() => setBlick(i - 1)}><ChevronLeftIcon /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Nächster Empfänger" disabled={i >= gehen.length - 1} onClick={() => setBlick(i + 1)}><ChevronRightIcon /></Button>
          </div>
          <div className="flex-none rounded-lg border bg-background" data-vorschau>
            {v ? (() => {
              const betreff = fuellen(entwurf.betreff, v, signatur), text = fuellen(entwurf.text, v, signatur), anh = anhaengeFuer(v);
              return (
                <>
                  <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 border-b px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">An</dt><dd className="break-all">{vAn.join(", ")}</dd>
                    <dt className="text-muted-foreground">Betreff</dt><dd className="font-medium">{betreff}</dd>
                    {anh.length > 0 && <><dt className="text-muted-foreground">Anhänge</dt><dd className="text-xs">{anh.map((d) => d.name).join(", ")}</dd></>}
                  </dl>
                  <div className="lesetext px-4 py-4" lang="de">{text}</div>
                  {offenePlatzhalter(betreff + text) && <p className="border-t px-4 py-2 text-xs font-medium text-warn">Unbekannter Platzhalter – bitte prüfen.</p>}
                </>
              );
            })() : <p className="p-4 text-sm text-muted-foreground">Kein Empfänger, für den eine Mail erstellt wird.</p>}
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t bg-background px-8 py-3">
        <span className="me-auto text-sm text-muted-foreground zahl">
          {gehen.length} {gehen.length === 1 ? "Mail" : "Mails"}{entwurf.alle.length + entwurf.pro.length ? ` · ${entwurf.alle.length + entwurf.pro.length} Anhänge` : ""}
        </span>
        {!alsEml && <Button variant="outline" disabled={!gehen.length || laeuft} onClick={() => setBestaetigen(true)}><SendIcon />Direkt senden</Button>}
        <Button disabled={!gehen.length || laeuft} onClick={() => erstellen("entwurf")} data-knopf="erstellen">
          {alsEml ? "Als .eml-Dateien speichern" : "Als Entwürfe in Outlook anlegen"}
        </Button>
      </footer>

      <AlertDialog open={bestaetigen} onOpenChange={setBestaetigen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{gehen.length} {gehen.length === 1 ? "Mail" : "Mails"} jetzt senden?</AlertDialogTitle>
            <AlertDialogDescription>Outlook verschickt sie sofort. Das lässt sich nicht zurückholen. Sicherer sind Entwürfe: Sie prüfen und senden selbst.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => erstellen("senden")}>Jetzt senden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Weiterer Empfänger ohne Mandantendaten: Anrede „Sehr geehrte Damen und Herren“, keine Lücken. */
const weitererAlsMandant = (w: Weiterer): Mandant => ({
  id: String(w.nummer), nummer: w.nummer, name: w.name || w.adresse, typ: "natural_person", status: "active", email: w.adresse, emails: [], beziehungen: [], verbund: [],
  anrede: w.name ? `Guten Tag ${w.name},` : null, aufgabenbereiche: [], datevGruppen: [], kategorien: [], auftraege: [], luecken: [], fehlerhaft: [], abruffehler: null,
});

/** Pro Mandant: Adressen ankreuzen, bearbeiten (nur für diesen Versand, DATEV bleibt unverändert) und eigene ergänzen. */
function AdressWahl({ m, an, ziel, eigeneWahl, setze, anpassung, anpassen }: {
  m: Mandant; an: string[]; ziel: Ziel; eigeneWahl: boolean; setze: (a: string[] | null) => void; anpassung: Anpassung; anpassen: (f: (a: Anpassung) => Anpassung) => void;
}) {
  const liste = gueltigeMails(m);
  const [neu, setNeu] = useState("");
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  // Ob eine Original-Adresse gerade mitgeht: ihre (ggf. bearbeitete) Fassung steht in `an`.
  const geht = (orig: string) => an.includes(anpassung.ersatz[orig]?.trim() || orig);
  const um = (orig: string, ein: boolean) => setze(liste.map((e) => e.adresse).filter((x) => (x === orig ? ein : geht(x))));
  const ergaenze = () => {
    const a = neu.trim();
    if (!istMail(a)) { toast.error("Keine gültige E-Mail-Adresse"); return; }
    anpassen((p) => ({ ...p, extra: p.extra.includes(a) ? p.extra : [...p.extra, a] }));
    setNeu("");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Adressen für ${m.name} wählen`} data-knopf="adressen"><AtSignIcon /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">An wen geht die Mail an {m.name}?</div>
        <ul className="max-h-72 overflow-auto py-1">
          {liste.map((e) => {
            const ersatz = anpassung.ersatz[e.adresse];
            return (
              <li key={e.adresse} className="flex items-start gap-2.5 px-3 py-1.5 hover:bg-accent" data-adresse={e.adresse}>
                <Checkbox className="mt-0.5" checked={geht(e.adresse)} onCheckedChange={(x) => um(e.adresse, !!x)} aria-label={e.adresse} />
                <span className="min-w-0 flex-1">
                  {bearbeite === e.adresse ? (
                    <Input autoFocus defaultValue={ersatz ?? e.adresse} className="h-7 text-sm" data-feld="adresse-bearbeiten" aria-label={`Adresse ${e.adresse} bearbeiten`}
                      onKeyDown={(k) => { if (k.key === "Enter") (k.target as HTMLInputElement).blur(); if (k.key === "Escape") setBearbeite(null); }}
                      onBlur={(k) => {
                        const w = k.target.value.trim();
                        setBearbeite(null);
                        if (w === e.adresse || !w) anpassen((p) => { const r = { ...p.ersatz }; delete r[e.adresse]; return { ...p, ersatz: r }; });
                        else if (!istMail(w)) toast.error("Keine gültige E-Mail-Adresse", { description: w });
                        else anpassen((p) => ({ ...p, ersatz: { ...p.ersatz, [e.adresse]: w } }));
                      }} />
                  ) : (
                    <span className="block truncate text-sm">{ersatz || e.adresse}{ersatz ? <span className="text-xs text-muted-foreground"> (statt {e.adresse})</span> : null}</span>
                  )}
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.rolle}{e.eigen ? "" : ` · ${e.wer}`}{e.notiz ? ` · ${e.notiz}` : ""}{e.standard && e.eigen ? " · Standard" : ""}
                  </span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`${e.adresse} bearbeiten`} data-knopf="adresse-bearbeiten" onClick={() => setBearbeite(e.adresse)}><PencilIcon /></Button>
              </li>
            );
          })}
          {anpassung.extra.map((a) => (
            <li key={a} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent" data-extra={a}>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{a}</span><span className="block text-xs text-muted-foreground">von Hand ergänzt</span></span>
              <Button variant="ghost" size="icon-sm" aria-label={`${a} entfernen`} onClick={() => anpassen((p) => ({ ...p, extra: p.extra.filter((x) => x !== a) }))}><XIcon /></Button>
            </li>
          ))}
          {!liste.length && !anpassung.extra.length && <li className="px-3 py-2 text-sm text-muted-foreground">Keine Adresse in DATEV – unten eine ergänzen.</li>}
        </ul>
        <form className="flex items-center gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); ergaenze(); }}>
          <Input value={neu} onChange={(e) => setNeu(e.target.value)} type="email" placeholder="Weitere Adresse ergänzen" aria-label={`Weitere Adresse für ${m.name}`} className="h-8 text-sm" data-feld="adresse-neu" />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Adresse ergänzen" data-knopf="adresse-neu"><PlusIcon /></Button>
        </form>
        {(eigeneWahl || Object.keys(anpassung.ersatz).length > 0 || anpassung.extra.length > 0) && (
          <div className="border-t p-2"><Button variant="ghost" size="sm" onClick={() => { setze(null); anpassen(() => ({ ersatz: {}, extra: [] })); }}>Zurücksetzen</Button></div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Platzhalter({ einfuegen }: { einfuegen: (p: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="me-1 text-xs text-muted-foreground">Einfügen:</span>
      {PLATZHALTER.map((p) => (
        <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => einfuegen(p)}
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
    const pfade = [...e.dataTransfer.files].map((f) => kh().pfadVon(f)).filter(Boolean);
    if (pfade.length) dazu(await kh().dateiInfo(pfade));
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
