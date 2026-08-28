#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"
$Repository = "HwanPro/Wolf-Gym"
$ReleaseApi = "https://api.github.com/repos/$Repository/releases/latest"
$DefaultInstallDir = if ($env:WOLFGYM_HOME) {
    $env:WOLFGYM_HOME
} else {
    Join-Path $env:LOCALAPPDATA "Programs\WolfGym"
}

function Write-Title {
    Write-Host ""
    Write-Host " WOLF GYM" -ForegroundColor Yellow
    Write-Host " Instalador y actualizador para Windows" -ForegroundColor DarkGray
    Write-Host ""
}

function Test-Flag([string]$Name) {
    return $Arguments -contains $Name
}

function Get-Option([string]$Name, [string]$DefaultValue) {
    for ($index = 0; $index -lt $Arguments.Count; $index++) {
        if ($Arguments[$index] -eq $Name -and $index + 1 -lt $Arguments.Count) {
            return $Arguments[$index + 1]
        }
    }
    return $DefaultValue
}

function Get-LatestRelease {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{
        Accept = "application/vnd.github+json"
        "User-Agent" = "WolfGymCLI/1.0"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    try {
        return Invoke-RestMethod -Uri $ReleaseApi -Headers $headers -TimeoutSec 20
    } catch {
        throw "No se pudo consultar GitHub Releases. Comprueba la conexion a internet. $($_.Exception.Message)"
    }
}

function Get-ReleasePackage($Release) {
    $package = $Release.assets |
        Where-Object {
            $_.name -match '^WolfGym-v?[0-9].*\.zip$' -and
            $_.browser_download_url
        } |
        Select-Object -First 1

    if (-not $package) {
        throw "La version $($Release.tag_name) no contiene un paquete WolfGym para Windows."
    }

    $checksum = $Release.assets |
        Where-Object { $_.name -eq "$($package.name).sha256" } |
        Select-Object -First 1

    return [PSCustomObject]@{
        Package = $package
        Checksum = $checksum
    }
}

function Save-RemoteFile([string]$Uri, [string]$Destination) {
    $headers = @{ "User-Agent" = "WolfGymCLI/1.0" }
    $oldProgress = $ProgressPreference
    try {
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $Uri -Headers $headers -OutFile $Destination -UseBasicParsing -TimeoutSec 1800
    } finally {
        $ProgressPreference = $oldProgress
    }
}

function Assert-PackageChecksum($ChecksumAsset, [string]$ZipPath) {
    if (-not $ChecksumAsset) {
        throw "El release no incluye el archivo SHA-256 requerido. No se instalara un paquete sin verificar."
    }

    $checksumPath = "$ZipPath.sha256"
    Save-RemoteFile -Uri $ChecksumAsset.browser_download_url -Destination $checksumPath
    $expectedLine = (Get-Content -LiteralPath $checksumPath -Raw).Trim()
    $expected = ($expectedLine -split '\s+')[0].ToUpperInvariant()
    $actual = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToUpperInvariant()

    if ($expected -notmatch '^[A-F0-9]{64}$' -or $actual -ne $expected) {
        throw "La verificacion SHA-256 fallo. El paquete descargado no es confiable."
    }

    Write-Host "  Integridad SHA-256 verificada" -ForegroundColor Green
}

function Get-PayloadRoot([string]$StageDir) {
    $candidates = @($StageDir, (Join-Path $StageDir "WolfGym"))
    foreach ($candidate in $candidates) {
        if (
            (Test-Path (Join-Path $candidate "WolfGymLauncher.exe")) -and
            (Test-Path (Join-Path $candidate "webapp")) -and
            (Test-Path (Join-Path $candidate "biometric")) -and
            (Test-Path (Join-Path $candidate "runtime\node.exe")) -and
            (Test-Path (Join-Path $candidate "version.json"))
        ) {
            return $candidate
        }
    }
    throw "El ZIP no tiene la estructura esperada de WolfGym."
}

function Stop-WolfGym([string]$InstallDir) {
    Get-Process -Name "WolfGymLauncher", "WolfGym.BiometricService" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue

    try {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch {
        # La instalacion puede continuar aunque WMI no este disponible.
    }
    Start-Sleep -Milliseconds 700
}

function Restore-LocalConfiguration([string]$BackupDir, [string]$InstallDir) {
    if (-not (Test-Path $BackupDir)) { return }
    $preserve = @(
        "logs",
        "webapp\.env",
        "webapp\.env.local",
        "biometric\appsettings.json"
    )

    foreach ($relativePath in $preserve) {
        $source = Join-Path $BackupDir $relativePath
        if (-not (Test-Path $source)) { continue }
        $destination = Join-Path $InstallDir $relativePath
        New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    }
}

function Protect-PrivateFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $acl = Get-Acl -LiteralPath $Path
        $acl.SetAccessRuleProtection($true, $false)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $identity,
            [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow
        )
        $acl.SetAccessRule($rule)
        Set-Acl -LiteralPath $Path -AclObject $acl
    } catch {
        Write-Warning "No se pudieron restringir los permisos de $Path."
    }
}

