import { useEffect, useState } from "react";
import { CircleCheckIcon, FolderOpenIcon, OctagonXIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Kopf } from "@/App";
import { FELD, FELD_ERKLAERUNG, FELDER, fehlertext, kh, type Einstellungen as E, type Status } from "@/lib/kh";

export function Einstellungen({ status, gespeichert, pruefen }: { status: Status | null; gespeichert: () => Promise<void>; pruefen: () => Promise<void> }) {
  const [e, setE] = useState<E | null>(status?.einstellungen ?? null);
  const [laeuft, setLaeuft] = useState(false);
  const [pw, setPw] = useState("");
  useEffect(() => { if (status && !e) setE(status.einstellungen); }, [status, e]);
  if (!e || !status) return null;

  const geaendert = JSON.stringify(e) !== JSON.stringify(status.einstellungen) || !!pw;
  const sichern = async () => {
    setLaeuft(true);
    try {
      setE(await kh().speichereEinstellungen(e));
      if (pw) { await kh().speichereSmtpPasswort(pw); setPw(""); }
      await gespeichert();
      toast.success("Einstellungen gespeichert");
    } catch (f) { toast.error("Nicht gespeichert", { description: fehlertext(f) }); }
    finally { setLaeuft(false); }
  };

  const testen = async () => {
    setLaeuft(true);
    try {
      const r = await kh().smtpTest();
      if (r.ok) toast.success("Testmail gesendet", { description: "Bitte im Postfach des Absenders nachsehen." });
      else toast.error("Test fehlgeschlagen", { description: r.info });
    } catch (f) { toast.error("Test fehlgeschlagen", { description: fehlertext(f) }); }
    finally { setLaeuft(false); }
  };

  return (
    <div className="flex h-svh flex-col">
      <Kopf titel="Einstellungen" unter={`Version ${status.version}`}>
        <Button variant="outline" onClick={() => kh().oeffneOrdner("daten")}><FolderOpenIcon />Datenordner</Button>
        <Button onClick={sichern} disabled={!geaendert || laeuft} data-knopf="einstellungen-speichern">Speichern</Button>
      </Kopf>
      <div className="min-h-0 flex-1 overflow-auto px-8 py-8">
        <div className="grid max-w-3xl gap-12">
          <Abschnitt titel="DATEV" text="Die App liest nur (GET), meldet sich bei niemandem an und verbindet sich ausschließlich mit dieser Adresse – und nur, wenn der Server im eigenen Netz liegt.">
            <div className="grid gap-1.5">
              <Label htmlFor="e-url">Adresse von DATEVconnect (Stammdaten)</Label>
              <Input id="e-url" className="kennung" value={e.datevconnect} onChange={(x) => setE({ ...e, datevconnect: x.target.value })} disabled={e.demo} />
              <p className="text-xs text-muted-foreground">Standard in dieser Kanzlei: <span className="kennung">https://LIZENZSERVER:58452/datev/api/master-data/v1</span>. Auch der Link aus dem Browser (…/clients?…) geht – die App fragt denselben Server ab. Anmeldung mit dem Windows-Konto wie im Browser, nur bei diesem Server; nur Server im eigenen Netz.</p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm" data-verbindungstest>
              {status.einstellungen.demo ? <span className="text-muted-foreground">Demodaten aktiv, DATEV wird nicht abgefragt.</span>
                : status.datev ? <><CircleCheckIcon className="size-4 text-ok" /><span>Verbunden</span></>
                : <><OctagonXIcon className="size-4 shrink-0 text-err" /><span className="min-w-0 break-words">Nicht erreichbar: {status.meldung}</span></>}
              <Button variant="outline" size="sm" className="ms-auto" onClick={pruefen}>Erneut prüfen</Button>
            </div>
            <Schalter id="e-aktiv" titel="Nur aktive Mandanten" text="Inaktive Mandantenbeziehungen werden nicht geprüft." an={e.nurAktive} setze={(v) => setE({ ...e, nurAktive: v })} />
            <Schalter id="e-demo" titel="Demodaten verwenden" text="Erfundene Testmandanten statt DATEV, zum Ausprobieren. Mails werden dann nur als .eml-Dateien gespeichert." an={e.demo} setze={(v) => setE({ ...e, demo: v })} />
          </Abschnitt>

          <Abschnitt titel="Prüfregeln" text="Was als fehlend gilt. Abgeschaltete Regeln zählen nicht für die Ampel und nicht für {{FehlendeAngaben}}.">
            <div className="grid gap-3" data-pruefregeln>
              {FELDER.map((f) => (
                <Schalter key={f} id={`r-${f}`} titel={FELD[f]} text={FELD_ERKLAERUNG[f]} an={e.regeln?.[f] !== false}
                  setze={(v) => setE({ ...e, regeln: { ...e.regeln, [f]: v } })} />
              ))}
            </div>
          </Abschnitt>

          <Abschnitt titel="Leistungen" text="Aufgabenbereiche kommen aus den Stammdaten, Aufträge aus DATEV Eigenorganisation comfort.">
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm" data-auftragswesen={String(status.auftragswesen)}>
              {status.auftragswesen ? <><CircleCheckIcon className="size-4 text-ok" /><span>Auftragswesen verbunden, Aufträge der letzten drei Jahre werden gelesen.</span></>
                : status.auftragswesen === false ? <><OctagonXIcon className="size-4 shrink-0 text-muted-foreground" /><span className="text-muted-foreground">Auftragswesen nicht verfügbar (kein EO comfort oder keine Berechtigung). Aufgabenbereiche funktionieren trotzdem.</span></>
                : <span className="text-muted-foreground">Noch nicht gescannt.</span>}
            </div>
            {status.hinweise.length > 0 && <ul className="list-disc ps-5 text-xs text-muted-foreground">{status.hinweise.map((h) => <li key={h}>{h}</li>)}</ul>}
          </Abschnitt>

          <Abschnitt titel="Versand" text="Standard: Die App sendet nie selbst, sie legt nur Vorlagen an. Nur wenn Sie unten „Direkt senden über SMTP“ wählen, geht die Mail von der App aus an den Mail-Server.">
            <div className="grid gap-1.5">
              <Label htmlFor="e-versand">Ausgabe</Label>
              <Select value={e.versand} onValueChange={(v) => setE({ ...e, versand: v as E["versand"] })}>
                <SelectTrigger id="e-versand" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eml">.eml-Vorlagen im Datenordner – rein lokal, Doppelklick öffnet sie in Outlook (Empfehlung)</SelectItem>
                  <SelectItem value="outlook">Outlook-Entwürfe im Postfach – werden sofort mit Exchange/Microsoft 365 abgeglichen</SelectItem>
                  <SelectItem value="smtp">Direkt senden über SMTP – ohne Outlook, nach der Kontrolle in einem Schritt (verlässt den PC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {e.versand === "smtp" && (
              <div className="grid gap-4 rounded-lg border p-4" data-smtp>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="e-sh">SMTP-Server</Label><Input id="e-sh" className="kennung" value={e.smtpHost} onChange={(x) => setE({ ...e, smtpHost: x.target.value })} /></div>
                  <div className="grid gap-1.5"><Label htmlFor="e-sp">Port</Label><Input id="e-sp" className="kennung" value={e.smtpPort} onChange={(x) => setE({ ...e, smtpPort: x.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="e-sa">Absenderadresse</Label><Input id="e-sa" type="email" value={e.smtpAbsender} onChange={(x) => setE({ ...e, smtpAbsender: x.target.value })} /></div>
                  <div className="grid gap-1.5"><Label htmlFor="e-sn">Absendername (optional)</Label><Input id="e-sn" value={e.smtpName} onChange={(x) => setE({ ...e, smtpName: x.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="e-sb">Benutzername</Label><Input id="e-sb" placeholder="leer = Absenderadresse" value={e.smtpBenutzer} onChange={(x) => setE({ ...e, smtpBenutzer: x.target.value })} /></div>
                  <div className="grid gap-1.5"><Label htmlFor="e-spw">Passwort</Label>
                    <Input id="e-spw" type="password" autoComplete="off" value={pw} placeholder={status.smtpPasswort ? "gespeichert (leer lassen = behalten)" : ""} onChange={(x) => setPw(x.target.value)} /></div>
                </div>
                <div className="grid gap-1.5"><Label htmlFor="e-sc">Kopie an (Blindkopie, optional)</Label><Input id="e-sc" type="email" placeholder="z. B. die eigene Adresse, als Beleg im Postfach" value={e.smtpBcc} onChange={(x) => setE({ ...e, smtpBcc: x.target.value })} /></div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" disabled={geaendert || laeuft} onClick={testen} data-knopf="smtp-test">Testmail an Absender</Button>
                  <p className="text-xs text-muted-foreground">Erst speichern, dann testen. Das Passwort wird verschlüsselt im Windows-Konto abgelegt. Empfänger stehen immer in BCC.</p>
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="e-eml">Speicherort der .eml-Dateien</Label>
              <div className="flex gap-2">
                <Input id="e-eml" className="kennung" readOnly value={e.emlOrdner || status.ausgang} />
                <Button variant="outline" data-knopf="eml-ordner" onClick={async () => { const p = await kh().waehleOrdner(); if (p) setE({ ...e, emlOrdner: p }); }}><FolderOpenIcon />Wählen</Button>
                {e.emlOrdner && <Button variant="ghost" onClick={() => setE({ ...e, emlOrdner: "" })}>Standard</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Gilt für die Ausgabe als .eml-Datei und für die Demodaten. Ohne Auswahl: Unterordner „ausgang“ im Datenordner.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="e-sig">Signatur für <span className="kennung">{"{{Signatur}}"}</span></Label>
              <Textarea id="e-sig" rows={4} value={e.signatur} onChange={(x) => setE({ ...e, signatur: x.target.value })} />
            </div>
          </Abschnitt>

          <Abschnitt titel="Darstellung">
            <div className="grid gap-1.5">
              <Label htmlFor="e-design">Farben</Label>
              <Select value={e.design} onValueChange={(v) => setE({ ...e, design: v as E["design"] })}>
                <SelectTrigger id="e-design" className="w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">Wie Windows</SelectItem>
                  <SelectItem value="hell">Hell</SelectItem>
                  <SelectItem value="dunkel">Dunkel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Vorlagen, Protokoll und Einstellungen liegen in <span className="kennung break-all">{status.daten}</span></p>
          </Abschnitt>
        </div>
      </div>
    </div>
  );
}

function Abschnitt({ titel, text, children }: { titel: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[12rem_minmax(0,1fr)] gap-x-10 gap-y-4">
      <div>
        <h2 className="text-lg font-semibold">{titel}</h2>
        {text && <p className="mt-1.5 text-xs text-muted-foreground">{text}</p>}
      </div>
      <div className="grid gap-6">{children}</div>
    </section>
  );
}

function Schalter({ id, titel, text, an, setze }: { id: string; titel: string; text: string; an: boolean; setze: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div><Label htmlFor={id}>{titel}</Label><p className="mt-0.5 text-xs text-muted-foreground">{text}</p></div>
      <Switch id={id} checked={an} onCheckedChange={setze} />
    </div>
  );
}
