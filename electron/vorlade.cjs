// Schmale Brücke: Die Oberfläche bekommt genau diese Aufrufe, keine Node-Rechte.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const rufe = (kanal) => (...a) => ipcRenderer.invoke(kanal, ...a);

contextBridge.exposeInMainWorld("kh", {
  status: rufe("status"),
  mandanten: rufe("mandanten"),
  speichereEinstellungen: rufe("einstellungen:speichern"),
  vorlagen: rufe("vorlagen"),
  speichereVorlagen: rufe("vorlagen:speichern"),
  gruppen: rufe("gruppen"),
  speichereGruppen: rufe("gruppen:speichern"),
  ansicht: rufe("ansicht"),
  speichereAnsicht: rufe("ansicht:speichern"),
  protokoll: rufe("protokoll"),
  standardAdressen: rufe("standardAdressen"),
  setzeStandardAdressen: rufe("standardAdressen:setzen"),
  waehleDateien: rufe("dateien:waehlen"),
  waehleBild: rufe("bild:waehlen"),
  // Pfade nur aus echten Datei-Objekten (Drag & Drop); beliebige Pfad-Texte nimmt die Brücke nicht an.
  dateiInfoVon: (dateien) => ipcRenderer.invoke("dateien:info", [...dateien].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  mails: rufe("mails"),
  exportiere: rufe("export"),
  oeffneOrdner: rufe("ordner"),
  /** Fortschritt eines Scans: (fertig, gesamt). Gibt eine Abmeldefunktion zurück. */
  aufScan: (f) => {
    const h = (_e, p) => f(p.fertig, p.gesamt);
    ipcRenderer.on("scan", h);
    return () => ipcRenderer.removeListener("scan", h);
  },
});
