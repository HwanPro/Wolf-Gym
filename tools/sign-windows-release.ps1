#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CertificatePath,

    [Parameter(Mandatory = $true)]
    [Security.SecureString]$CertificatePassword,

    [string]$PackageDir = "",
    [string]$Version = "v0.2.0",
    [string]$TimestampServer = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($PackageDir)) {
    $PackageDir = Join-Path $root "dist\WolfGym"
}

$packageRoot = (Resolve-Path -LiteralPath $PackageDir).Path
$certificateFile = (Resolve-Path -LiteralPath $CertificatePath).Path
$certificate = Import-PfxCertificate `
    -FilePath $certificateFile `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -Password $CertificatePassword `
    -Exportable

if (-not $certificate.HasPrivateKey) {
    throw "El certificado no contiene una clave privada para firmar codigo."
}

$targets = @(
    "WolfGymLauncher.exe",
    "biometric\WolfGym.BiometricService.exe",
    "biometric\WolfGym.BiometricService.dll",
    "biometric\libzkfp.dll",
    "biometric\libzkfpcsharp.dll"
)

try {
    foreach ($relativePath in $targets) {
        $target = Join-Path $packageRoot $relativePath
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            throw "No se encontro el archivo requerido para firmar: $relativePath"
        }

        $signature = Set-AuthenticodeSignature `
            -FilePath $target `
            -Certificate $certificate `
            -HashAlgorithm SHA256 `
            -TimestampServer $TimestampServer

        if (-not $signature.SignerCertificate) {
            throw "No se pudo firmar $relativePath. Estado: $($signature.Status)"
        }
        Write-Host "Firmado: $relativePath" -ForegroundColor Green
    }

    $safeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
    $zipPath = Join-Path $root "dist\WolfGym-$safeVersion.zip"
    Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -Force
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $(Split-Path $zipPath -Leaf)" |
        Set-Content -LiteralPath "$zipPath.sha256" -Encoding ASCII

    Write-Host "Release firmado: $zipPath" -ForegroundColor Green
    Write-Host "Checksum: $zipPath.sha256" -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force -ErrorAction SilentlyContinue
}
