import { useMemo, useState } from "react";
import { FolderOpenIcon, ListFilterIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Kopf } from "@/App";
import { kh, type Protokollzeile, type Status } from "@/lib/kh";

const ART: Record<string, string> = { entwurf: "Entwurf", eml: ".eml-Datei" };
const SPALTEN: [string, number | undefined][] = [["Zeit", 150], ["Art", 100], ["Vorlage", 190], ["Nr.", 76], ["Mandant", 200], ["An", 210], ["Betreff", undefined], ["Anhänge", 170], ["Ergebnis", 96]];

export function Protokoll({ zeilen, neuLaden, status }: { zeilen: Protokollzeile[]; neuLaden: () => void; status: Status | null }) {
  const [suche, setSuche] = useState("");
  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return [...zeilen].reverse().filter((z) => !q || Object.values(z).join(" ").toLowerCase().includes(q));
  }, [zeilen, suche]);

  return (
    <div className="flex h-svh flex-col">
      <Kopf titel="Protokoll" unter={`${zeilen.length} Einträge · gespeichert als protokoll.csv im Datenordner, öffnet in Excel`}>
        <Button variant="outline" onClick={neuLaden}><RefreshCwIcon />Neu laden</Button>
        {status?.einstellungen.versand === "eml" || status?.einstellungen.demo
          ? <Button variant="outline" onClick={() => kh().oeffneOrdner("ausgang")}><FolderOpenIcon />.eml-Ordner</Button> : null}
        <Button variant="outline" onClick={() => kh().oeffneOrdner("daten")}><FolderOpenIcon />Datenordner</Button>
      </Kopf>
      <div className="px-8 pt-5 pb-3">
        <div className="relative w-72">
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Mandant, Betreff, Vorlage" aria-label="Protokoll durchsuchen" className="ps-9" />
          <ListFilterIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground/80" />
        </div>
      </div>
      <div className="mx-8 mb-6 min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow className="hover:bg-transparent">
              {SPALTEN.map(([t, w]) => <TableHead key={t} style={{ width: w }} className="h-10 text-xs font-semibold text-muted-foreground">{t}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {liste.length ? liste.map((z, i) => (
              <TableRow key={i} data-protokoll={z.Mandantennr}>
                <TableCell className="zahl text-xs">{z.Zeit}</TableCell>
                <TableCell>{ART[z.Modus] ?? z.Modus}</TableCell>
                <TableCell className="truncate">{z.Vorlage}</TableCell>
                <TableCell className="kennung text-muted-foreground">{z.Mandantennr}</TableCell>
                <TableCell className="truncate">{z.Mandant}</TableCell>
                <TableCell className="truncate">{z.An}</TableCell>
                <TableCell className="truncate" title={z.Betreff}>{z.Betreff}</TableCell>
                <TableCell className="truncate text-xs text-muted-foreground" title={z.Anhaenge}>{z.Anhaenge || "–"}</TableCell>
                <TableCell>{z.Ergebnis === "ok"
                  ? <span className="font-medium text-ok">erstellt</span>
                  : <span className="font-medium text-err" title={z.Ergebnis}>Fehler</span>}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={SPALTEN.length} className="h-40 text-center text-muted-foreground">{zeilen.length ? "Nichts gefunden." : "Noch keine Mails erstellt."}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
