#Requires -Version 5.1
<#
.SYNOPSIS
  Compila y empaqueta WolfGym en una carpeta lista para distribuir.
  Ejecutar desde la raíz del proyecto: .\setup-launcher\build-package.ps1

.OUTPUTS
  dist\WolfGym-vX.X\
    ├── biometric\         ← Servicio C# compilado (self-contained)
    ├── webapp\            ← Next.js build + node_modules
    ├── WolfGym.bat        ← Lanzador (doble clic para iniciar)
    └── README-INICIO.txt  ← Instrucciones rápidas
#>

param(
    [string]$Version = "",
    [switch]$CreateZip,
    [string]$WebBuildPath = "",
    [string]$OutputDirectory = "",
    [string]$LocalEnvPath = "",
    [switch]$NoShortcut
)

$ErrorActionPreference = "Stop"
$ROOT   = Split-Path $PSScriptRoot -Parent
$DIST   = Join-Path $ROOT "dist\WolfGym"
$BIO_SRC = Join-Path $ROOT "biometric-service"
$BIO_DEST = Join-Path $DIST "biometric"
$WEB_DEST = Join-Path $DIST "webapp"
$RUNTIME_DEST = Join-Path $DIST "runtime"
$SETUP_SRC = Join-Path $ROOT "setup-launcher"
$LAUNCHER_SRC = Join-Path $ROOT "launcher"

