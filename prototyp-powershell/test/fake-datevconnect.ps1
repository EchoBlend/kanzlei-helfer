# Nachgebautes DATEVconnect (nur Stammdaten-Lesezugriff) fuer Tests ohne DATEV.
# Liefert test\testmandanten.json unter denselben Pfaden wie das echte DATEVconnect, Port 58455.
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$daten = ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'testmandanten.json'), $Utf8))
$basis = '/datev/api/master-data/v1'

$l = New-Object System.Net.HttpListener
$l.Prefixes.Add('http://localhost:58455/')
$l.Start()
Write-Host 'Fake-DATEVconnect laeuft auf http://localhost:58455 (Fenster schliessen = beenden)'
while ($l.IsListening) {
    $ctx = $l.GetContext()
    $pfad = $ctx.Request.Url.AbsolutePath
    $code = 200
    if ($pfad -eq "$basis/version") { $obj = @{ version = 'fake-1.0' } }
    elseif ($pfad -eq "$basis/clients") { $obj = $daten.clients }
    elseif ($pfad -like "$basis/addressees/*" -and $daten.addressees.($pfad.Split('/')[-1])) { $obj = $daten.addressees.($pfad.Split('/')[-1]) }
    else { $code = 404; $obj = @{ error = 'not found' } }
    $b = $Utf8.GetBytes((ConvertTo-Json -InputObject $obj -Depth 10))
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = 'application/json; charset=utf-8'
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    $ctx.Response.OutputStream.Close()
}
