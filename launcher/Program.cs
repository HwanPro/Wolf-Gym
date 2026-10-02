using System.Diagnostics;
using System.Data.Common;
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

    internal static string AppUrl => WebUrl;

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private static readonly HttpClient UpdateHttp = new() { Timeout = TimeSpan.FromMinutes(20) };
    private static readonly List<Process> StartedProcesses = [];
    private static string _logDir = "";
    private static string _rootDir = "";
    private static bool _shutdown;

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new LauncherForm(args));
    }

    internal static async Task<bool> StartAsync(
        string[] args,
        Action<string> setStatus,
        CancellationToken cancellationToken)
    {
        _rootDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        _logDir = Path.Combine(_rootDir, "logs");
        Directory.CreateDirectory(_logDir);
        _shutdown = false;
        setStatus("Verificando actualizaciones...");

        if (!args.Contains("--skip-update", StringComparer.OrdinalIgnoreCase))
        {
            var updateStarted = await CheckAndInstallUpdateAsync(_rootDir, setStatus);
            cancellationToken.ThrowIfCancellationRequested();
            if (updateStarted) return true;
        }

        var bioDir = Path.Combine(_rootDir, "biometric");
        var bioExe = Path.Combine(bioDir, "WolfGym.BiometricService.exe");
        var webDir = Path.Combine(_rootDir, "webapp");
        var nodeExe = Path.Combine(_rootDir, "runtime", "node.exe");
        var nextCli = Path.Combine(webDir, "node_modules", "next", "dist", "bin", "next");

        if (!File.Exists(bioExe))
        {
            throw new FileNotFoundException("No existe el servicio biométrico.", bioExe);
        }

        if (!Directory.Exists(webDir))
        {
            throw new DirectoryNotFoundException($"No existe la carpeta webapp: {webDir}");
        }

        if (!File.Exists(nodeExe) || !File.Exists(nextCli))
        {
            throw new FileNotFoundException("La instalación no incluye el runtime web. Ejecuta 'wolfgym download' para repararla.");
        }

        cancellationToken.ThrowIfCancellationRequested();
        setStatus("Iniciando servicio biométrico...");
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
            setStatus("Servicio biométrico ya estaba activo...");
        }

        if (!await WaitFor(BioUrl, TimeSpan.FromSeconds(20), cancellationToken))
        {
            throw new TimeoutException($"El servicio biométrico no respondió. Revisa {_logDir}\\biometric.log.");
        }

        cancellationToken.ThrowIfCancellationRequested();
        setStatus("Iniciando aplicación web...");
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
            setStatus("La aplicación web ya estaba activa...");
        }

        if (!await WaitFor(WebUrl, TimeSpan.FromSeconds(45), cancellationToken))
        {
            throw new TimeoutException($"La aplicación web no respondió. Revisa {_logDir}\\web.log.");
        }

        setStatus("Cargando la aplicación...");
        return false;
    }

    internal static void Shutdown()
    {
        if (_shutdown) return;
        _shutdown = true;
        StopStartedProcesses();
        Http.Dispose();
        UpdateHttp.Dispose();
    }

    private static async Task<bool> CheckAndInstallUpdateAsync(string root, Action<string> setStatus)
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

            setStatus($"Actualizando Wolf Gym a {release.TagName}...");

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

            setStatus("Actualización verificada. Preparando reinicio...");

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
            setStatus("La actualización reiniciará Wolf Gym al terminar.");
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
        else if (name == "Biometric")
        {
            SetBiometricEnvironment(psi, Path.Combine(_rootDir, "webapp"));
        }

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.ErrorDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.Exited += (_, _) => AppendLog(logPath, $"{name} terminado con codigo {process.ExitCode}.");

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        StartedProcesses.Add(process);
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

    private static void SetBiometricEnvironment(ProcessStartInfo psi, string webDirectory)
    {
        var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
        if (string.IsNullOrWhiteSpace(databaseUrl))
        {
            foreach (var fileName in new[]
                     {
                         ".env.production.local",
                         ".env.local",
                         ".env.production",
                         ".env",
                     })
            {
                var envPath = Path.Combine(webDirectory, fileName);
                if (!File.Exists(envPath)) continue;

                var values = ReadEnvironmentFile(envPath);
                if (values.TryGetValue("DATABASE_URL", out databaseUrl) &&
                    !string.IsNullOrWhiteSpace(databaseUrl))
                {
                    break;
                }
            }
        }

        if (string.IsNullOrWhiteSpace(databaseUrl))
        {
            throw new InvalidOperationException(
                "No se encontró DATABASE_URL. Configúrala en webapp\\.env o en las variables de entorno antes de iniciar Wolf Gym.");
        }

        psi.Environment["ConnectionStrings__DefaultConnection"] =
            BuildNpgsqlConnectionString(databaseUrl);
    }

    private static Dictionary<string, string> ReadEnvironmentFile(string path)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var originalLine in File.ReadLines(path))
        {
            var line = originalLine.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("export ", StringComparison.Ordinal))
            {
                line = line[7..].TrimStart();
            }

            var separator = line.IndexOf('=');
            if (separator <= 0) continue;

            var key = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();
            if (value.Length >= 2 &&
                ((value[0] == '"' && value[^1] == '"') ||
                 (value[0] == '\'' && value[^1] == '\'')))
            {
                var quote = value[0];
                value = value[1..^1];
                if (quote == '"')
                {
                    value = value
                        .Replace("\\n", "\n", StringComparison.Ordinal)
                        .Replace("\\r", "\r", StringComparison.Ordinal)
                        .Replace("\\\"", "\"", StringComparison.Ordinal)
                        .Replace("\\\\", "\\", StringComparison.Ordinal);
                }
            }
            else
            {
                var comment = value.IndexOf(" #", StringComparison.Ordinal);
                if (comment >= 0) value = value[..comment].TrimEnd();
            }

            values[key] = value;
        }

        return values;
    }

    private static string BuildNpgsqlConnectionString(string databaseUrl)
    {
        if (!Uri.TryCreate(databaseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "postgresql" && uri.Scheme != "postgres"))
        {
            throw new InvalidOperationException(
                "DATABASE_URL debe ser una URL PostgreSQL con formato postgresql://usuario:contraseña@host/base.");
        }

        var userInfo = uri.UserInfo.Split(':', 2);
        if (userInfo.Length != 2 || string.IsNullOrWhiteSpace(uri.Host))
        {
            throw new InvalidOperationException(
                "DATABASE_URL debe incluir usuario, contraseña y host de PostgreSQL.");
        }

        var connection = new DbConnectionStringBuilder
        {
            ["Host"] = uri.Host,
            ["Database"] = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            ["Username"] = Uri.UnescapeDataString(userInfo[0]),
            ["Password"] = Uri.UnescapeDataString(userInfo[1]),
        };
        if (uri.Port > 0) connection["Port"] = uri.Port;

        var query = uri.Query.TrimStart('?');
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length != 2) continue;

            var key = Uri.UnescapeDataString(parts[0].Replace('+', ' '));
            var value = Uri.UnescapeDataString(parts[1].Replace('+', ' '));
            if (key.Equals("sslmode", StringComparison.OrdinalIgnoreCase))
            {
                connection["SSL Mode"] = value.ToLowerInvariant() switch
                {
                    "disable" => "Disable",
                    "allow" => "Allow",
                    "prefer" => "Prefer",
                    "require" => "Require",
                    "verify-ca" => "VerifyCA",
                    "verify-full" => "VerifyFull",
                    _ => throw new InvalidOperationException("DATABASE_URL contiene un valor sslmode no reconocido."),
                };
            }
            else if (key.Equals("connect_timeout", StringComparison.OrdinalIgnoreCase))
            {
                connection["Timeout"] = value;
            }
            else if (key.Equals("application_name", StringComparison.OrdinalIgnoreCase))
            {
                connection["Application Name"] = value;
            }
        }

        return connection.ConnectionString;
    }

    private static async Task<bool> WaitFor(string url, TimeSpan timeout, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (await IsUp(url))
            {
                return true;
            }

            await Task.Delay(1000, cancellationToken);
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

        StopKnownRuntimeProcesses();
    }

    private static void StopKnownRuntimeProcesses()
    {
        var knownExecutables = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Path.GetFullPath(Path.Combine(_rootDir, "biometric", "WolfGym.BiometricService.exe")),
            Path.GetFullPath(Path.Combine(_rootDir, "runtime", "node.exe")),
        };

        foreach (var processName in new[] { "WolfGym.BiometricService", "node" })
        {
            try
            {
                foreach (var process in Process.GetProcessesByName(processName))
                {
                    try
                    {
                        if (process.HasExited) continue;
                        var executablePath = process.MainModule?.FileName;
                        if (string.IsNullOrWhiteSpace(executablePath) ||
                            !knownExecutables.Contains(Path.GetFullPath(executablePath)))
                        {
                            continue;
                        }

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
