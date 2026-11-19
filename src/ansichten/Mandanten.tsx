import { Fragment, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, CircleCheckIcon, CircleXIcon, Columns3Icon, DownloadIcon, FolderPlusIcon,
  FunnelIcon, LayersIcon, MailIcon, OctagonXIcon, RefreshCwIcon, SearchIcon, StarIcon, TriangleAlertIcon, UserMinusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kopf } from "@/App";
import { StandardWahl, type SetzeStandard } from "@/ansichten/AdressWahl";
import { ampel, FELD, kannMail, kh, mailText, TYP, type Ampel, type Ansicht, type Gruppe, type Mandant, type Protokollzeile, type Status } from "@/lib/kh";
import { alsText, AMPEL_TEXT, gruppenSchluessel, SPALTE, SPALTEN, STANDARD_SPALTEN, type Spalte, type Umgebung } from "@/lib/spalten";
import { cn } from "@/lib/utils";

const AMPEL: Record<Ampel, { icon: typeof CircleCheckIcon; farbe: string }> = {
  ok: { icon: CircleCheckIcon, farbe: "text-ok" }, pruefen: { icon: TriangleAlertIcon, farbe: "text-warn" }, fehlt: { icon: OctagonXIcon, farbe: "text-err" },
};
export type Quelle = { art: "alle" } | { art: "gruppe"; id: string } | { art: "datev"; name: string };

interface Props {
  mandanten: Mandant[]; stand: string | null; laedt: boolean; scan: { fertig: number; gesamt: number } | null; fehler: string | null;
  status: Status | null; protokoll: Protokollzeile[]; auswahl: Set<number>; setAuswahl: (s: Set<number>) => void;
  gruppen: Gruppe[]; quelle: Quelle; ansicht: Ansicht; setAnsicht: (a: Ansicht) => void;
  neuScannen: () => void; anschreiben: () => void; zuEinstellungen: () => void;
  zuGruppe: (gruppeId: string | null, nummern: number[]) => void; ausGruppe: (gruppeId: string, nummern: number[]) => void;
  setzeStandard: SetzeStandard;
}