function Test-BiometricConnection([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        return -not [string]::IsNullOrWhiteSpace($config.ConnectionStrings.DefaultConnection)
    } catch {
        return $false
    }
}

function Initialize-LocalConfiguration([string]$InstallDir) {
    $sourceRootFile = Join-Path $PSScriptRoot "source-root.txt"
    $sourceRoot = if (Test-Path -LiteralPath $sourceRootFile) {
        (Get-Content -LiteralPath $sourceRootFile -Raw).Trim()
    } else {
        ""
    }

    $webConfig = Join-Path $InstallDir "webapp\.env"
    $biometricConfig = Join-Path $InstallDir "biometric\appsettings.json"
    if (-not (Test-Path -LiteralPath $webConfig -PathType Leaf) -and $sourceRoot) {
        $sourceWebConfig = Join-Path $sourceRoot ".env"
        if (Test-Path -LiteralPath $sourceWebConfig -PathType Leaf) {
            Copy-Item -LiteralPath $sourceWebConfig -Destination $webConfig -Force
        }
    }
    if (-not (Test-BiometricConnection $biometricConfig) -and $sourceRoot) {
        $sourceBiometricConfig = Join-Path $sourceRoot "biometric-service\appsettings.Production.json"
        if (Test-Path -LiteralPath $sourceBiometricConfig -PathType Leaf) {
            Copy-Item -LiteralPath $sourceBiometricConfig -Destination $biometricConfig -Force
        }
    }

    Protect-PrivateFile $webConfig
    Protect-PrivateFile $biometricConfig

    $missing = @()
    if (-not (Test-Path -LiteralPath $webConfig -PathType Leaf)) {
        $missing += "webapp\.env"
    }
    if (-not (Test-BiometricConnection $biometricConfig)) {
        $missing += "biometric\appsettings.json"
    }
    if ($missing.Count -gt 0) {
        Write-Warning "Falta configuracion privada: $($missing -join ', '). La aplicacion se instalo, pero no se iniciara."
        return $false
    }
    Write-Host "  Configuracion privada local preservada" -ForegroundColor Green
    return $true
}

function New-WolfGymShortcut([string]$ShortcutPath, [string]$LauncherPath) {
    New-Item -ItemType Directory -Path (Split-Path $ShortcutPath) -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $LauncherPath
    $shortcut.WorkingDirectory = Split-Path $LauncherPath
    $shortcut.IconLocation = "$LauncherPath,0"
    $shortcut.Description = "Wolf Gym - Gestion y control biometrico"
    $shortcut.Save()
}

function Install-Shortcuts([string]$InstallDir) {
    $launcher = Join-Path $InstallDir "WolfGymLauncher.exe"
    $desktop = [Environment]::GetFolderPath("Desktop")
    $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Wolf Gym"
    New-WolfGymShortcut -ShortcutPath (Join-Path $desktop "Wolf Gym.lnk") -LauncherPath $launcher
    New-WolfGymShortcut -ShortcutPath (Join-Path $startMenu "Wolf Gym.lnk") -LauncherPath $launcher
    Write-Host "  Accesos directos creados con el logo de Wolf Gym" -ForegroundColor Green
}

