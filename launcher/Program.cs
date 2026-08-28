using System.Diagnostics;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WolfGymLauncher;

internal static class Program
{
    private const string WebUrl = "http://127.0.0.1:3000";
    private const string BioUrl = "http://127.0.0.1:8001/health";
    private const string ReleaseApiUrl = "https://api.github.com/repos/HwanPro/Wolf-Gym/releases/latest";

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private static readonly HttpClient UpdateHttp = new() { Timeout = TimeSpan.FromMinutes(20) };
    private static readonly List<Process> StartedProcesses = [];
    private static string _logDir = "";

    private static async Task<int> Main(string[] args)
    {
        Console.Title = "WolfGym Launcher";
        var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        _logDir = Path.Combine(root, "logs");
        Directory.CreateDirectory(_logDir);

        Console.WriteLine("==========================================");
        Console.WriteLine(" WOLF GYM - Iniciando sistema");
        Console.WriteLine("==========================================");
        Console.WriteLine();
        Console.WriteLine($"Carpeta: {root}");

        if (!args.Contains("--skip-update", StringComparer.OrdinalIgnoreCase))
        {
            var updateStarted = await CheckAndInstallUpdateAsync(root);
            if (updateStarted)
            {
                // Si hay instancia previa de web/biometrico corriendo, detenerla antes de salir.
                StopKnownRuntimeProcesses();
                Http.Dispose();
                UpdateHttp.Dispose();
                return 0;
            }
        }

        var bioDir = Path.Combine(root, "biometric");
        var bioExe = Path.Combine(bioDir, "WolfGym.BiometricService.exe");
        var webDir = Path.Combine(root, "webapp");
        var nodeExe = Path.Combine(root, "runtime", "node.exe");
        var nextCli = Path.Combine(webDir, "node_modules", "next", "dist", "bin", "next");

        if (!File.Exists(bioExe))
        {
            Fail($"No existe el servicio biometrico: {bioExe}");
            return 1;
        }

        if (!Directory.Exists(webDir))
        {
            Fail($"No existe la carpeta webapp: {webDir}");
            return 1;
        }

        if (!File.Exists(nodeExe) || !File.Exists(nextCli))
        {
            Fail("La instalacion no incluye el runtime web. Ejecuta 'wolfgym download' para repararla.");
            return 1;
        }

        if (!await IsUp(BioUrl))
        {
            StartProcess(
                "Biometric",
                bioExe,
                "",
                bioDir,
                Path.Combine(_logDir, "biometric.log"));
        }
        else
        {
            Console.WriteLine("Servicio biometrico ya estaba activo.");
        }

        await WaitFor("Servicio biometrico", BioUrl, TimeSpan.FromSeconds(20));

        if (!await IsUp(WebUrl))
        {
            StartProcess(
                "Web",
                nodeExe,
                $"\"{nextCli}\" start -p 3000",
                webDir,
                Path.Combine(_logDir, "web.log"));
        }
        else
        {
            Console.WriteLine("App web ya estaba activa.");
        }

        var webReady = await WaitFor("App web", WebUrl, TimeSpan.FromSeconds(45));
        if (webReady)
        {
            Process.Start(new ProcessStartInfo(WebUrl) { UseShellExecute = true });
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("La web no respondio a tiempo. Revise logs\\web.log.");
            Console.ResetColor();
        }

        Console.WriteLine();
        Console.WriteLine("Presione ENTER para detener WolfGym.");
        Console.ReadLine();

        StopStartedProcesses();
        Http.Dispose();
        UpdateHttp.Dispose();
        return 0;
    }

