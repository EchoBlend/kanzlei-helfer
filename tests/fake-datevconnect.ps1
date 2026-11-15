# Nachgebautes DATEVconnect fuer Tests ohne DATEV, MIT Windows-Anmeldung wie das echte.
# Liefert electron\demodaten.json unter denselben Pfaden (master-data v1, order-management v1) auf Port 58456.
# Anfragen ohne gueltige Windows-Anmeldung bekommen 401 (macht HttpListener selbst).
param([int]$Port = 58456)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$daten = ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\electron\demodaten.json'), $Utf8))
$mdBasis = '/datev/api/master-data/v1'
$omBasis = '/datev/api/order-management/v1'

# Eigenschaft lesen, deren Name Schraegstriche enthaelt (z. B. "/clients")
function Get-Eintrag($objekt, [string]$name) {
    if ($null -eq $objekt) { return $null }
    $p = $objekt.PSObject.Properties[$name]
    if ($null -eq $p) { return $null }
    return ,$p.Value
}

$l = New-Object System.Net.HttpListener
$l.AuthenticationSchemes = [System.Net.AuthenticationSchemes]::IntegratedWindowsAuthentication
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Fake-DATEVconnect (Windows-Anmeldung) auf http://localhost:$Port"
while ($l.IsListening) {
    $ctx = $l.GetContext()
    $pfad = $ctx.Request.Url.AbsolutePath
    $wer = if ($ctx.User) { $ctx.User.Identity.Name } else { '-' }
    Write-Host "$($ctx.Request.HttpMethod) $pfad  angemeldet als: $wer"
    $code = 200
    $obj = $null
    if ($pfad -eq "$mdBasis/version") {
        $obj = @{ version = 'fake-1.1' }
    }
    elseif ($pfad.StartsWith("$mdBasis/addressees/")) {
        $id = $pfad.Substring("$mdBasis/addressees/".Length)
        $obj = Get-Eintrag ($daten.addressees) $id
    }
    elseif ($pfad.StartsWith("$mdBasis/")) {
        $obj = Get-Eintrag ($daten.'master-data') $pfad.Substring($mdBasis.Length)
    }
    elseif ($pfad.StartsWith("$omBasis/")) {
        $obj = Get-Eintrag ($daten.'order-management') $pfad.Substring($omBasis.Length)
    }
    if ($null -eq $obj) { $code = 404; $obj = @{ error = 'not found' } }
    $b = $Utf8.GetBytes((ConvertTo-Json -InputObject $obj -Depth 12))
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = 'application/json; charset=utf-8'
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    $ctx.Response.OutputStream.Close()
}
