# Kanzlei-Helfer 1.2

Desktop-App: prüft Mandanten-Stammdaten aus DATEV, zeigt Leistungen und Zuständigkeiten, gruppiert Mandanten und schreibt sie per Vorlage an (Serienmail mit Anhängen, Outlook-Entwürfe).

## Installieren (Kanzlei-PC)
- `paket\Kanzlei-Helfer-Setup-1.2.0.exe` auf den PC kopieren und starten. Keine Adminrechte nötig (Installation pro Benutzer). Eine ältere Fassung wird ersetzt, Vorlagen, Gruppen und Protokoll bleiben.
- Windows warnt beim ersten Mal („Der Computer wurde durch Windows geschützt“), weil das Programm nicht gekauft signiert ist: **Weitere Informationen → Trotzdem ausführen**. Sperrt die IT unsignierte Programme, braucht es ihre Freigabe.
- Erster Start: **Einstellungen** → DATEVconnect-Adresse prüfen (Standard `http://localhost:58454/datev/api/master-data/v1`) → Speichern. Anmeldung läuft mit dem Windows-Konto.
- Zu Hause ausprobieren: Einstellungen → **Demodaten verwenden** (27 erfundene Mandanten).

## Was die App kann
- **Scan** („Neu scannen“ mit Fortschritt): Mandanten aus DATEVconnect mit rund 45 Feldern – Kontakt, Briefanrede, Person, Anschrift, Steuer, Bank, Gesellschaft (Rechtsform, Register, USt-IdNr.), Branche, Ansprechpartner, **Leistungen** (Aufgabenbereiche mit zuständigem Mitarbeiter), **Aufträge** (Auftragswesen, nur mit EO comfort), DATEV-Gruppen und -Kategorien.
- **Prüfung** mit Ampel: E-Mail, Telefon, Anschrift, Briefanrede, Geburtsdatum (Personen), Steuernummer, Finanzamt, Steuer-ID (mit Prüfziffer), IBAN (mit Prüfziffer), USt-IdNr./Rechtsform/Register (Gesellschaften, Register nur bei Pflicht), Zuständigkeit. Jede Regel in den Einstellungen abschaltbar.
- **Tabelle wie in DATEV:** Suche über alles, **Filterzeile pro Spalte**, Sortieren per Klick, **Gruppieren nach** Stand, Typ, Ort, Rechtsform, Finanzamt, Leistung, Zuständigem, Auftragsart, Gruppen … (Menü oder Rechtsklick auf den Spaltenkopf; Mandanten mit mehreren Leistungen stehen in jeder Gruppe), **Spaltenauswahl**, feste erste Spalten, Export für Excel. Ansicht bleibt gespeichert.
- **Eigene Gruppen** (Seitenleiste): Mandanten auswählen → „Zu Gruppe“, umbenennen, löschen, „Alle anschreiben“. Nur in der App, DATEV bleibt unverändert. DATEV-Gruppen stehen darunter zum Filtern.
- **Mehrere E-Mails und Beziehungen:** Jede Adresse mit Herkunft (Person, Inhaber, Unternehmen, Gesellschafter, Geschäftsführer, Ansprechpartner …) und DATEV-Bemerkung (z. B. „privat“). Beziehungen aus DATEV (`/relationships`) als Spalten „Beziehungen“ und „Verbund“ (gruppieren: Gesellschaft mit ihren Gesellschaftern). Von Beziehungspartnern zählt nur deren Standard-Adresse.
- **Serienmail:** Empfänger aus Auswahl oder Gruppe, Adressen per Regel (Standard-Adresse · alle eigenen · eigene + Beziehungen) oder pro Mandant angekreuzt (@-Knopf); mehrere Adressen gehen in eine Mail. Im @-Knopf lässt sich jede Adresse **bearbeiten** (nur für diesen Versand, DATEV bleibt unverändert) und eine **eigene ergänzen**; unter der Empfängerliste gibt es **weitere Empfänger** von Hand (eigene Mail, Anrede „Sehr geehrte Damen und Herren“, Anhänge „für alle“). Ehegatten/Lebenspartner werden in beide Richtungen als Adresse erkannt. GmbH ohne eigene Mail → an die Gesellschafter. Vorlage mit Platzhaltern (`{{Anrede}} {{Name}} {{Vorname}} {{Nachname}} {{Mandantennummer}} {{FehlendeAngaben}} {{Grussformel}} {{Datum}} {{Jahr}} {{Vorjahr}} {{Signatur}}`), Vorschau je Mandant, Anhänge für alle oder pro Mandant (`10004_Bescheid.pdf`), Outlook-Entwürfe oder direkt senden, .eml als Ausweg.
- **Vorlagen**, **Protokoll** (mit „Zuletzt angeschrieben“), **Einstellungen** (DATEVconnect, Prüfregeln, Auftragswesen-Status, Versand, Signatur, Hell/Dunkel).
- Aussehen: eigene Titelleiste, Seitenleiste auf Windows-11-Material (Mica), Systemschrift Segoe UI Variable, Petrol hell/dunkel.
- Daten: `%APPDATA%\Kanzlei-Helfer` (Einstellungen, Vorlagen, Gruppen, Ansicht, `protokoll.csv`, `ausgang\`). Mandantendaten werden nie gespeichert, nichts geht ins Internet. Nicht übernommen (Datensparsamkeit): Konfession, SV- und Ausweisnummern.

## Entwickeln
- `npm install`, `npm run app` · Tests: `npm run pruefe`, `npm run pruefe:app` (Ende-zu-Ende gegen nachgebautes DATEVconnect mit Windows-Anmeldung) · `npm run installer`
- Demodaten neu erzeugen: `node tests/demodaten-bauen.cjs`
- Technik: Electron + React + Tailwind + shadcn/ui. Hauptprozess `electron/`, Oberfläche `src/`, Spalten in `src/lib/spalten.ts`, Farben/Schrift in `src/index.css`.

## Noch nicht in der Kanzlei getestet
- Outlook-Weg (COM) und echtes DATEVconnect inkl. Auftragswesen. Beim neuen Outlook: Versand auf „.eml-Dateien“.