export function Mandanten(p: Props) {
  const { mandanten, auswahl, setAuswahl, gruppen, quelle, ansicht, setAnsicht, status } = p;
  const [suche, setSuche] = useState("");
  const [segment, setSegment] = useState<"alle" | Ampel>("alle");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [zu, setZu] = useState<Set<string>>(new Set());
  const sucheRef = useRef<HTMLInputElement>(null);

  const sichtbar = (ansicht.spalten?.length ? ansicht.spalten : STANDARD_SPALTEN).map((id) => SPALTE.get(id)).filter((s): s is Spalte => !!s);
  const gruppe = ansicht.gruppe ? SPALTE.get(ansicht.gruppe) ?? null : null;
  const sort = ansicht.sort ?? { id: "nummer", ab: false };
  const setze = (teil: Partial<Ansicht>) => setAnsicht({ ...ansicht, ...teil });

  const u: Umgebung = useMemo(() => {
    const zuletzt = new Map<string, Protokollzeile>();
    for (const z of p.protokoll) if (z.Ergebnis === "ok") zuletzt.set(String(z.Mandantennr), z);
    return { gruppen, zuletzt };
  }, [gruppen, p.protokoll]);

  // Herkunft (Seitenleiste) → Segment → Suche → Spaltenfilter → Sortierung
  const ausQuelle = useMemo(() => {
    if (quelle.art === "gruppe") { const g = gruppen.find((x) => x.id === quelle.id); return mandanten.filter((m) => g?.mitglieder.includes(m.nummer)); }
    if (quelle.art === "datev") return mandanten.filter((m) => m.datevGruppen.includes(quelle.name));
    return mandanten;
  }, [mandanten, gruppen, quelle]);

  const zeilen = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const spaltenFilter = Object.entries(filter).filter(([, v]) => v.trim()).map(([id, v]) => [SPALTE.get(id)!, v.trim().toLowerCase()] as const).filter(([s]) => s);
    const liste = ausQuelle.filter((m) =>
      (segment === "alle" || ampel(m) === segment) &&
      (!q || `${m.nummer} ${m.name} ${m.email ?? ""} ${sichtbar.map((s) => alsText(s.wert(m, u))).join(" ")}`.toLowerCase().includes(q)) &&
      spaltenFilter.every(([s, v]) => alsText(s.wert(m, u)).toLowerCase().includes(v)));
    const s = SPALTE.get(sort.id) ?? SPALTE.get("nummer")!;
    const vgl = (a: Mandant, b: Mandant) => {
      const x = s.wert(a, u), y = s.wert(b, u);
      const r = typeof x === "number" && typeof y === "number" ? x - y : alsText(x).localeCompare(alsText(y), "de", { numeric: true, sensitivity: "base" });
      return (alsText(x) === "" ? 1 : 0) - (alsText(y) === "" ? 1 : 0) || (sort.ab ? -r : r);
    };
    return liste.sort(vgl);
  }, [ausQuelle, segment, suche, filter, sort.id, sort.ab, u, sichtbar.map((s) => s.id).join()]);

  const gruppiert = useMemo(() => {
    if (!gruppe) return null;
    const m = new Map<string, Mandant[]>();
    for (const z of zeilen) for (const k of gruppenSchluessel(gruppe, z, u)) { if (!m.has(k)) m.set(k, []); m.get(k)!.push(z); }
    return [...m.entries()].sort(([a], [b]) => (a === "(ohne)" ? 1 : b === "(ohne)" ? -1 : a.localeCompare(b, "de", { numeric: true })));
  }, [zeilen, gruppe, u]);

  const anzahl = (a: Ampel) => ausQuelle.filter((m) => ampel(m) === a).length;
  const waehlbar = (liste: Mandant[]) => liste.filter(kannMail).map((m) => m.nummer);
  const umschalten = (nummern: number[], an: boolean) => {
    const s = new Set(auswahl);
    for (const n of nummern) an ? s.add(n) : s.delete(n);
    setAuswahl(s);
  };
  const alleSichtbar = waehlbar(zeilen);
  const alleGewaehlt = alleSichtbar.length > 0 && alleSichtbar.every((n) => auswahl.has(n));
  const einigeGewaehlt = alleSichtbar.some((n) => auswahl.has(n));

  const exportieren = async () => {
    // Werte, die mit = + - @ beginnen, führt Excel als Formel aus → mit ' als Text kennzeichnen
    const z = (v: unknown) => '"' + String(v ?? "").replace(/^(?=[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20])/, "'").replace(/"/g, '""') + '"';
    const kopf = sichtbar.map((s) => z(s.titel)).join(";");
    const inhalt = zeilen.map((m) => sichtbar.map((s) => z(alsText(s.wert(m, u)))).join(";"));
    const ziel = await kh().exportiere({ name: `Mandanten_${new Date().toISOString().slice(0, 10)}.csv`, inhalt: [kopf, ...inhalt].join("\r\n") });
    if (ziel) toast.success("Liste gespeichert", { description: ziel });
  };

  const titel = quelle.art === "gruppe" ? gruppen.find((g) => g.id === quelle.id)?.name ?? "Gruppe" : quelle.art === "datev" ? quelle.name : "Alle Mandanten";
  const stand = p.stand ? new Date(p.stand).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;
  const unter = p.laedt ? (p.scan?.gesamt ? `Scanne ${p.scan.fertig} von ${p.scan.gesamt} …` : "Scanne DATEV …")
    : p.fehler ? "Keine Verbindung"
    : `${ausQuelle.length} Mandanten${stand ? ` · gescannt ${stand} Uhr` : ""}${status?.einstellungen.demo ? " · Demodaten" : ""}`;
  const breiten = [44, ...sichtbar.map((s) => s.breite)];
  const links = (i: number) => breiten.slice(0, i).reduce((a, b) => a + b, 0); // feste erste Spalten wie in DATEV
  const fest = (i: number) => i < 3;
  const kante = (i: number) => (i === 2 ? "shadow-[inset_-1px_0_0_var(--line)]" : "");

  return (
    <div className="flex h-svh flex-col">
      <Kopf titel={titel} unter={<span className="zahl">{unter}</span>}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted-foreground" aria-hidden="true" />
          <Input ref={sucheRef} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" aria-label="In allen Spalten suchen"
            className="h-8 w-56 rounded-full border-transparent bg-surface-2 ps-8 pe-8 focus-visible:bg-background" />
          {suche && <button type="button" aria-label="Suche leeren" onClick={() => { setSuche(""); sucheRef.current?.focus(); }}
            className="absolute inset-y-0 end-2 my-auto text-muted-foreground hover:text-foreground"><CircleXIcon className="size-4" /></button>}
        </div>
        <Button size="sm" onClick={p.neuScannen} disabled={p.laedt} data-knopf="scannen">
          <RefreshCwIcon className={cn(p.laedt && "animate-spin")} />{p.laedt ? "Scannt …" : "Neu scannen"}
        </Button>
      </Kopf>
      <div className="h-0.5 shrink-0 bg-transparent">
        {p.laedt && <div className="h-full bg-brand transition-[width] duration-200" style={{ width: p.scan?.gesamt ? `${(p.scan.fertig / p.scan.gesamt) * 100}%` : "8%" }} data-scanbalken />}
      </div>

      {p.fehler ? (
        <div className="m-6 max-w-2xl rounded-xl border border-err/30 bg-err-soft p-5 text-sm" role="alert">
          <div className="font-semibold text-err">DATEVconnect nicht erreichbar</div>
          <p className="kennung mt-1 break-all text-muted-foreground">{status?.einstellungen.datevconnect}</p>
          <p className="mt-2">{p.fehler}</p>
          <p className="mt-2 text-muted-foreground">Prüfen: DATEV-Arbeitsplatz → Organisation | Basissoftware | Kommunikation → DATEVconnect-Einrichtung, Status „GESTARTET“.</p>
          <div className="mt-4 flex gap-2"><Button variant="outline" onClick={p.neuScannen}>Erneut scannen</Button><Button variant="ghost" onClick={p.zuEinstellungen}>Adresse ändern</Button></div>
        </div>
      ) : (
        <>
          {/* Leiste: Segment, Gruppieren, Filterzeile, Spalten | Auswahl-Aktionen */}
          <div className="flex flex-wrap items-center gap-2 px-6 pt-4 pb-3">
            <Segment wert={segment} setze={setSegment} optionen={[
              { wert: "alle", text: "Alle", zahl: ausQuelle.length }, { wert: "fehlt", text: "Lücken", zahl: anzahl("fehlt") },
              { wert: "pruefen", text: "Prüfen", zahl: anzahl("pruefen") }, { wert: "ok", text: "Vollständig", zahl: anzahl("ok") }]} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-knopf="gruppieren" className={cn(gruppe && "bg-brand-soft text-brand hover:bg-brand-soft")}>
                  <LayersIcon />{gruppe ? `Gruppiert: ${gruppe.titel}` : "Gruppieren"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-96 w-64 overflow-auto" onCloseAutoFocus={(e) => e.preventDefault()}>
                <DropdownMenuRadioGroup value={gruppe?.id ?? ""} onValueChange={(v) => { setZu(new Set()); setze({ gruppe: v || null }); }}>
                  <DropdownMenuRadioItem value="">Nicht gruppieren</DropdownMenuRadioItem>
                  {[...new Set(SPALTEN.filter((s) => s.gruppierbar).map((s) => s.bereich))].map((b) => (
                    <Fragment key={b}>
                      <DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-muted-foreground">{b}</DropdownMenuLabel>
                      {SPALTEN.filter((s) => s.gruppierbar && s.bereich === b).map((s) => <DropdownMenuRadioItem key={s.id} value={s.id} data-gruppieren={s.id}>{s.titel}</DropdownMenuRadioItem>)}
                    </Fragment>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" data-knopf="filterzeile" onClick={() => { if (ansicht.filterzeile) setFilter({}); setze({ filterzeile: !ansicht.filterzeile }); }}
              className={cn(ansicht.filterzeile && "bg-brand-soft text-brand hover:bg-brand-soft")}><FunnelIcon />Filterzeile</Button>
            <SpaltenWahl sichtbar={sichtbar.map((s) => s.id)} setze={(spalten) => setze({ spalten })} />
            <Button variant="ghost" size="sm" onClick={exportieren} disabled={!zeilen.length}><DownloadIcon />Für Excel</Button>

            <div className="ms-auto flex items-center gap-2">
              {auswahl.size > 0 && <span className="text-sm text-muted-foreground zahl">{auswahl.size} ausgewählt</span>}
              {auswahl.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm" data-knopf="zu-gruppe"><FolderPlusIcon />Zu Gruppe</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {gruppen.map((g) => <DropdownMenuItem key={g.id} onSelect={() => p.zuGruppe(g.id, [...auswahl])}>{g.name}</DropdownMenuItem>)}
                    {gruppen.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={() => p.zuGruppe(null, [...auswahl])} data-menue="neue-gruppe">Neue Gruppe …</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {auswahl.size > 0 && quelle.art === "gruppe" && (
                <Button variant="outline" size="sm" onClick={() => p.ausGruppe(quelle.id, [...auswahl])}><UserMinusIcon />Aus Gruppe entfernen</Button>
              )}
              <Button size="sm" onClick={p.anschreiben} disabled={!auswahl.size} data-knopf="anschreiben"><MailIcon />Anschreiben</Button>
            </div>
          </div>

          {/* Tabelle */}
          <div className="mx-6 mb-5 min-h-0 flex-1 overflow-auto rounded-xl border bg-background" data-tabelle>
            <table className="border-separate border-spacing-0 text-sm" style={{ width: breiten.reduce((a, b) => a + b, 0), minWidth: "100%", tableLayout: "fixed" }}>
              <colgroup>{breiten.map((b, i) => <col key={i} style={{ width: b }} />)}</colgroup>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 h-9 border-b bg-surface/85 px-3 text-left backdrop-blur-xl">
                    <Checkbox aria-label="Alle sichtbaren mit gültiger E-Mail auswählen" checked={alleGewaehlt || (einigeGewaehlt && "indeterminate")}
                      onCheckedChange={(v) => umschalten(alleSichtbar, !!v)} />
                  </th>
                  {sichtbar.map((s, i) => (
                    <ContextMenu key={s.id}>
                      <ContextMenuTrigger asChild>
                        <th data-spalte={s.id} style={fest(i + 1) ? { left: links(i + 1) } : undefined}
                          className={cn("h-9 border-b bg-surface/85 px-3 text-left text-xs font-semibold text-muted-foreground backdrop-blur-xl", fest(i + 1) && "sticky z-30", kante(i + 1))}>
                          <button type="button" className="flex w-full items-center gap-1 truncate hover:text-foreground"
                            onClick={() => setze({ sort: { id: s.id, ab: sort.id === s.id ? !sort.ab : false } })}>
                            <span className="truncate">{s.titel}</span>
                            {sort.id === s.id && (sort.ab ? <ArrowDownIcon className="size-3.5 shrink-0" /> : <ArrowUpIcon className="size-3.5 shrink-0" />)}
                          </button>
                        </th>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => setze({ sort: { id: s.id, ab: false } })}>Aufsteigend sortieren</ContextMenuItem>
                        <ContextMenuItem onSelect={() => setze({ sort: { id: s.id, ab: true } })}>Absteigend sortieren</ContextMenuItem>
                        {s.gruppierbar && <><ContextMenuSeparator />
                          {gruppe?.id === s.id
                            ? <ContextMenuItem onSelect={() => setze({ gruppe: null })}>Gruppierung aufheben</ContextMenuItem>
                            : <ContextMenuItem onSelect={() => { setZu(new Set()); setze({ gruppe: s.id }); }}>Nach „{s.titel}“ gruppieren</ContextMenuItem>}</>}
                        {s.id !== "name" && <><ContextMenuSeparator />
                          <ContextMenuItem onSelect={() => setze({ spalten: sichtbar.map((x) => x.id).filter((x) => x !== s.id) })}>Spalte ausblenden</ContextMenuItem></>}
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </tr>
                {ansicht.filterzeile && (
                  <tr data-filterzeile>
                    <th className="sticky left-0 z-30 border-b bg-surface/85 backdrop-blur-xl" />
                    {sichtbar.map((s, i) => (
                      <th key={s.id} style={fest(i + 1) ? { left: links(i + 1) } : undefined}
                        className={cn("border-b bg-surface/85 px-1.5 py-1.5 backdrop-blur-xl", fest(i + 1) && "sticky z-30", kante(i + 1))}>
                        {s.id === "stand" || s.id === "typ" ? (
                          <select aria-label={`Filter ${s.titel}`} value={filter[s.id] ?? ""} onChange={(e) => setFilter({ ...filter, [s.id]: e.target.value })}
                            className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs font-normal">
                            <option value="">Alle</option>
                            {(s.id === "stand" ? Object.values(AMPEL_TEXT) : Object.values(TYP)).map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        ) : (
                          <input aria-label={`Filter ${s.titel}`} data-filter={s.id} value={filter[s.id] ?? ""} onChange={(e) => setFilter({ ...filter, [s.id]: e.target.value })}
                            placeholder="enthält …" className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs font-normal outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40" />
                        )}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {p.laedt && !mandanten.length ? (
                  <tr><td colSpan={breiten.length} className="h-40 text-center text-muted-foreground">Scanne DATEV …</td></tr>
                ) : !zeilen.length ? (
                  <tr><td colSpan={breiten.length} className="h-40 text-center text-muted-foreground">{mandanten.length ? "Keine Mandanten für diese Auswahl." : "Keine Mandanten gefunden."}</td></tr>
                ) : gruppiert ? gruppiert.map(([schluessel, liste]) => {
                  const nummern = waehlbar(liste), offen = !zu.has(schluessel);
                  return (
                    <Fragment key={schluessel}>
                      <tr data-gruppe={schluessel} className="bg-surface">
                        <td className="sticky left-0 z-10 border-b bg-surface px-3 py-2">
                          <Checkbox aria-label={`Alle in ${schluessel} auswählen`} disabled={!nummern.length}
                            checked={nummern.length > 0 && nummern.every((n) => auswahl.has(n)) || (nummern.some((n) => auswahl.has(n)) && "indeterminate")}
                            onCheckedChange={(v) => umschalten(nummern, !!v)} />
                        </td>
                        <td colSpan={breiten.length - 1} className="border-b px-3 py-2">
                          <button type="button" className="sticky left-12 flex items-center gap-1.5 text-sm font-semibold"
                            onClick={() => { const s = new Set(zu); offen ? s.add(schluessel) : s.delete(schluessel); setZu(s); }}>
                            <ChevronRightIcon className={cn("size-4 text-muted-foreground transition-transform duration-200", offen && "rotate-90")} />
                            {schluessel}<span className="zahl font-normal text-muted-foreground">{liste.length}</span>
                          </button>
                        </td>
                      </tr>
                      {offen && liste.map((m) => <Zeile key={`${schluessel}-${m.nummer}`} m={m} sichtbar={sichtbar} u={u} auswahl={auswahl} umschalten={umschalten} links={links} fest={fest} kante={kante} setzeStandard={p.setzeStandard} />)}
                    </Fragment>
                  );
                }) : zeilen.map((m) => <Zeile key={m.nummer} m={m} sichtbar={sichtbar} u={u} auswahl={auswahl} umschalten={umschalten} links={links} fest={fest} kante={kante} setzeStandard={p.setzeStandard} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Zeile({ m, sichtbar, u, auswahl, umschalten, links, fest, kante, setzeStandard }: {
  m: Mandant; sichtbar: Spalte[]; u: Umgebung; auswahl: Set<number>; umschalten: (n: number[], an: boolean) => void;
  links: (i: number) => number; fest: (i: number) => boolean; kante: (i: number) => string; setzeStandard: SetzeStandard;
}) {
  const gewaehlt = auswahl.has(m.nummer);
  const grund = gewaehlt ? "bg-brand-soft" : "bg-background group-hover:bg-surface";
  return (
    <tr data-nummer={m.nummer} className="group">
      <td className={cn("sticky left-0 z-10 border-b px-3 py-2 align-top", grund)}>
        {kannMail(m) ? <Checkbox aria-label={`${m.name} auswählen`} checked={gewaehlt} onCheckedChange={(v) => umschalten([m.nummer], !!v)} />
          : <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Checkbox disabled aria-label={`${m.name}: keine gültige E-Mail`} /></span></TooltipTrigger><TooltipContent>Keine gültige E-Mail-Adresse</TooltipContent></Tooltip>}
      </td>
      {sichtbar.map((s, i) => (
        <td key={s.id} style={fest(i + 1) ? { left: links(i + 1) } : undefined} className={cn("border-b px-3 py-2 align-top", grund, fest(i + 1) && "sticky z-10", kante(i + 1))}>
          <Zelle s={s} m={m} u={u} setzeStandard={setzeStandard} />
        </td>
      ))}
    </tr>
  );
}

function Zelle({ s, m, u, setzeStandard }: { s: Spalte; m: Mandant; u: Umgebung; setzeStandard: SetzeStandard }) {
  if (s.id === "stand") {
    const a = ampel(m), A = AMPEL[a];
    return <span className={cn("inline-flex items-center gap-1.5 font-medium", A.farbe)} data-ampel={a} title={m.abruffehler ?? undefined}><A.icon className="size-4" aria-hidden="true" />{AMPEL_TEXT[a]}</span>;
  }
  if (s.id === "luecken") {
    if (m.abruffehler) return <Marke art="pruefen" title={m.abruffehler}>Stammdaten nicht abrufbar</Marke>;
    if (!m.luecken.length && !m.fehlerhaft.length) return <span className="text-muted-foreground">–</span>;
    return <Marken max={3} liste={[...m.luecken.map((f) => ({ text: FELD[f], art: "fehlt" as const })), ...m.fehlerhaft.map((f) => ({ text: `${FELD[f]} prüfen`, art: "pruefen" as const }))]} />;
  }
  if (s.id === "name") return <div className="min-w-0"><div className="truncate font-medium">{m.name}</div><div className="truncate text-xs text-muted-foreground">{TYP[m.typ] ?? m.typ}</div></div>;
  if (s.id === "aufgabenbereiche" && m.aufgabenbereiche.length) {
    return <Marken max={2} liste={m.aufgabenbereiche.map((a) => ({ text: a.bereich, art: "neutral" as const, title: a.mitarbeiter ? `Zuständig: ${a.mitarbeiter}` : "Kein zuständiger Mitarbeiter" }))} />;
  }
  const v = s.wert(m, u);
  if (s.id === "email") {
    // Angezeigt wird der Standard für Mails: in der App festgelegt (Stern), sonst die Standard-Adresse aus DATEV
    const fest = m.festeAdressen ?? [];
    const gezeigt = fest.length ? fest : m.email ? [m.email] : [];
    const weitere = (m.emails ?? []).filter((e) => !gezeigt.includes(e.adresse));
    return (
      <span className="flex min-w-0 items-center gap-1.5" title={(m.emails ?? []).map((e) => `${e.adresse} – ${mailText(e)}${e.festgelegt ? " · Standard (festgelegt)" : ""}`).join("\n")}>
        <span className={cn("truncate", !gezeigt.length && "text-muted-foreground", !fest.length && m.fehlerhaft.includes("email") && "text-warn")}>{gezeigt.length ? gezeigt.join(", ") : "keine eigene"}</span>
        {fest.length > 0 && <StarIcon className="size-3 shrink-0 fill-current text-brand" aria-label="Standard festgelegt" data-festgelegt />}
        {weitere.length > 0 && <span className="shrink-0 rounded-[4px] border px-1 text-xs text-muted-foreground zahl" data-weitere-mails={weitere.length}>+{weitere.length}</span>}
        <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100"><StandardWahl m={m} setzeStandard={setzeStandard} /></span>
      </span>
    );
  }
  if (Array.isArray(v)) return v.length ? <Marken max={2} liste={v.map((x) => ({ text: x, art: "neutral" as const }))} /> : <span className="text-muted-foreground">–</span>;
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">–</span>;
  return <span className={cn("block truncate", s.mono && "kennung", s.id === "nummer" && "text-muted-foreground", s.id === "email" && m.fehlerhaft.includes("email") && "text-warn")} title={String(v)}>{String(v)}</span>;
}

/** Mehrere Kennzeichen in einer Zeile wie in DATEV: die ersten zeigen, Rest als „+n“ (alles im Tooltip). */
function Marken({ liste, max }: { liste: { text: string; art: "fehlt" | "pruefen" | "neutral"; title?: string }[]; max: number }) {
  const rest = liste.length - max;
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden" title={liste.map((x) => x.title ? `${x.text} (${x.title})` : x.text).join("\n")}>
      {liste.slice(0, max).map((x, i) => <Marke key={i} art={x.art} title={x.title}>{x.text}</Marke>)}
      {rest > 0 && <span className="shrink-0 text-xs font-medium text-muted-foreground zahl">+{rest}</span>}
    </div>
  );
}

/** Kennzeichen: eckig statt Pille; Farbe plus Wort, nie Farbe allein. */
function Marke({ art, children, title }: { art: "fehlt" | "pruefen" | "neutral"; children: React.ReactNode; title?: string }) {
  return <span title={title} className={cn("inline-flex max-w-full shrink-0 items-center truncate rounded-[5px] px-1.5 py-px text-xs font-medium whitespace-nowrap",
    art === "fehlt" ? "bg-err-soft text-err" : art === "pruefen" ? "bg-warn-soft text-warn" : "bg-surface-2 text-foreground/80")}>{children}</span>;
}

/** Segmentschalter wie unter macOS: ein Feld, die Auswahl hebt sich als Fläche ab. */
function Segment<T extends string>({ wert, setze, optionen }: { wert: T; setze: (w: T) => void; optionen: { wert: T; text: string; zahl: number }[] }) {
  return (
    <div role="radiogroup" aria-label="Stand" className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {optionen.map((o) => (
        <button key={o.wert} type="button" role="radio" aria-checked={wert === o.wert} onClick={() => setze(o.wert)} data-segment={o.wert}
          className={cn("flex h-7 items-center gap-1.5 rounded-md px-3 text-sm transition-[background-color,box-shadow] duration-150 active:scale-[0.97]",
            wert === o.wert ? "bg-background font-medium shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.06)]" : "text-muted-foreground hover:text-foreground")}>
          {o.text}<span className="zahl text-xs text-muted-foreground">{o.zahl}</span>
        </button>
      ))}
    </div>
  );
}

function SpaltenWahl({ sichtbar, setze }: { sichtbar: string[]; setze: (s: string[]) => void }) {
  const [q, setQ] = useState("");
  const bereiche = [...new Set(SPALTEN.map((s) => s.bereich))];
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="sm" data-knopf="spalten"><Columns3Icon />Spalten</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Feld suchen" className="h-8" aria-label="Feld suchen" /></div>
        <div className="max-h-96 overflow-auto p-2">
          {bereiche.map((b) => {
            const liste = SPALTEN.filter((s) => s.bereich === b && s.titel.toLowerCase().includes(q.toLowerCase()));
            if (!liste.length) return null;
            return (
              <div key={b} className="mb-2">
                <div className="px-1 pb-1 text-xs font-semibold text-muted-foreground">{b}</div>
                {liste.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-surface-2" data-spaltenwahl={s.id}>
                    <Checkbox checked={sichtbar.includes(s.id)} disabled={s.id === "name"}
                      onCheckedChange={(v) => setze(v ? [...sichtbar, s.id] : sichtbar.filter((x) => x !== s.id))} />
                    {s.titel}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="border-t p-2"><Button variant="ghost" size="sm" onClick={() => setze(STANDARD_SPALTEN)}>Standard wiederherstellen</Button></div>
      </PopoverContent>
    </Popover>
  );
}
