// Adressen eines Mandanten ankreuzen: für eine Serienmail (nur diese Mail) oder als festen Standard (bleibt gespeichert).
import { useState } from "react";
import { AtSignIcon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { gueltigeMails, standardFuer, type Mandant } from "@/lib/kh";

export type SetzeStandard = (nummer: number, liste: string[] | null) => Promise<boolean>;

/** Liste mit Häkchen; zeigt Herkunft, DATEV-Standard und festgelegten Standard. */
function AdressListe({ m, an, um }: { m: Mandant; an: string[]; um: (adresse: string, an: boolean) => void }) {
  return (
    <ul className="max-h-[min(28rem,60vh)] overflow-auto py-1">
      {gueltigeMails(m).map((e) => (
        <li key={e.adresse}>
          <label className="flex cursor-pointer items-start gap-2.5 px-3 py-1.5 hover:bg-accent" data-adresse={e.adresse}>
            <Checkbox className="mt-0.5" checked={an.includes(e.adresse)} onCheckedChange={(x) => um(e.adresse, !!x)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm">{e.adresse}</span>
                {e.festgelegt && <span className="shrink-0 rounded-[4px] bg-brand-soft px-1 text-xs font-medium text-brand" data-festgelegt>Standard</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {e.rolle}{e.eigen ? "" : ` · ${e.wer}`}{e.notiz ? ` · ${e.notiz}` : ""}{e.standard && e.eigen ? " · Standard in DATEV" : ""}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

const umschalten = (liste: string[], adresse: string, an: boolean, reihenfolge: string[]) =>
  reihenfolge.filter((x) => (x === adresse ? an : liste.includes(x)));

/** Serienmail: Adressen nur für diese Mail – mit „Als Standard merken“. */
export function MailAdressWahl({ m, an, eigeneWahl, setze, setzeStandard }: {
  m: Mandant; an: string[]; eigeneWahl: boolean; setze: (a: string[] | null) => void; setzeStandard: SetzeStandard;
}) {
  const alle = gueltigeMails(m).map((e) => e.adresse);
  const gleichStandard = an.length > 0 && an.length === (m.festeAdressen ?? []).length && an.every((a) => m.festeAdressen!.includes(a));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Adressen für ${m.name} wählen`} data-knopf="adressen"><AtSignIcon /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 min-w-80 max-w-[90vw] resize-x overflow-auto p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">An wen geht die Mail an {m.name}?</div>
        <AdressListe m={m} an={an} um={(a, x) => setze(umschalten(an, a, x, alle))} />
        <div className="flex flex-wrap gap-1 border-t p-2">
          <Button variant="ghost" size="sm" disabled={!an.length || gleichStandard} data-knopf="als-standard"
            onClick={async () => { if (await setzeStandard(m.nummer, an)) setze(null); }}><StarIcon />Als Standard merken</Button>
          {eigeneWahl && <Button variant="ghost" size="sm" onClick={() => setze(null)}>Wie oben eingestellt</Button>}
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
