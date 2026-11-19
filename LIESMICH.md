# Kanzlei-Helfer 1.3

Desktop-App: prüft Mandanten-Stammdaten aus DATEV, zeigt Leistungen und Zuständigkeiten, gruppiert Mandanten und schreibt sie per Vorlage an (Serienmail mit Anhängen, als Vorlagen für Outlook – die App sendet nie selbst).

## Installieren (Kanzlei-PC)
- `Kanzlei-Helfer-Setup-1.3.1.exe` (GitHub-Release) auf den PC kopieren und doppelklicken. Ein Klick, keine Fragen, **keine Adminrechte** (der Installer kann gar keine anfordern): landet in `%LOCALAPPDATA%\Programs\Kanzlei-Helfer`, Verknüpfung auf Desktop und im Startmenü, startet danach. Eine ältere Fassung wird ersetzt, Vorlagen, Gruppen und Protokoll bleiben.
- Windows warnt beim ersten Mal („Der Computer wurde durch Windows geschützt“), weil das Programm nicht gekauft signiert ist: **Weitere Informationen → Trotzdem ausführen**. Sperrt die IT unsignierte Programme, braucht es ihre Freigabe.
- Erster Start: **Einstellungen** → DATEVconnect-Adresse prüfen (Standard `http://LIZENZSERVER:58454/datev/api/master-data/v1`) → Speichern. Keine Anmeldung, kein Konto.
- Ist schon eine ältere Fassung (1.2/1.3.0) installiert: vorher über Windows-Einstellungen → Apps deinstallieren.
- Zu Hause ausprobieren: Einstellungen → **Demodaten verwenden** (27 erfundene Mandanten).

## Deinstallieren
- Windows-Einstellungen → **Apps** → Kanzlei-Helfer → Deinstallieren (ohne Adminrechte). Entfernt Programm, Verknüpfungen, Registry-Einträge (nur HKCU), den Datenordner `%APPDATA%\Kanzlei-Helfer` mit Vorlagen, Gruppen, Protokoll und `.eml`-Ausgang sowie die Installer-Kopie, die electron-builder sonst in `%LOCALAPPDATA%\kanzlei-helfer-updater` liegen lässt. Selbst gespeicherte Excel-Exporte und Outlook-Entwürfe bleiben, wo sie sind.

## Datenschutz und Sicherheit
- **Nichts geht ins Internet.** Einziger Netzweg: die eingestellte DATEVconnect-Adresse (`http://SERVER:PORT/datev/api/master-data/v1`), immer direkt (kein Proxy, keine Proxy-Suche). Vor jeder Verbindung prüft die App, dass der Server im eigenen Netz liegt (192.168.x, 10.x, 172.16–31.x, localhost); sonst baut sie keine Verbindung auf. Kein https (Zertifikatsprüfung könnte externe Stellen fragen). Die Oberfläche darf nur die App selbst laden, Node-Zugriff hat sie nicht. Rechtschreibprüfung ist aus (Chromium lädt dafür sonst ein Wörterbuch von Google), kein Update-Check, keine Absturzberichte, keine Telemetrie. Geprüft per Chromium-NetLog: `npm run pruefe:netz` (läuft vor jedem Release auf Windows, Release bricht sonst ab).
- **Keine Anmeldung, keine Konten**: Die App schickt weder Windows-Anmeldung noch Cookies, an niemanden. Verlangt ein Server eine Anmeldung, meldet die App das und bleibt draußen.
- **DATEV wird nur gelesen** (ausschließlich GET, keine Weiterleitungen, 30 s Zeitlimit, höchstens vier Mandanten gleichzeitig). Eigene Gruppen leben nur in der App.
- **Mails nur als Vorlagen**, die App sendet nie selbst. Standard: `.eml`-Dateien im Ausgang – rein lokal, Doppelklick öffnet sie in Outlook als neue Mail. Wahlweise Outlook-Entwürfe (`Save()`, nie `Send()`) – die liegen dann im Postfach und werden sofort mit Exchange/Microsoft 365 abgeglichen. Empfänger immer in BCC; nur Adressen, die in DATEV beim Mandanten stehen; nur Anhänge, die selbst gewählt oder ins Fenster gezogen wurden.
- **Excel**: Werte, die mit `= + - @` beginnen, bekommen in Export und Protokoll ein `'` vorangestellt (keine Formeln aus DATEV-Feldern).
- **Programmdatei gehärtet** (Electron-Fuses): kein Missbrauch als Node.js, kein Debug-Zugang, lädt nur ihr eigenes, unverändertes `app.asar`. Kein `elevate.exe` im Paket.
- **Auf der Platte**: DATEV-Stammdaten nur im Arbeitsspeicher (HTTP-Cache aus). Gespeichert werden nur `protokoll.csv` (Zeit, Mandantennr., Name, Empfänger, Betreff, Anhangnamen) und die `.eml`-Entwürfe im Ausgang – beides im Datenordner, beim Deinstallieren weg.

