import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTextIcon, FolderIcon, HistoryIcon, MailIcon, MoreHorizontalIcon, PlusIcon, SettingsIcon, TagIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ampel, kannMail, kh, mitRegeln, type Ansicht as AnsichtT, type Datei, type Gruppe, type Mandant, type Protokollzeile, type Status, type Vorlage, type Ziel } from "@/lib/kh";
import { Mandanten, type Quelle } from "@/ansichten/Mandanten";
import { Serienmail } from "@/ansichten/Serienmail";
import { Vorlagen } from "@/ansichten/Vorlagen";
import { Protokoll } from "@/ansichten/Protokoll";
import { Einstellungen } from "@/ansichten/Einstellungen";
import { cn } from "@/lib/utils";

export type Ansicht = "mandanten" | "serienmail" | "vorlagen" | "protokoll" | "einstellungen";

/** Entwurf der Serienmail bleibt erhalten, wenn man zwischendurch die Ansicht wechselt. */
export interface Entwurf {
  vorlageId: string | null; betreff: string; text: string; alle: Datei[]; pro: Datei[];
  /** Regel für alle Empfänger; `wahl` überschreibt sie pro Mandant (Nummer → Adressen). */
  ziel: Ziel; wahl: Record<number, string[]>;
}

export default function App() {
  const [ansicht, setAnsicht] = useState<Ansicht>("mandanten");
  const [quelle, setQuelle] = useState<Quelle>({ art: "alle" });
  const [status, setStatus] = useState<Status | null>(null);
  const [roh, setRoh] = useState<Mandant[]>([]);
  const [stand, setStand] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [scan, setScan] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [tabelle, setTabelle] = useState<AnsichtT>({});
  const [protokoll, setProtokoll] = useState<Protokollzeile[]>([]);
  const [entwurf, setEntwurf] = useState<Entwurf>({ vorlageId: null, betreff: "", text: "", alle: [], pro: [], ziel: "standard", wahl: {} });
  const [gruppenDialog, setGruppenDialog] = useState<{ id?: string; name: string; mitglieder: number[] } | null>(null);
  const [loeschen, setLoeschen] = useState<Gruppe | null>(null);
  const speicherTakt = useRef<number>(0);

  const ladeStatus = useCallback(async () => {
    const s = await kh().status();
    setStatus(s);
    document.documentElement.toggleAttribute("data-mica", s.mica);
  }, []);
  const ladeProtokoll = useCallback(async () => setProtokoll(await kh().protokoll()), []);
  const scanne = useCallback(async (neu = false) => {
    setLaedt(true); setLadefehler(null); setScan(null);
    try {
      const d = await kh().mandanten(neu);
      setRoh(d.mandanten);
      setStand(d.stand);
      setAuswahl((a) => new Set([...a].filter((n) => d.mandanten.some((m) => m.nummer === n))));
      if (neu) toast.success(`${d.mandanten.length} Mandanten gescannt`, { description: d.hinweise.join(" · ") || undefined });
    } catch (f) {
      setRoh([]);
      setLadefehler(f instanceof Error ? f.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(f));
    } finally { setLaedt(false); setScan(null); ladeStatus(); }
  }, [ladeStatus]);

  useEffect(() => {
    const ab = kh().aufScan((fertig, gesamt) => setScan({ fertig, gesamt }));
    ladeStatus(); ladeProtokoll(); scanne();
    kh().gruppen().then(setGruppen);
    kh().ansicht().then(setTabelle);
    kh().vorlagen().then((v) => {
      setVorlagen(v);
      if (v[0]) setEntwurf((e) => (e.vorlageId ? e : { ...e, vorlageId: v[0].id, betreff: v[0].betreff, text: v[0].text }));
    });
    return ab;
  }, [ladeStatus, ladeProtokoll, scanne]);

  // Abgeschaltete Prüfregeln wirken überall: Ampel, Filter, {{FehlendeAngaben}}
  const mandanten = useMemo(() => roh.map((m) => mitRegeln(m, status?.einstellungen.regeln)), [roh, status?.einstellungen.regeln]);

  const setzeTabelle = (a: AnsichtT) => {
    setTabelle(a);
    window.clearTimeout(speicherTakt.current);
    speicherTakt.current = window.setTimeout(() => kh().speichereAnsicht(a), 400);
  };
  const speichereGruppen = async (liste: Gruppe[]) => {
    try { setGruppen(await kh().speichereGruppen(liste)); return true; }
    catch (f) { toast.error("Gruppen nicht gespeichert", { description: String(f) }); return false; }
  };
  const speichereVorlagen = async (liste: Vorlage[]) => {
    try { setVorlagen(await kh().speichereVorlagen(liste)); return true; }
    catch (f) { toast.error("Vorlagen nicht gespeichert", { description: String(f) }); return false; }
  };

  const zuGruppe = (id: string | null, nummern: number[]) => {
    if (!id) { setGruppenDialog({ name: "", mitglieder: nummern }); return; }
    const g = gruppen.find((x) => x.id === id)!;
    speichereGruppen(gruppen.map((x) => (x.id === id ? { ...x, mitglieder: [...new Set([...x.mitglieder, ...nummern])] } : x)))
      .then((ok) => ok && toast.success(`${nummern.length} zu „${g.name}“ hinzugefügt`));
  };
  const ausGruppe = (id: string, nummern: number[]) =>
    speichereGruppen(gruppen.map((x) => (x.id === id ? { ...x, mitglieder: x.mitglieder.filter((n) => !nummern.includes(n)) } : x)))
      .then((ok) => { if (ok) { setAuswahl(new Set()); toast.success(`${nummern.length} aus der Gruppe entfernt`); } });
  const gruppeSichern = async () => {
    const d = gruppenDialog; if (!d || !d.name.trim()) return;
    const liste = d.id ? gruppen.map((g) => (g.id === d.id ? { ...g, name: d.name.trim() } : g))
      : [...gruppen, { id: `g${Date.now()}`, name: d.name.trim(), mitglieder: d.mitglieder }];
    if (await speichereGruppen(liste)) {
      toast.success(d.id ? "Gruppe umbenannt" : `Gruppe „${d.name.trim()}“ angelegt`);
      if (!d.id) { setQuelle({ art: "gruppe", id: liste.at(-1)!.id }); setAnsicht("mandanten"); }
      setGruppenDialog(null);
    }
  };
  const gruppeAnschreiben = (nummern: number[]) => {
    setAuswahl(new Set(nummern.filter((n) => { const m = mandanten.find((x) => x.nummer === n); return m && kannMail(m); })));
    setAnsicht("serienmail");
  };

  const datevGruppen = useMemo(() => {
    const z = new Map<string, number>();
    for (const m of mandanten) for (const g of m.datevGruppen) z.set(g, (z.get(g) ?? 0) + 1);
    return [...z.entries()].sort(([a], [b]) => a.localeCompare(b, "de"));
  }, [mandanten]);
  const offen = mandanten.filter((m) => ampel(m) !== "ok").length;
  const verbindung = !status ? null : status.einstellungen.demo ? "demo" : status.datev ? "ok" : "aus";
  const istAktiv = (q: Quelle) => ansicht === "mandanten" && JSON.stringify(q) === JSON.stringify(quelle);
  const zeige = (q: Quelle) => { setQuelle(q); setAnsicht("mandanten"); };

  const nav: { id: Ansicht; titel: string; icon: typeof UsersIcon; badge?: number }[] = [
    { id: "serienmail", titel: "Serienmail", icon: MailIcon, badge: auswahl.size || undefined },
    { id: "vorlagen", titel: "Vorlagen", icon: FileTextIcon },
    { id: "protokoll", titel: "Protokoll", icon: HistoryIcon },
  ];

  return (
    <TooltipProvider delayDuration={400}>
      <SidebarProvider className="bg-transparent">
        <Sidebar collapsible="icon" className="border-r-0">
          <SidebarHeader className="ziehen h-[52px] justify-center px-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <Marke />
              <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] group-data-[collapsible=icon]:hidden">Kanzlei-Helfer</span>
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-0">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={istAktiv({ art: "alle" })} onClick={() => zeige({ art: "alle" })} tooltip="Alle Mandanten" data-ansicht="mandanten">
                      <UsersIcon /><span>Alle Mandanten</span>
                    </SidebarMenuButton>
                    {offen ? <SidebarMenuBadge className="zahl text-err" title={`${offen} mit Lücken oder zu prüfen`}>{offen}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                  {nav.map((n) => (
                    <SidebarMenuItem key={n.id}>
                      <SidebarMenuButton isActive={ansicht === n.id} onClick={() => setAnsicht(n.id)} tooltip={n.titel} data-ansicht={n.id}>
                        <n.icon /><span>{n.titel}</span>
                      </SidebarMenuButton>
                      {n.badge ? <SidebarMenuBadge className="zahl text-muted-foreground">{n.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Eigene Gruppen</SidebarGroupLabel>
              <SidebarGroupAction title="Neue Gruppe" aria-label="Neue Gruppe" onClick={() => setGruppenDialog({ name: "", mitglieder: [...auswahl] })} data-knopf="gruppe-neu">
                <PlusIcon />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  {gruppen.map((g) => (
                    <SidebarMenuItem key={g.id}>
                      <SidebarMenuButton isActive={istAktiv({ art: "gruppe", id: g.id })} onClick={() => zeige({ art: "gruppe", id: g.id })} tooltip={g.name} data-gruppe-nav={g.name}>
                        <FolderIcon /><span>{g.name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="zahl text-muted-foreground group-hover/menu-item:opacity-0">{g.mitglieder.length}</SidebarMenuBadge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><SidebarMenuAction showOnHover aria-label={`${g.name}: Aktionen`}><MoreHorizontalIcon /></SidebarMenuAction></DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem onSelect={() => gruppeAnschreiben(g.mitglieder)}>Alle anschreiben</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setGruppenDialog({ id: g.id, name: g.name, mitglieder: g.mitglieder })}>Umbenennen</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-err focus:text-err" onSelect={() => setLoeschen(g)}>Löschen</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                  {!gruppen.length && <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Mandanten auswählen → „Zu Gruppe“</p>}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {datevGruppen.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel>DATEV-Gruppen</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {datevGruppen.map(([name, n]) => (
                      <SidebarMenuItem key={name}>
                        <SidebarMenuButton isActive={istAktiv({ art: "datev", name })} onClick={() => zeige({ art: "datev", name })} tooltip={name}>
                          <TagIcon /><span>{name}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="zahl text-muted-foreground">{n}</SidebarMenuBadge>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={ansicht === "einstellungen"} onClick={() => setAnsicht("einstellungen")} tooltip="Einstellungen" data-ansicht="einstellungen">
                  <SettingsIcon /><span>Einstellungen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center" title={status?.meldung || status?.einstellungen.datevconnect}>
              <span className={cn("size-2 shrink-0 rounded-full", verbindung === "ok" && "bg-ok", verbindung === "demo" && "bg-warn", verbindung === "aus" && "bg-err", !verbindung && "bg-line")} />
              <span className="truncate group-data-[collapsible=icon]:hidden" data-verbindung={verbindung ?? ""}>
                {verbindung === "ok" ? "DATEVconnect verbunden" : verbindung === "demo" ? "Demodaten" : verbindung === "aus" ? "DATEVconnect nicht erreichbar" : "Verbinde …"}
              </span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="inhalt min-w-0">
          {ansicht === "mandanten" && (
            <Mandanten mandanten={mandanten} stand={stand} laedt={laedt} scan={scan} fehler={ladefehler} status={status} protokoll={protokoll}
              auswahl={auswahl} setAuswahl={setAuswahl} gruppen={gruppen} quelle={quelle} ansicht={tabelle} setAnsicht={setzeTabelle}
              neuScannen={() => scanne(true)} anschreiben={() => setAnsicht("serienmail")} zuEinstellungen={() => setAnsicht("einstellungen")}
              zuGruppe={zuGruppe} ausGruppe={ausGruppe} />
          )}
          {ansicht === "serienmail" && (
            <Serienmail mandanten={mandanten} auswahl={auswahl} setAuswahl={setAuswahl} vorlagen={vorlagen} status={status} gruppen={gruppen}
              entwurf={entwurf} setEntwurf={setEntwurf} zuMandanten={() => zeige({ art: "alle" })} nachVersand={ladeProtokoll} />
          )}
          {ansicht === "vorlagen" && <Vorlagen vorlagen={vorlagen} speichern={speichereVorlagen} />}
          {ansicht === "protokoll" && <Protokoll zeilen={protokoll} neuLaden={ladeProtokoll} status={status} />}
          {ansicht === "einstellungen" && (
            <Einstellungen status={status} gespeichert={async () => { await ladeStatus(); await scanne(true); }} pruefen={ladeStatus} />
          )}
        </SidebarInset>
      </SidebarProvider>

      <Dialog open={!!gruppenDialog} onOpenChange={(o) => !o && setGruppenDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{gruppenDialog?.id ? "Gruppe umbenennen" : "Neue Gruppe"}</DialogTitle>
            <DialogDescription>{gruppenDialog?.id ? "Der neue Name gilt sofort." : gruppenDialog?.mitglieder.length ? `${gruppenDialog.mitglieder.length} ausgewählte Mandanten kommen in die Gruppe.` : "Die Gruppe ist zunächst leer. Mandanten fügen Sie über „Zu Gruppe“ hinzu."}</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={gruppenDialog?.name ?? ""} onChange={(e) => setGruppenDialog((d) => d && { ...d, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && gruppeSichern()} placeholder="z. B. Lohnmandanten Dresden" aria-label="Name der Gruppe" data-feld="gruppenname" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGruppenDialog(null)}>Abbrechen</Button>
            <Button onClick={gruppeSichern} disabled={!gruppenDialog?.name.trim()} data-knopf="gruppe-sichern">{gruppenDialog?.id ? "Umbenennen" : "Anlegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!loeschen} onOpenChange={(o) => !o && setLoeschen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>„{loeschen?.name}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription>Nur die Gruppe verschwindet. Die Mandanten und ihre Daten in DATEV bleiben unberührt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const g = loeschen!; setLoeschen(null);
              if (await speichereGruppen(gruppen.filter((x) => x.id !== g.id))) { if (quelle.art === "gruppe" && quelle.id === g.id) setQuelle({ art: "alle" }); toast.success("Gruppe gelöscht"); }
            }}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

/** Zeichen der App: Akte mit Haken, in Petrol. Gleiche Form wie das Programm-Icon. */
function Marke() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--brand)" />
      <path d="M10 8.5h8.5l4 4V23a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 23V10A1.5 1.5 0 0 1 10 8.5Z" fill="none" stroke="var(--brand-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m12.5 17 2.5 2.5 4.5-5" fill="none" stroke="var(--brand-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Werkzeugleiste jeder Ansicht, zugleich Titelleiste des Fensters (zum Ziehen).
 * Rechts bleibt Platz für die Windows-Fensterknöpfe.
 */
export function Kopf({ titel, unter, children }: { titel: string; unter?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="ziehen sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-4 border-b bg-background/80 pr-[150px] pl-6 backdrop-blur-xl backdrop-saturate-150">
      <div className="min-w-0">
        <h1 className="truncate text-[0.9375rem] leading-tight font-semibold tracking-[-0.01em]">{titel}</h1>
        {unter && <p className="truncate text-xs text-muted-foreground">{unter}</p>}
      </div>
      <div className="ms-auto flex items-center gap-2">{children}</div>
    </header>
  );
}