    private static async Task<bool> CheckAndInstallUpdateAsync(string root)
    {
        try
        {
            UpdateHttp.DefaultRequestHeaders.UserAgent.ParseAdd("WolfGymLauncher/1.0");
            var releaseJson = await UpdateHttp.GetStringAsync(ReleaseApiUrl);
            var release = JsonSerializer.Deserialize<GitHubRelease>(releaseJson);
            if (release is null || release.Draft || release.Prerelease || string.IsNullOrWhiteSpace(release.TagName))
                return false;

            var currentVersion = ReadCurrentVersion(root);
            if (!IsNewerVersion(release.TagName, currentVersion))
                return false;

            var asset = release.Assets?
                .Where(a => !string.IsNullOrWhiteSpace(a.BrowserDownloadUrl))
                .FirstOrDefault(a =>
                    a.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) &&
                    a.Name.Contains("WolfGym", StringComparison.OrdinalIgnoreCase));

            if (asset?.BrowserDownloadUrl is null)
                return false;

            var checksumAsset = release.Assets?
                .FirstOrDefault(a => string.Equals(
                    a.Name,
                    $"{asset.Name}.sha256",
                    StringComparison.OrdinalIgnoreCase));

            if (checksumAsset?.BrowserDownloadUrl is null)
            {
                AppendLog(
                    Path.Combine(_logDir, "updater.log"),
                    $"Release {release.TagName} omitido: no incluye checksum SHA-256.");
                return false;
            }

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine();
            Console.WriteLine($"Actualizacion disponible: {currentVersion} -> {release.TagName}");
            Console.WriteLine("Descargando paquete desde GitHub Releases. Si falla, se usara la version instalada.");
            Console.ResetColor();

            var zipPath = Path.Combine(Path.GetTempPath(), $"WolfGym-{release.TagName}.zip");
            await using (var input = await UpdateHttp.GetStreamAsync(asset.BrowserDownloadUrl))
            await using (var output = File.Create(zipPath))
            {
                await input.CopyToAsync(output);
            }

            var checksumText = await UpdateHttp.GetStringAsync(checksumAsset.BrowserDownloadUrl);
            var expectedHash = checksumText
                .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault()?
                .Trim()
                .ToUpperInvariant();
            await using var packageStream = File.OpenRead(zipPath);
            var actualHash = Convert.ToHexString(await SHA256.HashDataAsync(packageStream));

            if (expectedHash?.Length != 64 || !string.Equals(expectedHash, actualHash, StringComparison.Ordinal))
            {
                File.Delete(zipPath);
                throw new InvalidDataException("El checksum SHA-256 del paquete no coincide.");
            }

            Console.WriteLine("Integridad SHA-256 verificada.");

            var scriptPath = WriteUpdateScript(root, zipPath);
            var updaterLog = Path.Combine(_logDir, "updater.log");
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -Root \"{root}\" -Zip \"{zipPath}\" -Pid {Environment.ProcessId} -Log \"{updaterLog}\"",
                UseShellExecute = true,
                WorkingDirectory = root,
            };
            var updaterProcess = Process.Start(psi);
            if (updaterProcess is null)
            {
                AppendLog(updaterLog, "No se pudo iniciar el actualizador. Se continua con la version instalada.");
                return false;
            }

            await Task.Delay(1500);
            updaterProcess.Refresh();
            if (updaterProcess.HasExited && updaterProcess.ExitCode != 0)
            {
                AppendLog(updaterLog, $"Actualizador finalizo demasiado pronto. ExitCode={updaterProcess.ExitCode}. Se continua con la version instalada.");
                return false;
            }

