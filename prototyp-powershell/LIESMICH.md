# Kanzlei-Helfer (Test-App)

Prüft Mandanten-Stammdaten aus DATEV auf Lücken und schreibt Mandanten per Vorlage an.

## Starten
- Kanzlei-PC mit DATEV: `Kanzlei-Helfer.cmd` doppelklicken → Browser öffnet `http://localhost:8790`
- Zu Hause ohne DATEV: `test\Test-starten.cmd` → erfundene Testmandanten, Mails nur als .eml in `test\ausgang`
- Beenden: schwarzes Fenster schließen
- Braucht nichts zu installieren: Windows PowerShell 5.1 + Browser

## Was die App macht
- Liest alle aktiven Mandanten über DATEVconnect (Stammdaten-Schnittstelle, Windows-Anmeldung)
- Meldet je Mandant: E-Mail, Telefon, Anschrift, Steuernummer, Finanzamt, Steuer-ID (nur Personen), IBAN
  - „fehlt“ = nicht eingetragen, „prüfen“ = Format bzw. Prüfziffer falsch (IBAN, Steuer-ID, E-Mail)
- Ampel je Mandant: grün vollständig, gelb prüfen, rot fehlt etwas
- Filter, Suche, Lückenliste als CSV (Excel)
- E-Mails: Mandanten anhaken → Vorlage wählen → Vorschau je Mandant → Outlook-Entwürfe (Kategorie „Kanzlei-Helfer“) oder direkt senden
- Anhänge: „für alle“ (geht an jeden) und „pro Mandant“ (Dateiname beginnt mit der Mandantennummer, z. B. `10004_Bescheid.pdf`; wer dann keine eigene Datei hat, wird übersprungen), max. 25 MB je Datei
- Vorlagen anlegen, ändern, löschen; Platzhalter `{{Anrede}} {{Name}} {{Mandantennummer}} {{FehlendeAngaben}} {{Datum}} {{Jahr}} {{Vorjahr}} {{Signatur}}`
- Protokoll jeder Mail in `daten\protokoll.csv` (Spalte „Zuletzt angeschrieben“ in der Stammdaten-Liste)
- Mandantendaten bleiben im Arbeitsspeicher, nichts geht ins Internet

## Einstellungen (`config.json`)
- `datevconnect`: Adresse der Schnittstelle, Standard `http://localhost:58454/datev/api/master-data/v1` (bei Kanzlei-Server: Servername statt localhost)
- `versand`: `outlook` (klassisches Outlook per COM) oder `eml` (Dateien in `daten\ausgang`, z. B. wenn das neue Outlook genutzt wird)
- `signatur`: Text für `{{Signatur}}`
- `nurAktiveMandanten`, `port`

## Grenzen (Stand Test-App)
- Nur Lesezugriff auf DATEV, keine Korrektur der Stammdaten
- Outlook-Weg nur in der Kanzlei testbar; Outlook kann beim automatischen Senden eine Sicherheitsabfrage zeigen
- Selbsttest der Prüfregeln: `powershell -ExecutionPolicy Bypass -File app\server.ps1 -Selbsttest`
