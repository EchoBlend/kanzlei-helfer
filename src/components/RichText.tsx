// Formatierter Mailtext wie in Outlook: Farben, Markieren, Schriftgröße, Listen, Ausrichtung, Links, Bilder.
// Alles läuft lokal (TipTap ist in die App gebündelt). Bilder werden als data:-URL eingebettet und beim
// Erstellen der Mail zu eingebetteten Bildern (cid) – es wird nie etwas nachgeladen.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenterIcon, AlignLeftIcon, AlignRightIcon, BaselineIcon, BoldIcon, HighlighterIcon, ImagePlusIcon, ItalicIcon, LinkIcon,
  ListIcon, ListOrderedIcon, Redo2Icon, RemoveFormattingIcon, StrikethroughIcon, UnderlineIcon, Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fehlertext, kh } from "@/lib/kh";
import { cn } from "@/lib/utils";

const MAX_BILD = 5 * 1024 * 1024;
/** Standardfarben wie in Outlook. */
const FARBEN = [
  ["Schwarz", "#000000"], ["Dunkelgrau", "#595959"], ["Grau", "#A6A6A6"], ["Weiß", "#FFFFFF"],
  ["Dunkelrot", "#C00000"], ["Rot", "#FF0000"], ["Orange", "#ED7D31"], ["Gold", "#FFC000"],
  ["Gelb", "#FFFF00"], ["Hellgrün", "#92D050"], ["Grün", "#00B050"], ["Petrol", "#0E7C86"],
  ["Hellblau", "#00B0F0"], ["Blau", "#0070C0"], ["Dunkelblau", "#002060"], ["Lila", "#7030A0"],
] as const;
const MARKER = [
  ["Gelb", "#FFFF00"], ["Hellgrün", "#00FF00"], ["Türkis", "#00FFFF"], ["Rosa", "#FF00FF"],
  ["Hellblau", "#BDD7EE"], ["Orange", "#FFC000"], ["Hellgrau", "#D9D9D9"], ["Rot", "#FF7C80"],
] as const;
const GROESSEN = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "36"];

export const erweiterungen = () => [
  StarterKit.configure({
    heading: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: null, target: null } },
  }),
  TextStyle, Color, FontSize, Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["paragraph"] }),
  Image.configure({ inline: true, allowBase64: true, resize: { enabled: true, directions: ["top-left", "top-right", "bottom-left", "bottom-right"], minWidth: 24, minHeight: 24, alwaysPreserveAspectRatio: true } }),
];

const alsDataUrl = (f: File) => new Promise<string>((ok, nein) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => nein(r.error);
  r.readAsDataURL(f);
});
/** Bilddateien aus Einfügen/Ziehen einbetten; andere Dateien ignorieren. */
async function bilderEinfuegen(editor: Editor, dateien: File[], pos?: number) {
  for (const f of dateien.filter((d) => /^image\/(png|jpeg|gif|webp|bmp)$/.test(d.type))) {
    if (f.size > MAX_BILD) { toast.error(`Bild zu groß (max. 5 MB): ${f.name}`); continue; }
    const src = await alsDataUrl(f);
    const kette = editor.chain().focus();
    (pos === undefined ? kette : kette.setTextSelection(pos)).setImage({ src, alt: f.name }).run();
  }
}

/** Text als Inhalt ohne HTML-Deutung: Zeilen → harte Umbrüche. */
const alsInhalt = (text: string) => text.split("\n").flatMap((z, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(z ? [{ type: "text", text: z }] : [])]);

export interface RichTextGriff { einfuegen(text: string): void; fokus(): void }
interface Props {
  html: string; aendern: (html: string, text: string) => void;
  id?: string; label?: string; hoehe?: string; onFokus?: () => void; className?: string;
}

