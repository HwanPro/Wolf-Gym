#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env.local"
$exePath = Join-Path $root "dist\WolfGym\biometric\WolfGym.BiometricService.exe"

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw "No se encontro .env.local. Configura DATABASE_URL antes de iniciar el servicio biometrico."
}

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "No se encontro el ejecutable biometrico en dist\WolfGym\biometric."
}

$databaseLine = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match '^DATABASE_URL=' } |
    Select-Object -First 1

if (-not $databaseLine) {
    throw "DATABASE_URL no esta definida en .env.local."
}

$databaseUrl = $databaseLine.Substring("DATABASE_URL=".Length).Trim('"')
$uri = [Uri]$databaseUrl
$credentials = $uri.UserInfo.Split(':', 2)

if ($credentials.Count -ne 2) {
    throw "DATABASE_URL no contiene credenciales validas."
}

$databaseUser = [Uri]::UnescapeDataString($credentials[0])
$databasePassword = [Uri]::UnescapeDataString($credentials[1])
$databaseName = $uri.AbsolutePath.Trim('/')
$databasePort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

$env:ConnectionStrings__DefaultConnection = @(
    "Host=$($uri.Host)"
    "Port=$databasePort"
    "Database=$databaseName"
    "Username=$databaseUser"
    "Password=$databasePassword"
    "SSL Mode=Disable"
    "Trust Server Certificate=true"
) -join ';'
$env:ASPNETCORE_ENVIRONMENT = "Production"

Write-Host "Servicio biometrico conectado a PostgreSQL local." -ForegroundColor Green
Push-Location (Split-Path -Parent $exePath)
try {
    & $exePath
} finally {
    Pop-Location
}