function Install-LatestRelease {
    $installDir = Get-Option "--install-dir" $DefaultInstallDir
    $dryRun = Test-Flag "--dry-run"
    $noStart = Test-Flag "--no-start"

    Write-Title
    Write-Host "Consultando la ultima version estable..." -ForegroundColor Cyan
    $release = Get-LatestRelease
    $assets = Get-ReleasePackage $release
    $currentVersion = "No instalada"
    $versionPath = Join-Path $installDir "version.json"
    if (Test-Path $versionPath) {
        try { $currentVersion = (Get-Content $versionPath -Raw | ConvertFrom-Json).version } catch { }
    }

    Write-Host "  Instalada: $currentVersion"
    Write-Host "  Disponible: $($release.tag_name)"
    Write-Host "  Destino: $installDir"
    Write-Host "  Paquete: $($assets.Package.name)"
    Write-Host "  SHA-256: $(if ($assets.Checksum) { 'disponible' } else { 'no disponible' })"

    if ($dryRun) {
        Write-Host ""
        Write-Host "Simulacion completada; no se descargaron archivos." -ForegroundColor Yellow
        return
    }

    $tempRoot = Join-Path $env:TEMP ("WolfGym-install-" + [Guid]::NewGuid().ToString("N"))
    $zipPath = Join-Path $tempRoot $assets.Package.name
    $stageDir = Join-Path $tempRoot "stage"
    $backupDir = "$installDir.backup"
    $installed = $false

    try {
        New-Item -ItemType Directory -Path $tempRoot, $stageDir -Force | Out-Null
        Write-Host "Descargando $($release.tag_name)..." -ForegroundColor Cyan
        Save-RemoteFile -Uri $assets.Package.browser_download_url -Destination $zipPath
        Assert-PackageChecksum -ChecksumAsset $assets.Checksum -ZipPath $zipPath

        Write-Host "Preparando instalacion..." -ForegroundColor Cyan
        Expand-Archive -LiteralPath $zipPath -DestinationPath $stageDir -Force
        $payload = Get-PayloadRoot $stageDir
        Stop-WolfGym $installDir

        if (Test-Path $backupDir) {
            Remove-Item -LiteralPath $backupDir -Recurse -Force
        }
        if (Test-Path $installDir) {
            Move-Item -LiteralPath $installDir -Destination $backupDir
        }

        New-Item -ItemType Directory -Path (Split-Path $installDir) -Force | Out-Null
        if ($payload -eq $stageDir) {
            Move-Item -LiteralPath $stageDir -Destination $installDir
        } else {
            Move-Item -LiteralPath $payload -Destination $installDir
        }
        Restore-LocalConfiguration -BackupDir $backupDir -InstallDir $installDir
        $configurationReady = Initialize-LocalConfiguration -InstallDir $installDir
        Install-Shortcuts $installDir
        $installed = $true

        if (Test-Path $backupDir) {
            Remove-Item -LiteralPath $backupDir -Recurse -Force
        }

        Write-Host ""
        Write-Host "Wolf Gym $($release.tag_name) quedo instalado correctamente." -ForegroundColor Green
        if (-not $noStart -and $configurationReady) {
            Start-Process -FilePath (Join-Path $installDir "WolfGymLauncher.exe") -WorkingDirectory $installDir
        }
    } catch {
        if (-not $installed -and (Test-Path $backupDir)) {
            if (Test-Path $installDir) {
                Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
            }
            Move-Item -LiteralPath $backupDir -Destination $installDir -Force
        }
        throw
    } finally {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Start-WolfGym {
    $installDir = Get-Option "--install-dir" $DefaultInstallDir
    $launcher = Join-Path $installDir "WolfGymLauncher.exe"
    if (-not (Test-Path $launcher)) {
        throw "Wolf Gym no esta instalado. Ejecuta: wolfgym download"
    }
    Start-Process -FilePath $launcher -WorkingDirectory $installDir
}

function Show-Status {
    $installDir = Get-Option "--install-dir" $DefaultInstallDir
    Write-Title
    $versionPath = Join-Path $installDir "version.json"
    if (-not (Test-Path $versionPath)) {
        Write-Host "Estado: no instalado" -ForegroundColor Yellow
        Write-Host "Ejecuta: wolfgym download"
        return
    }
    $version = (Get-Content $versionPath -Raw | ConvertFrom-Json).version
    $launcherRunning = [bool](Get-Process -Name "WolfGymLauncher" -ErrorAction SilentlyContinue)
    $biometricRunning = [bool](Get-Process -Name "WolfGym.BiometricService" -ErrorAction SilentlyContinue)
    Write-Host "Version: $version"
    Write-Host "Carpeta: $installDir"
    Write-Host "Launcher: $(if ($launcherRunning) { 'activo' } else { 'detenido' })"
    Write-Host "Biometrico: $(if ($biometricRunning) { 'activo' } else { 'detenido' })"
}

function Show-Help {
    Write-Title
    Write-Host "Uso: wolfgym <comando> [opciones]"
    Write-Host ""
    Write-Host "Comandos:"
    Write-Host "  download          Descarga o actualiza la ultima version estable"
    Write-Host "  update            Alias de download"
    Write-Host "  start             Inicia Wolf Gym"
    Write-Host "  status            Muestra la version y los procesos activos"
    Write-Host "  help              Muestra esta ayuda"
    Write-Host ""
    Write-Host "Opciones de download:"
    Write-Host "  --dry-run         Consulta la version sin descargar"
    Write-Host "  --no-start        Instala sin abrir la aplicacion"
    Write-Host "  --install-dir X   Usa otra carpeta de instalacion"
}

try {
    switch ($Command.ToLowerInvariant()) {
        "download" { Install-LatestRelease }
        "update" { Install-LatestRelease }
        "start" { Start-WolfGym }
        "status" { Show-Status }
        "help" { Show-Help }
        "--help" { Show-Help }
        "-h" { Show-Help }
        default { throw "Comando desconocido: $Command. Ejecuta 'wolfgym help'." }
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