/** Editor mit Werkzeugleiste. `html` von außen (z. B. Vorlage gewählt) ersetzt den Inhalt. */
export const RichText = forwardRef<RichTextGriff, Props>(function RichText({ html, aendern, id, label, hoehe = "18rem", onFokus, className }, ref) {
  const zuletzt = useRef(html);
  const aendernRef = useRef(aendern);
  aendernRef.current = aendern;
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor({
    extensions: erweiterungen(),
    content: html,
    editorProps: {
      attributes: { ...(id ? { id } : {}), ...(label ? { "aria-label": label } : {}), class: "mailtext min-h-full px-4 py-3 outline-none", spellcheck: "false" },
      handlePaste: (_v, e) => {
        const bilder = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!bilder.length || !editorRef.current) return false;
        void bilderEinfuegen(editorRef.current, bilder);
        return true;
      },
      handleDrop: (v, e) => {
        const dateien = [...(e.dataTransfer?.files ?? [])];
        if (!dateien.length || !editorRef.current) return false;
        e.preventDefault();
        const pos = v.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        void bilderEinfuegen(editorRef.current, dateien, pos);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const h = ed.getHTML();
      zuletzt.current = h;
      aendernRef.current(h, ed.getText({ blockSeparator: "\n" }));
    },
    onFocus: () => onFokus?.(),
  });
  editorRef.current = editor;

  useEffect(() => {
    if (editor && html !== zuletzt.current) { zuletzt.current = html; editor.commands.setContent(html, { emitUpdate: false }); }
  }, [editor, html]);

  useImperativeHandle(ref, () => ({
    einfuegen: (text) => { editor?.chain().focus().insertContent(alsInhalt(text)).run(); },
    fokus: () => { editor?.commands.focus(); },
  }), [editor]);

  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-md border bg-background", className)}>
      {editor && <Leiste editor={editor} />}
      <div className="mailpapier min-h-0 flex-1 cursor-text resize-y overflow-auto" style={{ height: hoehe, minHeight: "8rem" }} data-editor
        onClick={(e) => { if (e.target === e.currentTarget) editor?.commands.focus("end"); }}>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
});

/** Nur anzeigen (Vorschau), mit denselben Regeln wie der Editor – unbekanntes HTML fällt weg. */
export function RichAnsicht({ html, className }: { html: string; className?: string }) {
  const editor = useEditor({ extensions: erweiterungen(), content: html, editable: false, editorProps: { attributes: { class: "mailtext outline-none" } } });
  useEffect(() => { if (editor && editor.getHTML() !== html) editor.commands.setContent(html, { emitUpdate: false }); }, [editor, html]);
  return <div className={cn("mailpapier", className)} data-vorschau-text><EditorContent editor={editor} /></div>;
}

function Leiste({ editor }: { editor: Editor }) {
  const z = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      fett: e.isActive("bold"), kursiv: e.isActive("italic"), unter: e.isActive("underline"), durch: e.isActive("strike"),
      liste: e.isActive("bulletList"), nummern: e.isActive("orderedList"), link: e.isActive("link"),
      links: e.isActive({ textAlign: "left" }), mitte: e.isActive({ textAlign: "center" }), rechts: e.isActive({ textAlign: "right" }),
      farbe: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      groesse: ((e.getAttributes("textStyle").fontSize as string | undefined) ?? "").replace(/pt$/, ""),
      zurueck: e.can().undo(), vor: e.can().redo(),
    }),
  });
  const k = () => editor.chain().focus();
  const bild = async () => {
    try { const src = await kh().waehleBild(); if (src) k().setImage({ src }).run(); }
    catch (f) { toast.error("Bild nicht eingefügt", { description: fehlertext(f) }); }
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-surface px-1.5 py-1" role="toolbar" aria-label="Formatierung" data-leiste>
      <Knopf titel="Rückgängig (Strg+Z)" an={false} aus={!z.zurueck} klick={() => k().undo().run()}><Undo2Icon /></Knopf>
      <Knopf titel="Wiederholen (Strg+Y)" an={false} aus={!z.vor} klick={() => k().redo().run()}><Redo2Icon /></Knopf>
      <Trenner />
      <Select value={z.groesse || "11"} onValueChange={(g) => (g === "11" ? k().unsetFontSize().run() : k().setFontSize(`${g}pt`).run())}>
        <SelectTrigger size="sm" className="h-7 w-[4.5rem] text-xs" aria-label="Schriftgröße" data-feld="schriftgroesse" onMouseDown={(e) => e.preventDefault()}><SelectValue /></SelectTrigger>
        <SelectContent>{GROESSEN.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
      </Select>
      <Knopf titel="Fett (Strg+B)" an={z.fett} klick={() => k().toggleBold().run()}><BoldIcon /></Knopf>
      <Knopf titel="Kursiv (Strg+I)" an={z.kursiv} klick={() => k().toggleItalic().run()}><ItalicIcon /></Knopf>
      <Knopf titel="Unterstrichen (Strg+U)" an={z.unter} klick={() => k().toggleUnderline().run()}><UnderlineIcon /></Knopf>
      <Knopf titel="Durchgestrichen" an={z.durch} klick={() => k().toggleStrike().run()}><StrikethroughIcon /></Knopf>
      <Palette titel="Schriftfarbe" knopf="schriftfarbe" farben={FARBEN} aktuell={z.farbe}
        setzen={(c) => (c ? k().setColor(c).run() : k().unsetColor().run())} icon={<BaselineIcon />} strich={z.farbe ?? "#000000"} eigene />
      <Palette titel="Markieren" knopf="markieren" farben={MARKER} aktuell={null}
        setzen={(c) => (c ? k().setHighlight({ color: c }).run() : k().unsetHighlight().run())} icon={<HighlighterIcon />} strich="#FFFF00" />
      <Trenner />
      <Knopf titel="Aufzählung" an={z.liste} klick={() => k().toggleBulletList().run()}><ListIcon /></Knopf>
      <Knopf titel="Nummerierung" an={z.nummern} klick={() => k().toggleOrderedList().run()}><ListOrderedIcon /></Knopf>
      <Knopf titel="Linksbündig" an={z.links} klick={() => k().setTextAlign("left").run()}><AlignLeftIcon /></Knopf>
      <Knopf titel="Zentriert" an={z.mitte} klick={() => k().setTextAlign("center").run()}><AlignCenterIcon /></Knopf>
      <Knopf titel="Rechtsbündig" an={z.rechts} klick={() => k().setTextAlign("right").run()}><AlignRightIcon /></Knopf>
      <Trenner />
      <LinkKnopf editor={editor} an={z.link} />
      <Knopf titel="Bild einfügen (auch per Einfügen oder Hineinziehen)" an={false} klick={bild} knopf="bild"><ImagePlusIcon /></Knopf>
      <Knopf titel="Formatierung entfernen" an={false} klick={() => k().unsetAllMarks().setTextAlign("left").run()}><RemoveFormattingIcon /></Knopf>
    </div>
  );
}