            AppendLog(updaterLog, $"Actualizador iniciado. PID={updaterProcess.Id}");
            Console.WriteLine("El actualizador terminara la instalacion y reabrira WolfGym.");
            return true;
        }
        catch (Exception ex)
        {
            AppendLog(Path.Combine(_logDir, "updater.log"), $"Update skipped; continuing with installed version: {ex.Message}");
            return false;
        }
    }

    private static string ReadCurrentVersion(string root)
    {
        try
        {
            var path = Path.Combine(root, "version.json");
            if (!File.Exists(path)) return "0.0.0";
            var version = JsonSerializer.Deserialize<VersionFile>(File.ReadAllText(path));
            return string.IsNullOrWhiteSpace(version?.Version) ? "0.0.0" : version.Version;
        }
        catch
        {
            return "0.0.0";
        }
    }

    private static bool IsNewerVersion(string latest, string current)
    {
        var latestParts = ParseVersion(latest);
        var currentParts = ParseVersion(current);
        for (var i = 0; i < Math.Max(latestParts.Length, currentParts.Length); i++)
        {
            var left = i < latestParts.Length ? latestParts[i] : 0;
            var right = i < currentParts.Length ? currentParts[i] : 0;
            if (left > right) return true;
            if (left < right) return false;
        }
        return false;
    }

    private static int[] ParseVersion(string version)
    {
        var clean = version.Trim().TrimStart('v', 'V');
        var dash = clean.IndexOfAny(['-', '+']);
        if (dash >= 0) clean = clean[..dash];
        return clean
            .Split('.', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => int.TryParse(part, out var n) ? n : 0)
            .ToArray();
    }

    private static string WriteUpdateScript(string root, string zipPath)
    {
        var scriptPath = Path.Combine(Path.GetTempPath(), $"WolfGymUpdater-{Guid.NewGuid():N}.ps1");
        var script = """
param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][string]$Zip,
    [Parameter(Mandatory=$true)][int]$Pid,
    [Parameter(Mandatory=$true)][string]$Log
)

$ErrorActionPreference = "Stop"
$launcher = Join-Path $Root "WolfGymLauncher.exe"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stage = Join-Path $env:TEMP ("WolfGym-stage-" + [guid]::NewGuid().ToString("N"))
$backup = Join-Path $Root ("_backup_" + $timestamp)
$backupReady = $false
$preserve = @(
    "logs",
    "biometric\appsettings.json",
    "webapp\.env",
    "webapp\.env.local"
)
$preserveDir = Join-Path $env:TEMP ("WolfGym-preserve-" + [guid]::NewGuid().ToString("N"))

function Write-Log([string]$message) {
    try {
        $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
        Add-Content -Path $Log -Value $line -Encoding UTF8
    } catch { }
}

function Remove-CurrentPayload {
    Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike "_backup_*" } |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
        }
}

function Restore-Backup {
    if (-not $backupReady -or -not (Test-Path $backup)) {
        Write-Log "No hay backup listo; se conserva la instalacion actual."
        return
    }

    Write-Log "Restaurando version anterior desde backup: $backup"
    Remove-CurrentPayload
    Get-ChildItem -LiteralPath $backup -Force |
        ForEach-Object {
            Move-Item -LiteralPath $_.FullName -Destination (Join-Path $Root $_.Name) -Force -ErrorAction Stop
        }
}

Write-Host "Actualizando WolfGym..." -ForegroundColor Yellow
Write-Log "Inicio de actualizacion. Root=$Root Zip=$Zip"
while (Get-Process -Id $Pid -ErrorAction SilentlyContinue) {
    Start-Sleep -Milliseconds 300
}

try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    New-Item -ItemType Directory -Path $preserveDir -Force | Out-Null

    foreach ($item in $preserve) {
        $src = Join-Path $Root $item
        if (Test-Path $src) {
            $dst = Join-Path $preserveDir $item
            New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
            Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
        }
    }

    Expand-Archive -LiteralPath $Zip -DestinationPath $stage -Force
    $payload = $stage
    $nested = Join-Path $stage "WolfGym"
    if (Test-Path $nested) { $payload = $nested }
    if (-not (Test-Path (Join-Path $payload "WolfGymLauncher.exe"))) {
        throw "ZIP invalido: no contiene WolfGymLauncher.exe"
    }
    if (-not (Test-Path (Join-Path $payload "webapp"))) {
        throw "ZIP invalido: no contiene carpeta webapp"
    }
    if (-not (Test-Path (Join-Path $payload "biometric"))) {
        throw "ZIP invalido: no contiene carpeta biometric"
    }
    if (-not (Test-Path (Join-Path $payload "runtime\node.exe"))) {
        throw "ZIP invalido: no contiene runtime de Node.js"
    }
    if (-not (Test-Path (Join-Path $payload "version.json"))) {
        throw "ZIP invalido: no contiene version.json"
    }
    Write-Log "Payload validado correctamente."

    Get-Process -Name "WolfGym.BiometricService" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    try {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch {
        Write-Log "No se pudo consultar WMI para cerrar Node; se continuara con el reemplazo."
    }
    Start-Sleep -Milliseconds 700

    Get-ChildItem -LiteralPath $Root -Force |
        Where-Object { $_.Name -notlike "_backup_*" } |
        ForEach-Object {
            Move-Item -LiteralPath $_.FullName -Destination (Join-Path $backup $_.Name) -Force
        }
    $backupReady = $true
    Write-Log "Contenido actual movido a backup: $backup"

    Copy-Item -Path (Join-Path $payload "*") -Destination $Root -Recurse -Force
    Write-Log "Payload copiado a raiz."

    foreach ($item in $preserve) {
        $src = Join-Path $preserveDir $item
        if (Test-Path $src) {
            $dst = Join-Path $Root $item
            New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
            Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
        }
    }
    Write-Log "Archivos preservados restaurados."

    Write-Host "Actualizacion completada. Reiniciando..." -ForegroundColor Green
    Write-Log "Actualizacion completada. Reiniciando launcher."
    Start-Process -FilePath $launcher -ArgumentList "--skip-update" -WorkingDirectory $Root
    try {
        Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction Stop
        $backupReady = $false
        Write-Log "Backup temporal eliminado."
    } catch {
        Write-Log ("No se pudo eliminar el backup temporal: " + $_.Exception.Message)
    }
} catch {
    Write-Host ("Error actualizando: " + $_.Exception.Message) -ForegroundColor Red
    Write-Log ("ERROR: " + $_.Exception.Message)
    Restore-Backup
    if (Test-Path $launcher) {
        Write-Log "Continuando con la version anterior tras fallo de actualizacion."
        Start-Process -FilePath $launcher -ArgumentList "--skip-update" -WorkingDirectory $Root
    }
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $preserveDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
    Write-Log "Fin de updater."
}
""";
        File.WriteAllText(scriptPath, script);
        return scriptPath;
    }

    private static Process StartProcess(string name, string fileName, string arguments, string workingDirectory, string logPath)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        if (name == "Web")
        {
            SetWebEnvironment(psi);
        }

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.ErrorDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.Exited += (_, _) => AppendLog(logPath, $"{name} terminado con codigo {process.ExitCode}.");

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        StartedProcesses.Add(process);
        Console.WriteLine($"{name} iniciado. PID: {process.Id}");
        return process;
    }

    private static void SetWebEnvironment(ProcessStartInfo psi)
    {
        psi.Environment["BIOMETRIC_CAPTURE_BASE"] = "http://127.0.0.1:8001";
        psi.Environment["BIOMETRIC_STORE_BASE"] = "http://127.0.0.1:8001";
        psi.Environment["NEXT_PUBLIC_BIOMETRIC_BASE"] = "http://127.0.0.1:8001";
        psi.Environment["NEXT_PUBLIC_KIOSK"] = "1";
        psi.Environment["NEXTAUTH_URL"] = "http://127.0.0.1:3000";
    }

    private static async Task<bool> WaitFor(string label, string url, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await IsUp(url))
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"{label}: OK");
                Console.ResetColor();
                return true;
            }

            await Task.Delay(1000);
        }

        return false;
    }

    private static async Task<bool> IsUp(string url)
    {
        try
        {
            using var response = await Http.GetAsync(url);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static void AppendLog(string path, string? line)
    {
        if (line is null) return;
        try
        {
            File.AppendAllText(path, $"[{DateTime.Now:HH:mm:ss}] {line}{Environment.NewLine}");
        }
        catch
        {
            // Logging must never kill the launcher.
        }
    }

    private static void StopStartedProcesses()
    {
        foreach (var process in StartedProcesses)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // Best-effort shutdown.
            }
            finally
            {
                process.Dispose();
            }
        }

        // Refuerzo: si quedaron procesos vivos por fuera de StartedProcesses, cerrarlos también.
        StopKnownRuntimeProcesses();
    }

    private static void StopKnownRuntimeProcesses()
    {
        foreach (var processName in new[] { "WolfGym.BiometricService", "node", "npm" })
        {
            try
            {
                foreach (var process in Process.GetProcessesByName(processName))
                {
                    try
                    {
                        if (process.HasExited) continue;
                        process.Kill(entireProcessTree: true);
                        process.WaitForExit(3000);
                    }
                    catch
                    {
                        // best effort
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }
            }
            catch
            {
                // Best-effort shutdown.
            }
        }
    }

    private static void Fail(string message)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(message);
        Console.ResetColor();
        Console.WriteLine("Presione ENTER para salir.");
        Console.ReadLine();
    }

    private sealed class VersionFile
    {
        [JsonPropertyName("version")]
        public string Version { get; set; } = "0.0.0";
    }

    private sealed class GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string TagName { get; set; } = "";

        [JsonPropertyName("draft")]
        public bool Draft { get; set; }

        [JsonPropertyName("prerelease")]
        public bool Prerelease { get; set; }

        [JsonPropertyName("assets")]
        public List<GitHubAsset> Assets { get; set; } = [];
    }

    private sealed class GitHubAsset
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("browser_download_url")]
        public string BrowserDownloadUrl { get; set; } = "";
    }
}
