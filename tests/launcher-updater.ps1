$ErrorActionPreference = 'Stop'
$taskProject = Split-Path $PSScriptRoot -Parent
$taskWorkspace = [IO.Path]::GetFullPath((Join-Path $taskProject 'outputs\launcher-updater-tests'))
New-Item -ItemType Directory -Path $taskWorkspace -Force | Out-Null
$taskSource = Get-Content -LiteralPath (Join-Path $taskProject 'launcher\Program.cs') -Raw
$taskScript = ($taskSource -split 'var script = """',2)[1] -split '""";',2 | Select-Object -First 1
if ($taskScript -match '\[int\]\$Pid\b') { throw 'Reserved PID parameter remains' }
$taskScriptPath = Join-Path $taskWorkspace 'updater-under-test.ps1'
Set-Content -LiteralPath $taskScriptPath -Value $taskScript -Encoding UTF8
$taskRuns = Join-Path $taskWorkspace ('updater-fixtures-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRuns | Out-Null
$global:taskLaunchCount=0
function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory) $global:taskLaunchCount++ }
function Copy-Item {
    [CmdletBinding()]param([string]$Path,[string]$LiteralPath,[string]$Destination,[switch]$Recurse,[switch]$Force)
    if($global:taskFailPayload -and $Path -and $Path.EndsWith('\*')) { throw 'SIMULATED_PAYLOAD_COPY_FAILURE' }
    if($global:taskFailBackup -and $Destination -like '*_backup_*') { throw 'SIMULATED_BACKUP_COPY_FAILURE' }
    Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
}
$taskResults=@()
foreach($taskCase in @('success','invalid-zip','payload-failure','backup-failure')) {
    $taskCaseDir=Join-Path $taskRuns $taskCase
    $taskInstall=Join-Path $taskCaseDir 'install'
    $taskPayload=Join-Path $taskCaseDir 'payload'
    foreach($taskDir in @($taskInstall,$taskPayload)) {
        New-Item -ItemType Directory -Path (Join-Path $taskDir 'webapp'),(Join-Path $taskDir 'biometric'),(Join-Path $taskDir 'runtime') -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $taskDir 'WolfGymLauncher.exe') -Value 'test fixture, never executed'
        Set-Content -LiteralPath (Join-Path $taskDir 'runtime\node.exe') -Value 'test fixture, never executed'
        Set-Content -LiteralPath (Join-Path $taskDir 'webapp\package.json') -Value '{}'
        Set-Content -LiteralPath (Join-Path $taskDir 'biometric\service.txt') -Value 'test fixture'
        Set-Content -LiteralPath (Join-Path $taskDir 'version.json') -Value '{"version":"test"}'
    }
    Set-Content -LiteralPath (Join-Path $taskInstall 'original.txt') -Value 'original'
    Set-Content -LiteralPath (Join-Path $taskPayload 'new.txt') -Value 'new'
    $taskPrivate=@('webapp\.env','webapp\.env.local','webapp\.env.production','webapp\.env.production.local','biometric\appsettings.json')
    foreach($taskFile in $taskPrivate) { Set-Content -LiteralPath (Join-Path $taskInstall $taskFile) -Value ('local fixture '+$taskFile) }
    $taskZip=Join-Path $taskCaseDir 'release.zip'
    if($taskCase -eq 'invalid-zip') {
        Compress-Archive -LiteralPath (Join-Path $taskPayload 'new.txt') -DestinationPath $taskZip
    } else { Compress-Archive -Path (Join-Path $taskPayload '*') -DestinationPath $taskZip }
    if (-not ([IO.Path]::GetFullPath($taskInstall)).StartsWith($taskWorkspace+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Invalid fixture path'}
    $global:taskFailPayload=$taskCase -eq 'payload-failure'
    $global:taskFailBackup=$taskCase -eq 'backup-failure'
    & $taskScriptPath -Root $taskInstall -Zip $taskZip -LauncherPid 2147483647 -Log (Join-Path $taskCaseDir 'updater.log')
    if($taskCase -eq 'success') {
        if(-not(Test-Path -LiteralPath (Join-Path $taskInstall 'new.txt')) -or (Test-Path -LiteralPath (Join-Path $taskInstall 'original.txt'))) {throw 'Payload not replaced'}
    } else {
        if((Get-Content -LiteralPath (Join-Path $taskInstall 'original.txt') -Raw).Trim() -ne 'original') {throw 'Original lost'}
    }
    foreach($taskFile in $taskPrivate) {
        if((Get-Content -LiteralPath (Join-Path $taskInstall $taskFile) -Raw).Trim() -ne ('local fixture '+$taskFile)) {throw "Configuration lost: $taskFile"}
    }
    $taskResults += [pscustomobject]@{test=$taskCase;passed=$true;privateConfigurationsPreserved=5}
}
if($global:taskLaunchCount -ne 4){throw 'Restart was not requested for every case'}
$taskResults | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskWorkspace 'updater-results.json') -Encoding UTF8
$taskResults | Format-Table