const Trenner = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />;

function Knopf({ titel, an, aus, klick, knopf, children }: { titel: string; an: boolean; aus?: boolean; klick: () => void; knopf?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={titel} aria-pressed={an} disabled={aus} data-knopf={knopf}
          className={cn("size-7", an && "bg-brand-soft text-brand hover:bg-brand-soft")} onMouseDown={(e) => e.preventDefault()} onClick={klick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{titel}</TooltipContent>
    </Tooltip>
  );
}

function Palette({ titel, knopf, farben, aktuell, setzen, icon, strich, eigene }: {
  titel: string; knopf: string; farben: readonly (readonly [string, string])[]; aktuell: string | null; setzen: (c: string | null) => void;
  icon: React.ReactNode; strich: string; eigene?: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const waehle = (c: string | null) => { setzen(c); setOffen(false); };
  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="relative size-7" aria-label={titel} title={titel} data-knopf={knopf} onMouseDown={(e) => e.preventDefault()}>
          {icon}<span className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full" style={{ background: strich }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{titel}</div>
        <div className="grid grid-cols-8 gap-1">
          {farben.map(([name, c]) => (
            <button key={c} type="button" title={name} aria-label={name} data-farbe={c} onClick={() => waehle(c)}
              className={cn("size-6 rounded-[4px] border border-line", aktuell?.toUpperCase() === c && "ring-2 ring-brand ring-offset-1")} style={{ background: c }} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => waehle(null)}>{eigene ? "Automatisch" : "Keine Markierung"}</Button>
          {eigene && (
            <label className="ms-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              Weitere Farben
              <input type="color" className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" defaultValue={aktuell ?? "#000000"} onChange={(e) => setzen(e.target.value)} />
            </label>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LinkKnopf({ editor, an }: { editor: Editor; an: boolean }) {
  const [offen, setOffen] = useState(false);
  const [url, setUrl] = useState("");
  const setzen = () => {
    const u = url.trim();
    const k = editor.chain().focus().extendMarkRange("link");
    if (!u) k.unsetLink().run();
    else if (editor.state.selection.empty && !an) editor.chain().focus().insertContent({ type: "text", text: u, marks: [{ type: "link", attrs: { href: u } }] }).run();
    else k.setLink({ href: u }).run();
    setOffen(false);
  };
  return (
    <Popover open={offen} onOpenChange={(o) => { if (o) setUrl((editor.getAttributes("link").href as string | undefined) ?? ""); setOffen(o); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Link" title="Link" aria-pressed={an} data-knopf="link"
          className={cn("size-7", an && "bg-brand-soft text-brand")} onMouseDown={(e) => e.preventDefault()}><LinkIcon /></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); setzen(); }}>
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… oder mailto:…" className="h-8 text-sm" aria-label="Linkadresse" />
          <Button type="submit" size="sm">OK</Button>
        </form>
        {an && <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setOffen(false); }}>Link entfernen</Button>}
      </PopoverContent>
    </Popover>
  );
}
