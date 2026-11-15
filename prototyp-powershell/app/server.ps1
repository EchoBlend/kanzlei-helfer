# Kanzlei-Helfer - Backend (Windows PowerShell 5.1, ohne Installation)
# Liest Mandanten-Stammdaten aus DATEVconnect, prueft Luecken, legt Mails in Outlook an.
# Start: ..\Kanzlei-Helfer.cmd   Test ohne DATEV: ..\test\Test-starten.cmd   Selbsttest: server.ps1 -Selbsttest
# Hinweis: Datei bewusst nur ASCII (PS 5.1 liest .ps1 ohne BOM als ANSI). Deutsche Texte stehen in index.html.
param([switch]$Test, [switch]$Selbsttest, [switch]$KeinBrowser)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Read-Json([string]$pfad) { ConvertFrom-Json ([IO.File]::ReadAllText($pfad, $Utf8)) }

$Config = Read-Json (Join-Path $Root 'config.json')
$VorlagenDatei = Join-Path $Root 'daten\vorlagen.json'
$ProtokollDatei = Join-Path $Root 'daten\protokoll.csv'
$AusgangOrdner = Join-Path $Root 'daten\ausgang'
$AnhangOrdner = Join-Path $Root 'daten\anhaenge-tmp'   # hochgeladene Anhaenge, nur bis zum Versand
if ($Test) {
    $Config.datevconnect = 'http://localhost:58455/datev/api/master-data/v1'
    $Config.versand = 'eml'
    $ProtokollDatei = Join-Path $Root 'test\protokoll-test.csv'
    $AusgangOrdner = Join-Path $Root 'test\ausgang'
    $AnhangOrdner = Join-Path $Root 'test\anhaenge-tmp'
}

# ---------- Pruefregeln ----------

function Test-Iban([string]$iban) {
    $s = ($iban -replace '\s', '').ToUpper()
    if ($s -notmatch '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$') { return $false }
    $s = $s.Substring(4) + $s.Substring(0, 4)
    $r = 0
    foreach ($ch in $s.ToCharArray()) {
        if ([char]::IsDigit($ch)) { $r = ($r * 10 + [int][string]$ch) % 97 }
        else { $r = ($r * 100 + ([int]$ch - 55)) % 97 }   # A=10 ... Z=35
    }
    return $r -eq 1
}

function Test-SteuerId([string]$id) {
    # Pruefziffer nach ISO 7064 MOD 11,10 (Paragraf 139b AO)
    $s = $id -replace '\s', ''
    if ($s -notmatch '^[1-9]\d{10}$') { return $false }
    $p = 10
    for ($i = 0; $i -lt 10; $i++) {
        $x = ([int][string]$s[$i] + $p) % 10
        if ($x -eq 0) { $x = 10 }
        $p = ($x * 2) % 11
    }
    $c = 11 - $p
    if ($c -eq 10) { $c = 0 }
    return $c -eq [int][string]$s[10]
}

function Get-Gueltig($adressaten, [string]$feld) {
    # Eintraege aller Adressaten eines Mandanten, ohne abgelaufene (currently_valid = false)
    @($adressaten | ForEach-Object { $_.$feld } | Where-Object { $_ -and $_.currently_valid -ne $false })
}