## Was die App kann
- **Scan** („Neu scannen“ mit Fortschritt): Mandanten aus DATEVconnect mit rund 45 Feldern – Kontakt, Briefanrede, Person, Anschrift, Steuer, Bank, Gesellschaft (Rechtsform, Register, USt-IdNr.), Branche, Ansprechpartner, **Leistungen** (Aufgabenbereiche mit zuständigem Mitarbeiter), **Aufträge** (Auftragswesen, nur mit EO comfort), DATEV-Gruppen und -Kategorien.
- **Prüfung** mit Ampel: E-Mail, Telefon, Anschrift, Briefanrede, Geburtsdatum (Personen), Steuernummer, Finanzamt, Steuer-ID (mit Prüfziffer), IBAN (mit Prüfziffer), USt-IdNr./Rechtsform/Register (Gesellschaften, Register nur bei Pflicht), Zuständigkeit. Jede Regel in den Einstellungen abschaltbar.
- **Tabelle wie in DATEV:** Suche über alles, **Filterzeile pro Spalte**, Sortieren per Klick, **Gruppieren nach** Stand, Typ, Ort, Rechtsform, Finanzamt, Leistung, Zuständigem, Auftragsart, Gruppen … (Menü oder Rechtsklick auf den Spaltenkopf; Mandanten mit mehreren Leistungen stehen in jeder Gruppe), **Spaltenauswahl**, feste erste Spalten, Export für Excel. Ansicht bleibt gespeichert.
- **Eigene Gruppen** (Seitenleiste): Mandanten auswählen → „Zu Gruppe“, umbenennen, löschen, „Alle anschreiben“. Nur in der App, DATEV bleibt unverändert. DATEV-Gruppen stehen darunter zum Filtern.
- **Mehrere E-Mails und Beziehungen:** Jede Adresse mit Herkunft (Person, Inhaber, Unternehmen, Gesellschafter, Geschäftsführer, Ansprechpartner …) und DATEV-Bemerkung (z. B. „privat“). Beziehungen aus DATEV (`/relationships`) als Spalten „Beziehungen“ und „Verbund“ (gruppieren: Gesellschaft mit ihren Gesellschaftern). Von Beziehungspartnern zählt nur deren Standard-Adresse.
- **Serienmail:** Empfänger aus Auswahl oder Gruppe, Adressen per Regel (Standard-Adresse · alle eigenen · eigene + Beziehungen) oder pro Mandant angekreuzt (@-Knopf); mehrere Adressen eines Mandanten gehen in eine Mail, immer als BCC (Empfänger sehen einander nie); je Mandant eine eigene Mail. GmbH ohne eigene Mail → an die Gesellschafter. Vorlage mit Platzhaltern (`{{Anrede}} {{Name}} {{Vorname}} {{Nachname}} {{Mandantennummer}} {{FehlendeAngaben}} {{Grussformel}} {{Datum}} {{Jahr}} {{Vorjahr}} {{Signatur}}`), Vorschau je Mandant, Anhänge für alle oder pro Mandant (`10004_Bescheid.pdf`), als `.eml`-Vorlagen (Standard, rein lokal) oder Outlook-Entwürfe – die App sendet nie selbst.
- **Vorlagen**, **Protokoll** (mit „Zuletzt angeschrieben“), **Einstellungen** (DATEVconnect, Prüfregeln, Auftragswesen-Status, Versand, Signatur, Hell/Dunkel).
- Aussehen: eigene Titelleiste, Seitenleiste auf Windows-11-Material (Mica), Systemschrift Segoe UI Variable, Petrol hell/dunkel.
- Daten: `%APPDATA%\Kanzlei-Helfer` (Einstellungen, Vorlagen, Gruppen, Ansicht, `protokoll.csv`, `ausgang\`). Nicht übernommen (Datensparsamkeit): Konfession, SV- und Ausweisnummern.

## Entwickeln
- `npm install`, `npm run app` · Tests: `npm run pruefe`, `npm run pruefe:app` (Ende-zu-Ende gegen nachgebautes DATEVconnect, Windows), `npm run pruefe:netz` (Netz-Wächter) · `npm run installer`
- Demodaten neu erzeugen: `node tests/demodaten-bauen.cjs`
- Technik: Electron + React + Tailwind + shadcn/ui. Hauptprozess `electron/`, Oberfläche `src/`, Spalten in `src/lib/spalten.ts`, Farben/Schrift in `src/index.css`.

## Noch nicht in der Kanzlei getestet
- Echtes DATEVconnect auf LIZENZSERVER (ohne Anmeldung) inkl. Auftragswesen; Outlook-Entwürfe (COM).
- Nicht signiert: SmartScreen-Warnung beim ersten Start; Smart App Control oder AppLocker der IT können unsignierte Programme sperren.