if ($OutputDirectory) { $DIST = [IO.Path]::GetFullPath($OutputDirectory) }
$resolvedRoot = [IO.Path]::GetFullPath($ROOT).TrimEnd('\')
$DIST = [IO.Path]::GetFullPath($DIST).TrimEnd('\')
if (-not $DIST.StartsWith($resolvedRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "El destino debe estar dentro del proyecto y no puede ser su raiz."
}
for ($candidate = $DIST; $candidate -ne $resolvedRoot; $candidate = Split-Path $candidate -Parent) {
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "El destino contiene una junction o enlace: $candidate"
    }
}
if ((Test-Path -LiteralPath (Join-Path $DIST 'webapp')) -and
    (Get-ChildItem -LiteralPath (Join-Path $DIST 'webapp') -Force -File | Where-Object Name -like '.env*')) {
    throw "El destino contiene configuracion privada. Elija una carpeta nueva con -OutputDirectory."
}
$BIO_DEST = Join-Path $DIST 'biometric'
$WEB_DEST = Join-Path $DIST 'webapp'
$RUNTIME_DEST = Join-Path $DIST 'runtime'
$webSource = $ROOT
if ($WebBuildPath) {
    $WebBuildPath = (Resolve-Path -LiteralPath $WebBuildPath -ErrorAction Stop).ProviderPath
    $webSource = Split-Path $WebBuildPath -Parent
    foreach ($required in @('BUILD_ID','required-server-files.json','routes-manifest.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $WebBuildPath $required))) { throw "Build incompleto: $required" }
    }
    foreach ($required in @('package-lock.json','next.config.ts')) {
        if ((Get-FileHash -LiteralPath (Join-Path $webSource $required)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $ROOT $required)).Hash) {
            throw "El build reutilizado no corresponde a $required actual."
        }
    }
}
if ($LocalEnvPath) { $LocalEnvPath = (Resolve-Path -LiteralPath $LocalEnvPath -ErrorAction Stop).ProviderPath }

if ([string]::IsNullOrWhiteSpace($Version)) {
    if (-not [string]::IsNullOrWhiteSpace($env:WOLFGYM_VERSION)) {
        $Version = $env:WOLFGYM_VERSION
    } else {
        try {
            $gitTag = (& git describe --tags --abbrev=0 2>$null)
            $Version = if ([string]::IsNullOrWhiteSpace($gitTag)) { "0.1.0-local" } else { $gitTag.Trim() }
        } catch {
            $Version = "0.1.0-local"
        }
    }
}

Write-Host "=== WolfGym Package Builder ===" -ForegroundColor Green
Write-Host "Destino: $DIST" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor Cyan
Write-Host ""

# ── Limpiar ────────────────────────────────────────────────────────────────────
if (Test-Path $DIST) {
    Write-Host "Limpiando build anterior..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $DIST -Recurse -Force
}
New-Item $DIST     -ItemType Directory | Out-Null
New-Item $BIO_DEST -ItemType Directory | Out-Null
New-Item $WEB_DEST -ItemType Directory | Out-Null
New-Item $RUNTIME_DEST -ItemType Directory | Out-Null

# ── 1. Compilar servicio biométrico C# (self-contained) ──────────────────────
Write-Host "Compilando servicio biométrico..." -ForegroundColor Cyan

dotnet publish $BIO_SRC `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=false `
    -p:PublishReadyToRun=true `
    -o $BIO_DEST

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR al compilar el servicio biométrico." -ForegroundColor Red
    exit 1
}

Write-Host "  Servicio biométrico compilado OK" -ForegroundColor Green

# ── 2. Sanitizar config del paquete ─────────────────────────────────────────────
$packagedConfigPath = Join-Path $BIO_DEST "appsettings.json"
if (Test-Path $packagedConfigPath) {
    $packagedConfig = Get-Content -LiteralPath $packagedConfigPath -Raw | ConvertFrom-Json
    $packagedConfig.ConnectionStrings.DefaultConnection = ""
    $packagedConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $packagedConfigPath -Encoding UTF8
    Write-Host "  Config biometrica sanitizada; el launcher usara DATABASE_URL del .env local" -ForegroundColor Green
}

# ASP.NET carga este archivo despues de appsettings.json. No debe viajar en el
# paquete porque podria sobrescribir la conexion privada preservada en cada PC.
$packagedProductionConfigPath = Join-Path $BIO_DEST "appsettings.Production.json"
if (Test-Path -LiteralPath $packagedProductionConfigPath) {
    Remove-Item -LiteralPath $packagedProductionConfigPath -Force
}

# ── 3. Build Next.js ──────────────────────────────────────────────────────────
Write-Host "Compilando app web (Next.js)..." -ForegroundColor Cyan
if (-not $WebBuildPath) {
$releaseBuildEnvironment = @{
    DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/wolfgym?schema=public"
    SHADOW_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/wolfgym_shadow?schema=public"
    NEXTAUTH_SECRET = "wolfgym-release-placeholder"
    NEXTAUTH_URL = "http://127.0.0.1:3000"
    AWS_ACCESS_KEY_ID = "release-placeholder"
    AWS_SECRET_ACCESS_KEY = "release-placeholder"
    AWS_REGION = "us-east-1"
    AWS_BUCKET_NAME = "release-placeholder"
    CULQI_PRIVATE_KEY = "release-placeholder"
    EMAIL_USER = "release@example.invalid"
    EMAIL_PASS = "release-placeholder"
    SMTP_USER = "release@example.invalid"
    SMTP_PASS = "release-placeholder"
    TWILIO_ACCOUNT_SID = "release-placeholder"
    TWILIO_AUTH_TOKEN = "release-placeholder"
}
$previousBuildEnvironment = @{}
foreach ($name in $releaseBuildEnvironment.Keys) {
    $previousBuildEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $releaseBuildEnvironment[$name], "Process")
}
Push-Location $ROOT
try {
    Write-Host "  Instalando dependencias del proyecto..." -ForegroundColor Yellow
    if (Test-Path (Join-Path $ROOT "package-lock.json")) {
        # Prisma y otras herramientas de build viven en devDependencies. Forzar
        # su inclusion evita fallos cuando la terminal trae NODE_ENV=production.
        & npm ci --include=dev --ignore-scripts
    } else {
        & npm install --include=dev --ignore-scripts
    }
    if ($LASTEXITCODE -ne 0) { throw "npm install fallo" }

    # Prisma 7 cambia el formato del schema. Usar siempre el Prisma local fijado en package-lock.
    # Variables dummy para generar el cliente sin conectarse a la base durante el empaquetado.
    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
        $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/wolfgym?schema=public"
    }
    if ([string]::IsNullOrWhiteSpace($env:SHADOW_DATABASE_URL)) {
        $env:SHADOW_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/wolfgym_shadow?schema=public"
    }

    $npmBin = Join-Path $ROOT "node_modules\.bin"
    $prismaCmd = Join-Path $npmBin "prisma.cmd"
    $nextCmd = Join-Path $npmBin "next.cmd"

    if (-not (Test-Path $prismaCmd)) { throw "No se encontro Prisma local en node_modules. Revise npm install." }
    if (-not (Test-Path $nextCmd)) { throw "No se encontro Next local en node_modules. Revise npm install." }

    # Generar Prisma client con la version local del proyecto.
    & $prismaCmd generate
    if ($LASTEXITCODE -ne 0) { throw "prisma generate falló" }

    # Build de producción sin ejecutar migraciones.
    $env:NODE_ENV = "production"
    & $nextCmd build
    if ($LASTEXITCODE -ne 0) { throw "next build falló" }
} finally {
    Pop-Location
    foreach ($name in $previousBuildEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousBuildEnvironment[$name], "Process")
    }
}

} else {
    Write-Host "  Reutilizando build verificado: $WebBuildPath (sin reinstalar dependencias de trabajo)" -ForegroundColor Green
}

# Copiar archivos necesarios para next start. El lockfile evita que npm resuelva
# dependencias distintas dentro del paquete final y dispare conflictos ERESOLVE.
$itemsToCopy = @("public", "package.json", "package-lock.json", "prisma")
foreach ($item in $itemsToCopy) {
    $src = Join-Path $webSource $item
    $dst = Join-Path $WEB_DEST $item
    if (Test-Path $src) {
        Copy-Item $src $dst -Recurse -Force
    }
}

$compiledWeb = if ($WebBuildPath) { $WebBuildPath } else { Join-Path $ROOT '.next' }
$packagedBuild = Join-Path $WEB_DEST '.next'
New-Item -ItemType Directory -Path $packagedBuild | Out-Null
Get-ChildItem -LiteralPath $compiledWeb -Force | Where-Object Name -ne 'cache' |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packagedBuild $_.Name) -Recurse -Force }
# Conservar la configuracion real sin requerir TypeScript en las dependencias de produccion.
& node (Join-Path $SETUP_SRC 'write-runtime-config.mjs') $webSource $WEB_DEST
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar next.config.mjs' }

# Next guarda el baseUrl del tsconfig en el build. En Windows, next start valida
# que webapp\src exista aunque el paquete no necesite el codigo fuente TS.
New-Item (Join-Path $WEB_DEST "src") -ItemType Directory -Force | Out-Null

# Copiar node_modules (solo producción)
Write-Host "  Instalando dependencias de producción..." -ForegroundColor Yellow
Push-Location $WEB_DEST
try {
    if (Test-Path (Join-Path $WEB_DEST "package-lock.json")) {
        & npm ci --omit=dev --ignore-scripts --legacy-peer-deps
    } else {
        & npm install --omit=dev --ignore-scripts --legacy-peer-deps
    }
    if ($LASTEXITCODE -ne 0) { throw "npm install de producción falló" }
} finally {
    Pop-Location
}

# npm se ejecuta con --ignore-scripts, asi que copiamos el cliente Prisma ya generado
# durante el build raiz para que next start funcione sin postinstall.
$prismaRuntimeSrc = Join-Path $webSource "node_modules\.prisma"
$prismaRuntimeDst = Join-Path $WEB_DEST "node_modules\.prisma"
if (Test-Path $prismaRuntimeSrc) {
    Copy-Item $prismaRuntimeSrc $prismaRuntimeDst -Recurse -Force
}

$prismaClientSrc = Join-Path $webSource "node_modules\@prisma\client"
$prismaClientDst = Join-Path $WEB_DEST "node_modules\@prisma\client"
if (Test-Path $prismaClientSrc) {
    Copy-Item $prismaClientSrc $prismaClientDst -Recurse -Force
}

Write-Host "  App web compilada OK" -ForegroundColor Green

# ── 3b. Incluir runtime Node.js ─────────────────────────────────────────────
# La PC cliente no necesita instalar Node. El launcher usa este ejecutable para
# iniciar Next.js directamente desde webapp\node_modules.
$nodeCommand = Get-Command node -ErrorAction Stop
Copy-Item -LiteralPath $nodeCommand.Source -Destination (Join-Path $RUNTIME_DEST "node.exe") -Force
Write-Host "  Runtime Node.js incluido: $(& $nodeCommand.Source --version)" -ForegroundColor Green

# ── 4. Crear lanzador .bat ─────────────────────────────────────────────────────
Write-Host "Creando lanzador..." -ForegroundColor Cyan

$batContent = @'
@echo off
title WolfGym - Sistema de Gimnasio
cd /d "%~dp0"

echo.
echo  ==========================================
echo   WOLF GYM - Iniciando sistema...
echo  ==========================================
echo.

REM El launcher controla y cierra exclusivamente los servicios de esta instalacion.
if not exist "%~dp0WolfGymLauncher.exe" (
    echo ERROR: Falta WolfGymLauncher.exe. Repare la instalacion.
    pause
    exit /b 1
)
start "" /wait "%~dp0WolfGymLauncher.exe" %*
exit /b %errorlevel%
'@

Set-Content (Join-Path $DIST "WolfGym.bat") $batContent -Encoding UTF8

# ── 4b. Compilar lanzador .exe ────────────────────────────────────────────────
$launcherProject = Join-Path $LAUNCHER_SRC "WolfGymLauncher.csproj"
if (Test-Path $launcherProject) {
    Write-Host "Compilando WolfGymLauncher.exe..." -ForegroundColor Cyan
    $assemblyVersion = (($Version.Trim().TrimStart('v', 'V')) -split '[-+]')[0]
    if ($assemblyVersion -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { $assemblyVersion = "1.0.0" }
    dotnet publish $launcherProject `
        -c Release `
        -r win-x64 `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=true `
        -p:Version=$assemblyVersion `
        -o $DIST

    if ($LASTEXITCODE -ne 0) { throw "WolfGymLauncher.exe no pudo compilarse" }
    Write-Host "  WolfGymLauncher.exe compilado OK" -ForegroundColor Green
    Copy-Item -LiteralPath (Join-Path $LAUNCHER_SRC "Assets\WolfGymLauncher.ico") -Destination (Join-Path $DIST "WolfGym.ico") -Force
    Write-Host "  Icono WolfGym.ico incluido" -ForegroundColor Green
} else {
    throw "No se encontro launcher\WolfGymLauncher.csproj."
}

# ── 5. Buscar DLLs de ZKTeco y copiarlas al paquete ──────────────────────────
Write-Host "Buscando DLLs de ZKTeco para incluir en el paquete..." -ForegroundColor Cyan

$zkDlls = @("libzkfp.dll", "libzkfpcsharp.dll")
$bundledZkRoot = Join-Path $ROOT "vendor\zkfinger\win-x64"

function Get-ZKSearchRoots {
    $roots = New-Object System.Collections.Generic.List[string]
    function Add-Root([string]$Path) {
        if ([string]::IsNullOrWhiteSpace($Path)) { return }
        try {
            $resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
            if ($resolved -and -not $roots.Contains($resolved.ProviderPath)) {
                [void]$roots.Add($resolved.ProviderPath)
            }
        } catch { }
    }

    @(
        $bundledZkRoot,
        $env:ZKFINGER_SDK_ROOT,
        $env:WOLFGYM_ZKFINGER_SDK,
        "D:\Downloads\ZKFinger SDK V10.0-Windows-Lite",
        "C:\ZKFinger10",
        "C:\ZKTeco",
        "C:\Program Files\ZKFingerSDK_Windows_Standard",
        "C:\Program Files (x86)\ZKFingerSDK_Windows_Standard",
        "C:\Program Files\ZKTeco",
        "C:\Program Files (x86)\ZKTeco",
        "$env:SystemRoot\System32",
        "$env:SystemRoot\SysWOW64"
    ) | ForEach-Object { Add-Root $_ }

    Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -and (Test-Path $_.Root) } | ForEach-Object {
        $base = $_.Root.TrimEnd('\')
        @("$base\Downloads", "$base\SDK", "$base\Drivers", "$base\ZKFinger10", "$base\ZKTeco") |
            ForEach-Object { Add-Root $_ }
        try {
            Get-ChildItem -LiteralPath "$base\" -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match "ZK|ZKTeco|Finger|SDK" } |
                ForEach-Object { Add-Root $_.FullName }
        } catch { }
    }

    return $roots
}

$zkSearchPaths = Get-ZKSearchRoots

foreach ($dll in $zkDlls) {
    $dest = Join-Path $BIO_DEST $dll
    if (Test-Path $dest) { continue }

    foreach ($searchRoot in $zkSearchPaths) {
        if (-not (Test-Path $searchRoot)) { continue }
        $found = Get-ChildItem $searchRoot -Filter $dll -Recurse -ErrorAction SilentlyContinue |
                 Sort-Object { if ($_.DirectoryName -match 'x64') { 0 } else { 1 } } |
                 Select-Object -First 1
        if ($found) {
            Copy-Item $found.FullName $dest -Force
            Write-Host "  $dll incluido desde $($found.FullName)" -ForegroundColor Green
            break
        }
    }

    if (-not (Test-Path $dest)) {
        throw "$dll no encontrado. El release no puede controlar el huellero sin el SDK ZKTeco x64."
    }
}

$zkLicense = Join-Path $ROOT "vendor\zkfinger\EULA.txt"
if (Test-Path $zkLicense) {
    $licenseDir = Join-Path $DIST "THIRD-PARTY-LICENSES"
    New-Item -ItemType Directory -Path $licenseDir -Force | Out-Null
    Copy-Item -LiteralPath $zkLicense -Destination (Join-Path $licenseDir "ZKTeco-EULA.txt") -Force
}

# ── 6. README de inicio rapido ────────────────────────────────────────────────
$readme = @(
    "WOLF GYM - INICIO RAPIDO",
    "=========================",
    "",
    "REQUISITOS PREVIOS (instalar una sola vez):",
    "  1. Driver ZKTeco ZK9500 -> incluido en el CD del dispositivo o pagina oficial",
    "  2. En una PC fisica: conectar el lector directo al USB antes de abrir WolfGym.",
    "  3. Microsoft Edge WebView2 Runtime para mostrar la app dentro de WolfGym.",
    "  4. Node.js y .NET ya vienen incluidos en el paquete; no se instalan por separado.",
    "",
    "COMO INICIAR:",
    "  1. Conecte el lector de huellas USB",
    "  2. Doble clic en el acceso directo Wolf Gym o en WolfGymLauncher.exe",
    "  3. Wolf Gym se abre como aplicacion de escritorio y muestra la app dentro de su ventana.",
    "  4. Cierre la ventana con la X para detener los servicios web y biometrico.",
    "  5. Si hay una version nueva publicada en GitHub Releases, el launcher la descarga e instala automaticamente.",
    "     No requiere Git instalado ni acceso al repositorio por consola.",
    "     Si no puede descargar o instalar la actualizacion, continua con la version anterior.",
    "",
    "DIAGNOSTICO:",
    "  WolfGym.bat abre el mismo launcher. Si no inicia, revise la carpeta logs.",
    "",
    "PERFILES DESDE OTROS DISPOSITIVOS:",
    "  Abrir https://wolf-gym.com desde iPhone, laptop u otro dispositivo.",
    "  El panel local y el huellero solo escuchan en esta PC.",
    "",
    "PRIMERA VEZ / HUELLAS:",
    "  - Registrar huellas: Perfil del cliente -> Registrar huella",
    "  - Marcar entrada: En recepcion, colocar el dedo en el lector",
    "  - Si aparece codigo -1 del SDK, Windows no esta viendo el lector/driver aunque la web este abierta.",
    "",
    "CONEXION A BASE DE DATOS:",
    "  Para el paquete local, DATABASE_URL se lee de webapp\.env y se entrega al servicio biometrico al iniciar.",
    "  Para una instalacion distribuida, configure DATABASE_URL como variable de entorno o en webapp\.env.",
    "",
    "SOPORTE:",
    "  Revise los logs en la carpeta biometric\logs\"
)

Set-Content (Join-Path $DIST "README-INICIO.txt") $readme -Encoding UTF8

# ── 7. Version para auto-update ───────────────────────────────────────────────
$versionInfo = [ordered]@{
    version = $Version
    channel = "stable"
    repository = "HwanPro/Wolf-Gym"
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
}
$versionInfo | ConvertTo-Json | Set-Content (Join-Path $DIST "version.json") -Encoding UTF8

if ($CreateZip) {
    $safeVersion = ($Version -replace '[^A-Za-z0-9._-]', '-')
    $zipPath = Join-Path $ROOT "dist\WolfGym-$safeVersion.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    Write-Host "Creando ZIP para release: $zipPath" -ForegroundColor Cyan
    Compress-Archive -Path (Join-Path $DIST "*") -DestinationPath $zipPath -Force
    Write-Host "  ZIP creado OK" -ForegroundColor Green
    $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksumPath = "$zipPath.sha256"
    "$zipHash  $(Split-Path $zipPath -Leaf)" | Set-Content -LiteralPath $checksumPath -Encoding ASCII
    Write-Host "  SHA-256 creado: $checksumPath" -ForegroundColor Green
}

# Configuracion privada para ejecutar la carpeta local recien compilada. Se copia
# despues de crear el ZIP para que credenciales y secretos nunca se distribuyan.
$sourceEnv = $LocalEnvPath
$packagedEnv = Join-Path $WEB_DEST ".env"
if ($sourceEnv -and (Test-Path -LiteralPath $sourceEnv -PathType Leaf)) {
    Copy-Item -LiteralPath $sourceEnv -Destination $packagedEnv -Force
    Write-Host "Configuracion privada .env copiada a webapp para uso local." -ForegroundColor Green
} else {
    Write-Warning "Paquete sin configuracion privada. Configure webapp\.env o use -LocalEnvPath para una copia local explicita."
}

# El build local deja un acceso directo en el Escritorio. Los builds de release
# no deben crear accesos directos en el perfil de la maquina de CI.
$launcherExe = Join-Path $DIST "WolfGymLauncher.exe"
if (-not $CreateZip -and -not $NoShortcut -and (Test-Path -LiteralPath $launcherExe -PathType Leaf)) {
    try {
        $desktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
        if (-not [string]::IsNullOrWhiteSpace($desktopPath)) {
            $shortcutPath = Join-Path $desktopPath "Wolf Gym.lnk"
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = $launcherExe
            $shortcut.WorkingDirectory = $DIST
            $shortcut.IconLocation = (Join-Path $DIST "WolfGym.ico")
            $shortcut.Description = "Wolf Gym - Sistema de gimnasio"
            $shortcut.Save()
            Write-Host "Acceso directo creado: $shortcutPath" -ForegroundColor Green
        }
    } catch {
        Write-Warning "No se pudo crear el acceso directo del Escritorio: $($_.Exception.Message)"
    }
}

# ── Resumen ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Paquete listo en: $DIST" -ForegroundColor Cyan
Write-Host ""
Write-Host "Contenido:" -ForegroundColor Yellow
Get-ChildItem $DIST | ForEach-Object {
    $size = if ($_.PSIsContainer) {
        $bytes = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum
        "$([math]::Round($bytes / 1MB, 1)) MB"
    } else {
        "$([math]::Round($_.Length / 1KB, 1)) KB"
    }
    Write-Host "  $($_.Name)  ($size)" -ForegroundColor Gray
}
Write-Host ""
if ($CreateZip) {
    Write-Host ("Para distribuir: use el ZIP generado en dist\WolfGym-{0}.zip; no incluye el .env local." -f (($Version -replace '[^A-Za-z0-9._-]', '-'))) -ForegroundColor Cyan
} else {
    if ($LocalEnvPath) {
        Write-Host "La carpeta incluye .env privado para uso local. No la comparta directamente; el ZIP se genera antes de copiar esa configuracion." -ForegroundColor Cyan
    } else {
        Write-Host "Carpeta sin .env privado. Configure el entorno del equipo antes de iniciar." -ForegroundColor Cyan
    }
}
