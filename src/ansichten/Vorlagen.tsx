import { useEffect, useRef, useState } from "react";
import { CopyIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichText, type RichTextGriff } from "@/components/RichText";
import { Teiler, useGroesse } from "@/components/Teiler";
import { Kopf } from "@/App";
import { Platzhalter } from "@/ansichten/Serienmail";
import { htmlVon, type Vorlage } from "@/lib/kh";
import { cn } from "@/lib/utils";

export function Vorlagen({ vorlagen, speichern }: { vorlagen: Vorlage[]; speichern: (v: Vorlage[]) => Promise<boolean> }) {
  const [id, setId] = useState<string | null>(vorlagen[0]?.id ?? null);
  const leer = { id: "", name: "", betreff: "", text: "", html: "" };
  const [form, setForm] = useState<Vorlage & { html: string }>(leer);
  const textRef = useRef<RichTextGriff>(null);
  const liste = useGroesse("vorlagen.liste", 288, 200, () => 560);
  const aktuell = vorlagen.find((v) => v.id === id) ?? null;
  const neu = id === null;
  const geaendert = neu ? !!(form.name || form.betreff || form.text.trim())
    : !!aktuell && (aktuell.name !== form.name || aktuell.betreff !== form.betreff || htmlVon(aktuell) !== form.html);

  useEffect(() => { if (aktuell) setForm({ ...aktuell, html: htmlVon(aktuell) }); }, [aktuell]);

  const sichern = async () => {
    if (!form.name.trim()) { toast.error("Bitte einen Namen eingeben"); return; }
    const eintrag = { ...form, name: form.name.trim(), id: neu ? `v${Date.now()}` : form.id };
    const liste = neu ? [...vorlagen, eintrag] : vorlagen.map((v) => (v.id === eintrag.id ? eintrag : v));
    if (await speichern(liste)) { setId(eintrag.id); toast.success("Vorlage gespeichert"); }
  };
  const loeschen = async () => {
    if (!aktuell) return;
    const liste = vorlagen.filter((v) => v.id !== aktuell.id);
    if (await speichern(liste)) { setId(liste[0]?.id ?? null); toast.success(`„${aktuell.name}“ gelöscht`); }
  };
  const neueVorlage = (vorgabe?: Vorlage & { html: string }) => { setId(null); setForm(vorgabe ?? leer); };
  const einfuegen = (p: string) => textRef.current?.einfuegen(`{{${p}}}`);

  return (
    <div className="flex h-svh flex-col">
      <Kopf titel="Vorlagen" unter={`${vorlagen.length} Vorlagen · Platzhalter werden je Mandant ersetzt`}>
        <Button variant="outline" onClick={() => neueVorlage()} data-knopf="neue-vorlage"><PlusIcon />Neue Vorlage</Button>
      </Kopf>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${liste.wert}px auto minmax(0,1fr)` }}>
        <nav className="min-h-0 overflow-auto bg-surface p-3" aria-label="Vorlagen">
          <ul className="space-y-0.5">
            {vorlagen.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setId(v.id)} data-vorlage={v.name}
                  className={cn("w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2", v.id === id && "bg-background font-medium ring-1 ring-line")}>
                  <div className="truncate">{v.name}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">{v.betreff || "ohne Betreff"}</div>
                </button>
              </li>
            ))}
            {neu && <li><div className="rounded-md bg-background px-3 py-2 text-sm font-medium ring-1 ring-line">{form.name || "Neue Vorlage"}</div></li>}
          </ul>
        </nav>
        <Teiler richtung="x" groesse={liste} label="Breite der Vorlagenliste" />
        <section className="min-h-0 overflow-auto px-8 py-6">
          <div className="grid max-w-4xl gap-5">
            <div className="grid gap-1.5"><Label htmlFor="v-name">Name der Vorlage</Label>
              <Input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Vollmacht anfordern" /></div>
            <div className="grid gap-1.5"><Label htmlFor="v-betreff">Betreff</Label>
              <Input id="v-betreff" value={form.betreff} onChange={(e) => setForm({ ...form, betreff: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="v-text">Text</Label>
              <RichText id="v-text" label="Text der Vorlage" ref={textRef} html={form.html} hoehe="26rem"
                aendern={(html, text) => setForm((f) => ({ ...f, html, text }))} />
              <Platzhalter einfuegen={einfuegen} />
              <p className="text-xs text-muted-foreground">{"{{FehlendeAngaben}}"} listet die Lücken aus der Stammdaten-Prüfung. Mandanten ohne Lücken bekommen eine solche Vorlage nicht.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={sichern} disabled={!geaendert} data-knopf="vorlage-speichern">Speichern</Button>
              {!neu && <Button variant="outline" onClick={() => neueVorlage({ ...form, id: "", name: `${form.name} (Kopie)` })}><CopyIcon />Duplizieren</Button>}
              {geaendert && <span className="text-xs text-muted-foreground">Nicht gespeichert</span>}
              {!neu && (
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" className="ms-auto text-err hover:text-err" data-knopf="vorlage-loeschen"><Trash2Icon />Löschen</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>„{aktuell?.name}“ löschen?</AlertDialogTitle>
                      <AlertDialogDescription>Die Vorlage ist danach weg. Bereits erstellte Mails bleiben unberührt.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={loeschen}>Löschen</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
