// Adressen eines Mandanten ankreuzen: für eine Serienmail (nur diese Mail) oder als festen Standard (bleibt gespeichert).
import { useState } from "react";
import { AtSignIcon, PencilIcon, PlusIcon, StarIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { gueltigeMails, istMail, KEINE_ANPASSUNG, standardFuer, type Anpassung, type Mandant } from "@/lib/kh";

export type SetzeStandard = (nummer: number, liste: string[] | null) => Promise<boolean>;

/** Liste mit Häkchen; zeigt Herkunft, DATEV-Standard und festgelegten Standard. */
function AdressListe({ m, an, um, anpassung, anpassen }: {
  m: Mandant; an: string[]; um: (adresse: string, an: boolean) => void; anpassung?: Anpassung; anpassen?: (f: (a: Anpassung) => Anpassung) => void;
}) {
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const ersatzVon = (a: string) => anpassung?.ersatz[a];
  // Eine bearbeitete Adresse geht unter ihrer neuen Fassung mit.
  const geht = (orig: string) => an.includes(ersatzVon(orig)?.trim() || orig);
  return (
    <ul className="max-h-[min(28rem,60vh)] overflow-auto py-1">
      {gueltigeMails(m).map((e) => (
        <li key={e.adresse} className="flex items-start">
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-3 py-1.5 hover:bg-accent" data-adresse={e.adresse}>
            <Checkbox className="mt-0.5" checked={geht(e.adresse)} onCheckedChange={(x) => um(e.adresse, !!x)} aria-label={e.adresse} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {anpassen && bearbeite === e.adresse ? (
                  <Input autoFocus defaultValue={ersatzVon(e.adresse) ?? e.adresse} className="h-7 text-sm" data-feld="adresse-bearbeiten" aria-label={`Adresse ${e.adresse} bearbeiten`}
                    onClick={(k) => k.preventDefault()}
                    onKeyDown={(k) => { if (k.key === "Enter") (k.target as HTMLInputElement).blur(); if (k.key === "Escape") setBearbeite(null); }}
                    onBlur={(k) => {
                      const w = k.target.value.trim();
                      setBearbeite(null);
                      if (w === e.adresse || !w) anpassen((p) => { const r = { ...p.ersatz }; delete r[e.adresse]; return { ...p, ersatz: r }; });
                      else if (!istMail(w)) toast.error("Keine gültige E-Mail-Adresse", { description: w });
                      else anpassen((p) => ({ ...p, ersatz: { ...p.ersatz, [e.adresse]: w } }));
                    }} />
                ) : (
                  <span className="truncate text-sm">{ersatzVon(e.adresse) || e.adresse}{ersatzVon(e.adresse) ? <span className="text-xs text-muted-foreground"> (statt {e.adresse})</span> : null}</span>
                )}
                {e.festgelegt && <span className="shrink-0 rounded-[4px] bg-brand-soft px-1 text-xs font-medium text-brand" data-festgelegt>Standard</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {e.rolle}{e.eigen ? "" : ` · ${e.wer}`}{e.notiz ? ` · ${e.notiz}` : ""}{e.standard && e.eigen ? " · Standard in DATEV" : ""}
              </span>
            </span>
          </label>
          {anpassen && <Button variant="ghost" size="icon-sm" className="mt-0.5 me-1" aria-label={`${e.adresse} bearbeiten`} data-knopf="adresse-bearbeiten" onClick={() => setBearbeite(e.adresse)}><PencilIcon /></Button>}
        </li>
      ))}
      {anpassung?.extra.map((a) => (
        <li key={a} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent" data-extra={a}>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{a}</span><span className="block text-xs text-muted-foreground">von Hand ergänzt</span></span>
          <Button variant="ghost" size="icon-sm" aria-label={`${a} entfernen`} onClick={() => anpassen?.((p) => ({ ...p, extra: p.extra.filter((x) => x !== a) }))}><XIcon /></Button>
        </li>
      ))}
      {anpassen && !gueltigeMails(m).length && !anpassung?.extra.length && <li className="px-3 py-2 text-sm text-muted-foreground">Keine Adresse in DATEV – unten eine ergänzen.</li>}
    </ul>
  );
}

const umschalten = (liste: string[], adresse: string, an: boolean, reihenfolge: string[]) =>
  reihenfolge.filter((x) => (x === adresse ? an : liste.includes(x)));

/** Serienmail: Adressen nur für diese Mail – mit „Als Standard merken“. */
export function MailAdressWahl({ m, an, eigeneWahl, setze, setzeStandard, anpassung = KEINE_ANPASSUNG, anpassen }: {
  m: Mandant; an: string[]; eigeneWahl: boolean; setze: (a: string[] | null) => void; setzeStandard: SetzeStandard;
  /** Nur für diesen Versand bearbeitete/ergänzte Adressen (DATEV und Standard bleiben unverändert). */
  anpassung?: Anpassung; anpassen?: (f: (a: Anpassung) => Anpassung) => void;
}) {
  const alle = gueltigeMails(m).map((e) => e.adresse);
  const [neu, setNeu] = useState("");
  const geaendert = Object.keys(anpassung.ersatz).length > 0 || anpassung.extra.length > 0;
  const ergaenze = () => {
    const a = neu.trim();
    if (!istMail(a)) { toast.error("Keine gültige E-Mail-Adresse"); return; }
    anpassen?.((p) => ({ ...p, extra: p.extra.includes(a) ? p.extra : [...p.extra, a] }));
    setNeu("");
  };
  const gleichStandard = geaendert || an.length > 0 && an.length === (m.festeAdressen ?? []).length && an.every((a) => m.festeAdressen!.includes(a));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Adressen für ${m.name} wählen`} data-knopf="adressen"><AtSignIcon /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 min-w-80 max-w-[90vw] resize-x overflow-auto p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">An wen geht die Mail an {m.name}?</div>
        <AdressListe m={m} an={an} anpassung={anpassung} anpassen={anpassen}
          um={(a, x) => setze(alle.filter((o) => (o === a ? x : an.includes(anpassung.ersatz[o]?.trim() || o))))} />
        {anpassen && (
          <form className="flex items-center gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); ergaenze(); }}>
            <Input value={neu} onChange={(e) => setNeu(e.target.value)} type="email" placeholder="Weitere Adresse ergänzen" aria-label={`Weitere Adresse für ${m.name}`} className="h-8 text-sm" data-feld="adresse-neu" />
            <Button type="submit" variant="outline" size="icon-sm" aria-label="Adresse ergänzen" data-knopf="adresse-neu"><PlusIcon /></Button>
          </form>
        )}
        <div className="flex flex-wrap gap-1 border-t p-2">
          <Button variant="ghost" size="sm" disabled={!an.length || gleichStandard} data-knopf="als-standard"
            onClick={async () => { if (await setzeStandard(m.nummer, an)) setze(null); }}><StarIcon />Als Standard merken</Button>
          {(eigeneWahl || geaendert) && <Button variant="ghost" size="sm" onClick={() => { setze(null); anpassen?.(() => ({ ersatz: {}, extra: [] })); }}>Wie oben eingestellt</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Mandantenliste: Standard-Adressen dieses Mandanten festlegen (gelten für jede Serienmail). */
export function StandardWahl({ m, setzeStandard }: { m: Mandant; setzeStandard: SetzeStandard }) {
  const [offen, setOffen] = useState(false);
  const [wahl, setWahl] = useState<string[]>([]);
  const alle = gueltigeMails(m).map((e) => e.adresse);
  if (!alle.length) return null;
  return (
    <Popover open={offen} onOpenChange={(o) => { if (o) setWahl(standardFuer(m)); setOffen(o); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="-my-1 size-6 shrink-0 text-muted-foreground" aria-label={`Standard-Adressen für ${m.name}`} data-knopf="standard-adressen"
          onClick={(e) => e.stopPropagation()}><AtSignIcon /></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 min-w-80 max-w-[90vw] resize-x overflow-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-3 py-2">
          <div className="text-xs font-semibold text-muted-foreground">Standard-Adressen für {m.name}</div>
          <div className="text-xs text-muted-foreground">Bekommen jede Serienmail. Nur in der App gespeichert, DATEV bleibt unverändert.</div>
        </div>
        <AdressListe m={m} an={wahl} um={(a, x) => setWahl(umschalten(wahl, a, x, alle))} />
        <div className="flex flex-wrap gap-1 border-t p-2">
          <Button size="sm" disabled={!wahl.length} data-knopf="standard-speichern"
            onClick={async () => { if (await setzeStandard(m.nummer, wahl)) setOffen(false); }}>Als Standard speichern</Button>
          {m.festeAdressen && <Button variant="ghost" size="sm" data-knopf="standard-datev"
            onClick={async () => { if (await setzeStandard(m.nummer, null)) setOffen(false); }}>DATEV-Standard verwenden</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
