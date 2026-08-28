#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$NoTerminal
)

$ErrorActionPreference = "Stop"
$sourceDir = $PSScriptRoot
$repoRoot = Split-Path (Split-Path $sourceDir -Parent) -Parent
$cliDir = Join-Path $env:LOCALAPPDATA "WolfGym\cli"

New-Item -ItemType Directory -Path $cliDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir "wolfgym.ps1") -Destination (Join-Path $cliDir "wolfgym.ps1") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "wolfgym.cmd") -Destination (Join-Path $cliDir "wolfgym.cmd") -Force
Set-Content -LiteralPath (Join-Path $cliDir "source-root.txt") -Value $repoRoot -Encoding UTF8

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathParts = @($userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$alreadyPresent = $pathParts | Where-Object { $_.TrimEnd('\') -ieq $cliDir.TrimEnd('\') }
if (-not $alreadyPresent) {
    $newPath = (@($pathParts) + $cliDir) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}

if (($env:Path -split ';') -notcontains $cliDir) {
    $env:Path = "$cliDir;$env:Path"
}

Write-Host ""
Write-Host "Comando Wolf Gym instalado." -ForegroundColor Green
Write-Host "Ya puedes ejecutar: wolfgym download" -ForegroundColor Yellow
Write-Host ""

if (-not $NoTerminal) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "set PATH=$cliDir;%PATH% && wolfgym help"
}
