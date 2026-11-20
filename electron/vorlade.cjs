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
  waehleDateien: rufe("dateien:waehlen"),
  dateiInfo: rufe("dateien:info"),
  mails: rufe("mails"),
  speichereSmtpPasswort: rufe("smtp:passwort"),
  smtpTest: rufe("smtp:test"),
  exportiere: rufe("export"),
  oeffneOrdner: rufe("ordner"),
  /** Fortschritt eines Scans: (fertig, gesamt). Gibt eine Abmeldefunktion zurück. */
  aufScan: (f) => {
    const h = (_e, p) => f(p.fertig, p.gesamt);
    ipcRenderer.on("scan", h);
    return () => ipcRenderer.removeListener("scan", h);
  },
  // Drag & Drop: echter Dateipfad zu einem File-Objekt aus dem Fenster
  pfadVon: (datei) => webUtils.getPathForFile(datei),
});
