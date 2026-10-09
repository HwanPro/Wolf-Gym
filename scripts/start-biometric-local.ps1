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
if ($uri.Scheme -notin @('postgres','postgresql') -or $uri.Host -notin @('localhost','127.0.0.1','::1','[::1]') -or $uri.Query -match '(?i)[?&](host|service|socket|options)=') {
    throw "El servicio biometrico local requiere PostgreSQL en loopback, sin redirecciones."
}
$env:WOLF_LOCAL_ONLY = "1"
# El servicio lee .env.local y construye la conexión con Npgsql, que escapa
# correctamente las credenciales. No heredar una conexión remota del terminal.
$env:ConnectionStrings__DefaultConnection = ""
$env:ASPNETCORE_ENVIRONMENT = "Production"

Write-Host "Servicio biometrico conectado a PostgreSQL local." -ForegroundColor Green
Push-Location (Split-Path -Parent $exePath)
try {
    & $exePath
} finally {
    Pop-Location
}