function Get-Pruefung($mandant, $adressaten) {
    $luecken = New-Object System.Collections.ArrayList
    $fehlerhaft = New-Object System.Collections.ArrayList

    $mails = @(Get-Gueltig $adressaten 'communications' | Where-Object { $_.type -eq 'email' -and $_.data_content } |
        Sort-Object { -not $_.is_main_communication })
    $telefon = @(Get-Gueltig $adressaten 'communications' | Where-Object { $_.type -eq 'phone' -and $_.data_content })
    $anschrift = @(Get-Gueltig $adressaten 'addresses' | Where-Object { $_.postal_code -and $_.city -and ($_.street -or $_.post_office_box) })
    $finanzaemter = @(Get-Gueltig $adressaten 'tax_offices')
    $konten = @(Get-Gueltig $adressaten 'bank_accounts' | Where-Object { $_.iban })
    $personen = @($adressaten | Where-Object { $_.type -eq 'natural_person' })

    $email = $null
    if ($mails.Count -eq 0) { [void]$luecken.Add('email') }
    else {
        $email = [string]$mails[0].data_content
        if ($email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { [void]$fehlerhaft.Add('email') }
    }
    if ($telefon.Count -eq 0) { [void]$luecken.Add('telefon') }
    if ($anschrift.Count -eq 0) { [void]$luecken.Add('anschrift') }
    if (@($finanzaemter | Where-Object { $_.tax_number }).Count -eq 0) { [void]$luecken.Add('steuernummer') }
    if (@($finanzaemter | Where-Object { $_.tax_office_number -or $_.tax_office_name }).Count -eq 0) { [void]$luecken.Add('finanzamt') }
    if ($personen.Count -gt 0) {
        $ids = @($personen | Where-Object { $_.tax_identification_number })
        if ($ids.Count -eq 0) { [void]$luecken.Add('steuerid') }
        elseif (@($ids | Where-Object { -not (Test-SteuerId $_.tax_identification_number) }).Count -gt 0) { [void]$fehlerhaft.Add('steuerid') }
    }
    if ($konten.Count -eq 0) { [void]$luecken.Add('iban') }
    elseif (@($konten | Where-Object { -not (Test-Iban $_.iban) }).Count -gt 0) { [void]$fehlerhaft.Add('iban') }

    $anreden = @($adressaten | ForEach-Object { $_.detail } | Where-Object { $_ -and $_.salutation } | ForEach-Object { $_.salutation })
    $anrede = if ($anreden.Count) { [string]$anreden[0] } else { $null }

    [pscustomobject]@{
        id = $mandant.id; nummer = $mandant.number; name = $mandant.name; typ = $mandant.type; status = $mandant.status
        email = $email; anrede = $anrede; luecken = @($luecken); fehlerhaft = @($fehlerhaft); abruffehler = $null
    }
}

# ---------- DATEVconnect ----------

function Get-Meldung($err) { $e = $err.Exception; while ($e.InnerException) { $e = $e.InnerException }; $e.Message }

function Get-Datev([string]$pfad) {
    $wc = New-Object System.Net.WebClient
    $wc.UseDefaultCredentials = $true      # Windows-Anmeldung, wie im DATEV-Arbeitsplatz
    $wc.Encoding = $Utf8
    $wc.Headers['Accept'] = 'application/json'
    try { $txt = $wc.DownloadString($Config.datevconnect.TrimEnd('/') + $pfad) } finally { $wc.Dispose() }
    $obj = ConvertFrom-Json $txt   # Zuweisung statt Pipeline: PS 5.1 reicht Arrays sonst als ein Objekt weiter
    return , $obj
}

function Get-Mandanten {
    $liste = New-Object System.Collections.ArrayList
    $clients = Get-Datev '/clients'
    foreach ($c in $clients) {
        if ($Config.nurAktiveMandanten -and $c.status -ne 'active') { continue }
        # ponytail: eine Abfrage je Adressat nacheinander; bei sehr vielen Mandanten parallelisieren
        try {
            $adr = @(@($c.natural_person_id, $c.legal_person_id) | Where-Object { $_ } |
                ForEach-Object { Get-Datev "/addressees/$($_)?expand=*" })
            [void]$liste.Add((Get-Pruefung $c $adr))
        } catch {
            [void]$liste.Add([pscustomobject]@{
                id = $c.id; nummer = $c.number; name = $c.name; typ = $c.type; status = $c.status
                email = $null; anrede = $null; luecken = @(); fehlerhaft = @(); abruffehler = (Get-Meldung $_)
            })
        }
    }
    return , @($liste | Sort-Object nummer)
}

# ---------- Versand ----------

function Get-B64([string]$t) { [Convert]::ToBase64String($Utf8.GetBytes($t)) }

function Get-Zeilen76([string]$b64) { $b64 -replace '(.{76})', "`$1`r`n" }

function Save-Eml($m, [string[]]$anhaenge) {
    # .eml mit X-Unsent: Outlook oeffnet die Datei als fertigen Entwurf zum Senden
    if (-not (Test-Path $AusgangOrdner)) { [void](New-Item -ItemType Directory $AusgangOrdner) }
    $kopf = "X-Unsent: 1`r`nTo: $($m.an)`r`nSubject: =?utf-8?B?$(Get-B64 $m.betreff)?=`r`nMIME-Version: 1.0`r`n"
    $textTeil = "Content-Type: text/plain; charset=utf-8`r`nContent-Transfer-Encoding: base64`r`n`r`n" +
        (Get-Zeilen76 (Get-B64 ($m.text -replace "`r?`n", "`r`n"))) + "`r`n"
    if (-not $anhaenge) { $eml = $kopf + $textTeil }
    else {
        $grenze = 'KH_' + [guid]::NewGuid().ToString('N')
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append($kopf + "Content-Type: multipart/mixed; boundary=`"$grenze`"`r`n`r`n--$grenze`r`n" + $textTeil)
        foreach ($p in $anhaenge) {
            $n = "=?utf-8?B?$(Get-B64 ([IO.Path]::GetFileName($p)))?="
            $typ = if ($p -match '\.pdf$') { 'application/pdf' } else { 'application/octet-stream' }
            [void]$sb.Append("--$grenze`r`nContent-Type: $typ; name=`"$n`"`r`nContent-Transfer-Encoding: base64`r`n" +
                "Content-Disposition: attachment; filename=`"$n`"`r`n`r`n" + (Get-Zeilen76 ([Convert]::ToBase64String([IO.File]::ReadAllBytes($p)))) + "`r`n")
        }
        [void]$sb.Append("--$grenze--`r`n")
        $eml = $sb.ToString()
    }
    $datei = Join-Path $AusgangOrdner ('{0}_{1}.eml' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $m.nummer)
    [IO.File]::WriteAllText($datei, $eml, $Utf8)
    return $datei
}

function Send-Outlook($m, [string]$modus, [string[]]$anhaenge) {
    if (-not $script:Outlook) { $script:Outlook = New-Object -ComObject Outlook.Application }
    $item = $script:Outlook.CreateItem(0)   # 0 = olMailItem
    $item.To = $m.an
    $item.Subject = $m.betreff
    $item.Body = $m.text -replace "`r?`n", "`r`n"
    $item.Categories = 'Kanzlei-Helfer'
    foreach ($p in $anhaenge) { [void]$item.Attachments.Add($p) }   # Outlook kopiert die Datei in die Mail
    if ($modus -eq 'senden') { $item.Send() } else { $item.Save() }   # Save = Ordner Entwuerfe
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item)
}

function Add-Protokoll([string[]]$werte) {
    $zeile = ($werte | ForEach-Object { '"' + ([string]$_ -replace '"', '""') + '"' }) -join ';'
    if (-not (Test-Path $ProtokollDatei)) {
        [IO.File]::WriteAllText($ProtokollDatei, "Zeit;Modus;Vorlage;Mandantennr;Mandant;An;Betreff;Ergebnis;Anhaenge`r`n", $Utf8Bom)  # BOM: Excel zeigt Umlaute richtig
    }
    [IO.File]::AppendAllText($ProtokollDatei, $zeile + "`r`n", $Utf8)
}

# ---------- HTTP ----------

function Send-Antwort($ctx, [string]$text, [string]$typ, [int]$code = 200) {
    $b = $Utf8.GetBytes($text)
    $res = $ctx.Response
    $res.StatusCode = $code
    $res.ContentType = $typ
    $res.Headers['Cache-Control'] = 'no-store'
    $res.ContentLength64 = $b.Length
    $res.OutputStream.Write($b, 0, $b.Length)
    $res.OutputStream.Close()
}
function Send-Json($ctx, $obj, [int]$code = 200) {
    Send-Antwort $ctx (ConvertTo-Json -InputObject $obj -Depth 10 -Compress) 'application/json; charset=utf-8' $code
}
function Read-Body($req) {
    $sr = New-Object IO.StreamReader($req.InputStream, $Utf8)
    try { ConvertFrom-Json $sr.ReadToEnd() } finally { $sr.Close() }
}

function Invoke-Route($ctx) {
    $req = $ctx.Request
    $pfad = $req.Url.AbsolutePath
    # Schutz: nur Aufrufe von dieser Seite (Host-Pruefung gegen DNS-Rebinding, Kopfzeile gegen fremde Webseiten)
    if ($req.Headers['Host'] -ne "localhost:$($Config.port)") { return Send-Json $ctx @{ fehler = 'Host abgelehnt' } 403 }
    if ($pfad -like '/api/*' -and $req.Headers['X-Kanzlei-Helfer'] -ne '1') { return Send-Json $ctx @{ fehler = 'Aufruf abgelehnt' } 403 }

    switch ("$($req.HttpMethod) $pfad") {
        'GET /' {
            return Send-Antwort $ctx ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'index.html'), $Utf8)) 'text/html; charset=utf-8'
        }
        'GET /api/status' {
            $datev = $true; $meldung = $null
            try { [void](Get-Datev '/version') } catch { $datev = $false; $meldung = Get-Meldung $_ }
            return Send-Json $ctx @{ datev = $datev; datevUrl = $Config.datevconnect; meldung = $meldung; versand = $Config.versand
                test = [bool]$Test; signatur = $Config.signatur; ausgang = $AusgangOrdner; protokoll = $ProtokollDatei }
        }
        'GET /api/mandanten' {
            if (-not $script:Mandanten -or $req.QueryString['neu'] -eq '1') {
                $script:Mandanten = Get-Mandanten
                $script:Stand = Get-Date -Format 'dd.MM.yyyy HH:mm'
            }
            return Send-Json $ctx @{ stand = $script:Stand; mandanten = $script:Mandanten }
        }
        'GET /api/vorlagen' {
            return Send-Antwort $ctx ([IO.File]::ReadAllText($VorlagenDatei, $Utf8)) 'application/json; charset=utf-8'
        }
        'PUT /api/vorlagen' {
            $neu = Read-Body $req
            [IO.File]::WriteAllText($VorlagenDatei, (ConvertTo-Json -InputObject @($neu) -Depth 5), $Utf8)
            return Send-Json $ctx @{ ok = $true }
        }
        'GET /api/protokoll' {
            $zeilen = @()
            if (Test-Path $ProtokollDatei) {
                # feste Spalten statt Kopfzeile: aeltere Protokolle ohne Spalte Anhaenge bleiben lesbar
                $zeilen = @([IO.File]::ReadAllLines($ProtokollDatei, $Utf8) | Select-Object -Skip 1 |
                    ConvertFrom-Csv -Delimiter ';' -Header 'Zeit', 'Modus', 'Vorlage', 'Mandantennr', 'Mandant', 'An', 'Betreff', 'Ergebnis', 'Anhaenge')
            }
            return Send-Json $ctx $zeilen
        }
        'POST /api/anhang' {
            # Rohe Datei im Body, Name URL-kodiert in der Kopfzeile (umgeht Groessengrenzen von ConvertFrom-Json)
            $name = [IO.Path]::GetFileName([Uri]::UnescapeDataString([string]$req.Headers['X-Dateiname'])) -replace '[\\/:*?"<>|]', '_'
            if (-not $name -or $name -match '^\.+$') { return Send-Json $ctx @{ fehler = 'Dateiname fehlt' } 400 }
            if ($req.ContentLength64 -gt 25MB) { return Send-Json $ctx @{ fehler = "Datei zu gross (max. 25 MB): $name" } 413 }
            $id = [guid]::NewGuid().ToString()
            [void](New-Item -ItemType Directory (Join-Path $AnhangOrdner $id) -Force)
            $fs = [IO.File]::Create((Join-Path $AnhangOrdner "$id\$name"))
            try { $req.InputStream.CopyTo($fs) } finally { $fs.Close() }
            return Send-Json $ctx @{ id = "$id/$name" }
        }
        'POST /api/mails' {
            $auftrag = Read-Body $req
            $modus = [string]$auftrag.modus
            if ($modus -ne 'entwurf' -and $modus -ne 'senden') { return Send-Json $ctx @{ fehler = 'Modus unbekannt' } 400 }
            $ergebnis = New-Object System.Collections.ArrayList
            try {
                foreach ($m in @($auftrag.mails)) {
                    $ok = $true; $info = ''; $pfade = @()
                    try {
                        if ($m.an -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Ungueltige Adresse: $($m.an)" }
                        $pfade = @(@($m.anhaenge) | Where-Object { $_ } | ForEach-Object {
                            if ($_ -notmatch '^[0-9a-f\-]{36}/[^\\/]+$') { throw "Anhang ungueltig: $_" }
                            $p = Join-Path $AnhangOrdner ($_ -replace '/', '\')
                            if (-not (Test-Path $p -PathType Leaf)) { throw "Anhang fehlt: $_" }
                            $p })
                        if ($Config.versand -eq 'eml') { $info = Save-Eml $m $pfade } else { Send-Outlook $m $modus $pfade }
                    } catch { $ok = $false; $info = $_.Exception.Message }
                    $text = if ($ok) { 'ok' } else { "Fehler: $info" }
                    Add-Protokoll @((Get-Date -Format 'dd.MM.yyyy HH:mm:ss'), $(if ($Config.versand -eq 'eml') { 'eml' } else { $modus }),
                        $auftrag.vorlage, $m.nummer, $m.name, $m.an, $m.betreff, $text, (($pfade | ForEach-Object { [IO.Path]::GetFileName($_) }) -join ', '))
                    [void]$ergebnis.Add(@{ nummer = $m.nummer; ok = $ok; info = $info })
                }
            } finally {
                # Anhaenge nach dem Versand wieder loeschen (stecken jetzt in den Mails)
                if (Test-Path $AnhangOrdner) { Remove-Item (Join-Path $AnhangOrdner '*') -Recurse -Force -ErrorAction SilentlyContinue }
            }
            return Send-Json $ctx @($ergebnis)
        }
        default { return Send-Json $ctx @{ fehler = "Unbekannt: $pfad" } 404 }
    }
}

# ---------- Selbsttest (Pruefregeln gegen Testmandanten) ----------

if ($Selbsttest) {
    $t = Read-Json (Join-Path $Root 'test\testmandanten.json')
    $soll = @{
        10001 = 'luecken=;fehlerhaft='
        10002 = 'luecken=email,iban;fehlerhaft='
        10003 = 'luecken=telefon;fehlerhaft=email,steuerid,iban'
        10004 = 'luecken=steuernummer,finanzamt;fehlerhaft='
        10006 = 'luecken=telefon,anschrift,steuernummer,finanzamt,steuerid,iban;fehlerhaft='
    }
    $fehler = 0
    foreach ($c in $t.clients) {
        if (-not $soll.ContainsKey([int]$c.number)) { continue }
        $adr = @(@($c.natural_person_id, $c.legal_person_id) | Where-Object { $_ } | ForEach-Object { $t.addressees.$_ })
        $p = Get-Pruefung $c $adr
        $ist = "luecken=$($p.luecken -join ',');fehlerhaft=$($p.fehlerhaft -join ',')"
        if ($ist -eq $soll[[int]$c.number]) { "OK   $($c.number)  $ist" } else { $fehler++; "FAIL $($c.number)  ist: $ist  soll: $($soll[[int]$c.number])" }
    }
    if (-not (Test-Iban 'DE89 3704 0044 0532 0130 00') -or (Test-Iban 'DE89370400440532013001')) { $fehler++; 'FAIL Test-Iban' }
    if (-not (Test-SteuerId '86095742719') -or (Test-SteuerId '86095742718')) { $fehler++; 'FAIL Test-SteuerId' }
    if ($fehler) { "$fehler Fehler"; exit 1 } else { 'Selbsttest bestanden'; exit 0 }
}

# ---------- Server ----------

$prefix = "http://localhost:$($Config.port)/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
    Write-Host "Port $($Config.port) belegt - Kanzlei-Helfer laeuft vermutlich schon. Oeffne Browser."
    Start-Process $prefix; exit 0
}
if (Test-Path $AnhangOrdner) { Remove-Item (Join-Path $AnhangOrdner '*') -Recurse -Force -ErrorAction SilentlyContinue }   # Reste eines abgebrochenen Laufs
Write-Host "Kanzlei-Helfer laeuft auf $prefix"
if ($Test) { Write-Host 'TESTMODUS: Fake-DATEVconnect auf Port 58455, Mails als .eml in test\ausgang' }
Write-Host 'Beenden: dieses Fenster schliessen.'
if (-not $KeinBrowser) { Start-Process $prefix }
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try { Invoke-Route $ctx } catch {
        $meldung = Get-Meldung $_
        Write-Host "Fehler: $meldung"
        try { Send-Json $ctx @{ fehler = $meldung } 500 } catch { }
    }
}
