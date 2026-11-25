// Ziehgriff für verstellbare Bereiche (Breite oder Höhe). Die Größe merkt sich die App pro Bereich
// (localStorage im Datenordner – nur Pixelwerte, keine Mandantendaten). Doppelklick: Standard; Pfeiltasten: 16er-Schritte.
import { useState } from "react";
import { cn } from "@/lib/utils";

const lies = (schluessel: string) => { try { return Number(localStorage.getItem(`kh.groesse.${schluessel}`)) || null; } catch { return null; } };
const merke = (schluessel: string, v: number | null) => {
  try { if (v === null) localStorage.removeItem(`kh.groesse.${schluessel}`); else localStorage.setItem(`kh.groesse.${schluessel}`, String(v)); } catch { /* ohne Speicher: nur für diese Sitzung */ }
};

/** Größe eines Bereichs in Pixeln, begrenzt auf [min, max()], gemerkt unter `schluessel`. */
export function useGroesse(schluessel: string, standard: number, min: number, max: () => number) {
  const [wert, setWert] = useState(() => lies(schluessel) ?? standard);
  const grenze = (v: number) => Math.round(Math.min(Math.max(min, max()), Math.max(min, v)));
  return {
    wert: grenze(wert), standard, min, max,
    setze: (v: number | null) => { const x = v === null ? standard : grenze(v); setWert(x); merke(schluessel, v === null ? null : x); },
  };
}

/**
 * richtung "x": senkrechter Balken, ändert eine Breite; "y": waagrechter Balken, ändert eine Höhe.
 * umgekehrt: Ziehen nach links/oben vergrößert (Bereich liegt rechts/unter dem Griff).
 */
export function Teiler({ richtung, groesse, umgekehrt, label, className }: {
  richtung: "x" | "y"; groesse: ReturnType<typeof useGroesse>; umgekehrt?: boolean; label: string; className?: string;
}) {
  const [aktiv, setAktiv] = useState(false);
  const x = richtung === "x";
  const ziehe = (e: React.MouseEvent) => {
    e.preventDefault();
    const start = x ? e.clientX : e.clientY, alt = groesse.wert;
    const bewege = (ev: MouseEvent) => {
      const d = (x ? ev.clientX : ev.clientY) - start;
      groesse.setze(alt + (umgekehrt ? -d : d));
    };
    const los = () => {
      window.removeEventListener("mousemove", bewege); window.removeEventListener("mouseup", los);
      document.body.style.removeProperty("cursor"); document.body.style.removeProperty("user-select");
      setAktiv(false);
    };
    document.body.style.cursor = x ? "col-resize" : "row-resize"; document.body.style.userSelect = "none";
    setAktiv(true);
    window.addEventListener("mousemove", bewege); window.addEventListener("mouseup", los);
  };
  const taste = (e: React.KeyboardEvent) => {
    const minus = x ? "ArrowLeft" : "ArrowUp", plus = x ? "ArrowRight" : "ArrowDown";
    if (e.key !== minus && e.key !== plus) return;
    e.preventDefault();
    const d = (e.key === plus ? 16 : -16) * (umgekehrt ? -1 : 1);
    groesse.setze(groesse.wert + d);
  };
  return (
    <div role="separator" aria-orientation={x ? "vertical" : "horizontal"} aria-label={label} title={`${label} (Doppelklick: Standard)`} tabIndex={0}
      aria-valuenow={groesse.wert} aria-valuemin={groesse.min} data-teiler={label}
      onMouseDown={ziehe} onDoubleClick={() => groesse.setze(null)} onKeyDown={taste}
      className={cn("group/teiler flex shrink-0 items-center justify-center outline-none",
        x ? "w-2 cursor-col-resize self-stretch" : "h-2.5 w-full cursor-row-resize", className)}>
      <span className={cn("rounded-full bg-line transition-colors group-hover/teiler:bg-brand group-focus-visible/teiler:bg-brand",
        x ? "h-full w-px" : "h-1 w-10", aktiv && "bg-brand")} />
    </div>
  );
}
