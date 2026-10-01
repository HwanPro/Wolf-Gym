using System.Collections.Concurrent;
using WolfGym.BiometricService.SDK;
using WolfGym.BiometricService.Utils;

namespace WolfGym.BiometricService.Services;

public class ZKFingerService : IDisposable
{
    private IntPtr _deviceHandle = IntPtr.Zero;
    private IntPtr _dbHandle = IntPtr.Zero;
    private bool _isInitialized = false;
    private string? _deviceSerial;
    private int _fpWidth = 0;
    private int _fpHeight = 0;
    private byte[]? _lastCapturedImage;
    private byte[]? _lastCapturedTemplate;
    private int _lastTemplateLength = 0;

    // Config
    public int Threshold { get; set; } = 30;   // Threshold recomendado para 1:1 según ZKTeco (25-35)
    public int CaptureTimeout { get; set; } = 15000;
    public bool MergeSamples { get; set; } = true;

    private readonly ILogger<ZKFingerService> _logger;
    private readonly SemaphoreSlim _captureLock = new(1, 1);

    public bool IsDeviceOpen => _deviceHandle != IntPtr.Zero;
    public bool HasDatabase  => _dbHandle != IntPtr.Zero;
    public string? DeviceSerial => _deviceSerial;
    public int FpWidth => _fpWidth;
    public int FpHeight => _fpHeight;

    public ZKFingerService(ILogger<ZKFingerService> logger)
    {
        _logger = logger;
    }

    // ---------- Helpers de aseguramiento ----------

    /// <summary>Inicializa la DB del SDK si está liberada.</summary>
    private bool EnsureDb()
    {
        if (_dbHandle != IntPtr.Zero) return true;

        _dbHandle = zkfp2.DBInit();
        if (_dbHandle == IntPtr.Zero)
        {
            _logger.LogWarning("DBInit failed (EnsureDb)");
            return false;
        }
        _logger.LogDebug("DB initialized (EnsureDb)");
        return true;
    }

    /// <summary>Garantiza SDK inicializado, dispositivo abierto y DB lista.</summary>
    private (bool success, string? error) EnsureOpenWithDb()
    {
        if (!_isInitialized)
        {
            var init = Initialize();
            if (!init.success) return (false, init.error);
        }
        if (_deviceHandle == IntPtr.Zero)
        {
            var open = OpenDevice(0);
            if (!open.success) return (false, open.error);
        }
        if (!EnsureDb()) return (false, "Failed to initialize database");
        return (true, null);
    }

    // ---------- Ciclo de vida del SDK/Device ----------

    /// <summary>Inicializa el SDK.</summary>
    public (bool success, string? error, int deviceCount) Initialize()
    {
        try
        {
            if (_isInitialized)
            {
                int deviceCount = zkfp2.GetDeviceCount();
                _logger.LogDebug("SDK already initialized. Devices found: {Count}", deviceCount);
                return (true, null, deviceCount);
            }

            var ret = zkfp2.Init();
            if (ret != zkfperrdef.ZKFP_ERR_OK && ret != zkfperrdef.ZKFP_ERR_ALREADY_INIT)
                return (false, $"Failed to initialize SDK, error code: {ret}", 0);

            _isInitialized = true;
            int count = zkfp2.GetDeviceCount();
            _logger.LogInformation("SDK initialized successfully. Devices found: {Count}", count);
            return (true, null, count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initializing SDK");
            return (false, ex.Message, 0);
        }
    }

    /// <summary>Abre el dispositivo (y la DB interna del SDK).</summary>
    public (bool success, string? error) OpenDevice(int deviceIndex = 0)
    {
        try
        {
            _logger.LogDebug("OpenDevice called. Current handle: {Handle}, IsInitialized: {Init}", 
                _deviceHandle, _isInitialized);

            if (!_isInitialized)
            {
                _logger.LogDebug("SDK not initialized, calling Initialize()...");
                var initResult = Initialize();
                if (!initResult.success)
                {
                    _logger.LogError("Initialize failed: {Error}", initResult.error);
                    return (false, initResult.error);
                }
            }

            // Si ya está abierto, asegure la DB
            if (_deviceHandle != IntPtr.Zero)
            {
                _logger.LogDebug("Device handle is not Zero, checking DB...");
                if (!EnsureDb())
                {
                    _logger.LogError("EnsureDb failed for existing handle");
                    return (false, "Failed to initialize database");
                }
                _logger.LogInformation("Device already open (handle: {Handle}, DB ensured)", _deviceHandle);
                return (true, null);
            }

            _logger.LogDebug("Opening device with index {Index}...", deviceIndex);
            _deviceHandle = zkfp2.OpenDevice(deviceIndex);
            _logger.LogDebug("OpenDevice returned handle: {Handle}", _deviceHandle);
            
            if (_deviceHandle == IntPtr.Zero)
            {
                _logger.LogError("zkfp2.OpenDevice returned IntPtr.Zero");
                return (false, "Failed to open device");
            }

            if (!EnsureDb())
            {
                _logger.LogError("EnsureDb failed after opening device");
                zkfp2.CloseDevice(_deviceHandle);
                _deviceHandle = IntPtr.Zero;
                return (false, "Failed to initialize database");
            }

            // Parámetros del dispositivo
            byte[] paramValue = new byte[4];
            int size = 4;

            zkfp2.GetParameters(_deviceHandle, 1, paramValue, ref size); // width
            zkfp2.ByteArray2Int(paramValue, ref _fpWidth);

            size = 4;
            zkfp2.GetParameters(_deviceHandle, 2, paramValue, ref size); // height
            zkfp2.ByteArray2Int(paramValue, ref _fpHeight);

            _logger.LogInformation("Device opened successfully. Width: {Width}, Height: {Height}", _fpWidth, _fpHeight);
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception in OpenDevice");
            return (false, ex.Message);
        }
    }

    /// <summary>Cierra DB y dispositivo.</summary>
    public (bool success, string? error) CloseDevice()
    {
        try
        {
            if (_dbHandle != IntPtr.Zero)
            {
                zkfp2.DBFree(_dbHandle);
                _dbHandle = IntPtr.Zero;
            }
            if (_deviceHandle != IntPtr.Zero)
            {
                zkfp2.CloseDevice(_deviceHandle);
                _deviceHandle = IntPtr.Zero;
            }
            _logger.LogInformation("Device closed successfully");
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error closing device");
            return (false, ex.Message);
        }
    }

    // ---------- Captura ----------

    /// <summary>Captura huella con timeout. Devuelve plantilla exacta (solo tempLen bytes) e imagen raw.</summary>
    public async Task<(bool success, byte[]? template, int templateLen, byte[]? image, string? error)> CaptureFingerprint()
    {
        // Asegurar dispositivo abierto (opcional, por si el cliente se olvidó)
        var okOpen = EnsureOpenWithDb();
        if (!okOpen.success)
            return (false, null, 0, null, okOpen.error);

        await _captureLock.WaitAsync();
        try
        {
            int imageSize = _fpWidth * _fpHeight;
            byte[] fpImage = new byte[imageSize];
            byte[] fpTemplate = new byte[2048];
            int tempLen = 2048;

            var startTime = DateTime.Now;
            var timeout = TimeSpan.FromMilliseconds(CaptureTimeout);
            int lastErrorCode = 0;

            while (DateTime.Now - startTime < timeout)
            {
                tempLen = 2048; // reset en cada intento
                var ret = zkfp2.AcquireFingerprint(_deviceHandle, fpImage, imageSize, fpTemplate, ref tempLen);

                if (ret == zkfperrdef.ZKFP_ERR_OK)
                {
                    // COPIAR SOLO EL TAMAÑO REAL => evita basura al final
                    var tpl = new byte[tempLen];
                    Buffer.BlockCopy(fpTemplate, 0, tpl, 0, tempLen);

                    _lastCapturedImage = fpImage;
                    _lastCapturedTemplate = tpl;
                    _lastTemplateLength = tempLen;

                    _logger.LogDebug("Fingerprint captured. Template length: {Length}", tempLen);
                    return (true, tpl, tempLen, fpImage, null);
                }

                lastErrorCode = ret;

                if (ret == zkfperrdef.ZKFP_ERR_BUSY || ret == -10) // ocupado/no finger
                {
                    await Task.Delay(120);
                    continue;
                }
                break; // otros errores => salir
            }

            var errorMessage = lastErrorCode switch
            {
                zkfperrdef.ZKFP_ERR_BUSY => "Device busy",
                -10 => "No finger detected (timeout)",
                zkfperrdef.ZKFP_ERR_CAPTURE => "Capture failed",
                zkfperrdef.ZKFP_ERR_NOT_OPEN => "Device not open",
                _ => $"Capture failed with code: {lastErrorCode}"
            };

            _logger.LogWarning("Fingerprint capture failed/timeout. Last error: {Code}", lastErrorCode);
            return (false, null, 0, null, errorMessage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error capturing fingerprint");
            return (false, null, 0, null, ex.Message);
        }
        finally
        {
            _captureLock.Release();
        }
    }

    // ---------- Merge / Verify / Identify ----------

    /// <summary>Fusiona 3 muestras en una plantilla final usando DBMerge.</summary>
    public (bool success, byte[]? mergedTemplate, int templateLen, string? error) MergeTemplates(
        byte[] template1, byte[] template2, byte[] template3)
    {
        var ok = EnsureOpenWithDb();
        if (!ok.success) return (false, null, 0, ok.error);

        try
        {
            byte[] regTemplate = new byte[2048];
            int regTempLen = 2048;  // Indicar el tamaño del buffer disponible

            var ret = zkfp2.DBMerge(_dbHandle, template1, template2, template3, regTemplate, ref regTempLen);
            if (ret == zkfperrdef.ZKFP_ERR_OK)
            {
                // devolver plantilla compactada a su tamaño real
                var tpl = new byte[regTempLen];
                Buffer.BlockCopy(regTemplate, 0, tpl, 0, regTempLen);

                _logger.LogInformation("Templates merged. Length: {Length}", regTempLen);
                return (true, tpl, regTempLen, null);
            }
            return (false, null, 0, $"Merge failed with code: {ret}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error merging templates");
            return (false, null, 0, ex.Message);
        }
    }

    /// <summary>Verificación 1:1 con el matcher del SDK. Retorna score raw (sin aplicar threshold).</summary>
    public (bool success, bool match, int score, string? error) VerifyTemplate(
        byte[] capturedTemplate, byte[] storedTemplate, bool applyThreshold = true)
    {
        var ok = EnsureOpenWithDb();
        if (!ok.success) return (false, false, 0, ok.error);

        try
        {
            // IMPORTANTE: DBMatch requiere templates de EXACTAMENTE 2048 bytes
            if (capturedTemplate == null || capturedTemplate.Length == 0)
            {
                _logger.LogError("capturedTemplate is null or empty");
                return (false, false, 0, "Captured template is invalid");
            }

            if (storedTemplate == null || storedTemplate.Length == 0)
            {
                _logger.LogError("storedTemplate is null or empty");
                return (false, false, 0, "Stored template is invalid");
            }

            // DBMatch requiere las longitudes originales de los templates, no arrays de 2048
            int len1 = capturedTemplate.Length;
            int len2 = storedTemplate.Length;

            _logger.LogDebug("DBMatch: captured len={Len1}, stored len={Len2}", len1, len2);

            int score = zkfp2.DBMatch(_dbHandle, capturedTemplate, len1, storedTemplate, len2);
            bool match = applyThreshold ? (score >= Threshold) : (score > 0);

            _logger.LogDebug("DBMatch score: {Score}, Threshold: {Threshold}, applyThreshold: {Apply} => Match: {Match}",
                score, Threshold, applyThreshold, match);

            return (true, match, score, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying template. CapturedLen: {CaptLen}, StoredLen: {StoreLen}", 
                capturedTemplate?.Length ?? 0, storedTemplate?.Length ?? 0);
            return (false, false, 0, ex.Message);
        }
    }

    /// <summary>Identificación 1:N. Exige diferencia mínima entre top1 y top2.</summary>
    public (bool success, bool match, int bestIndex, int bestScore, string? error) IdentifyTemplate(
        byte[] capturedTemplate, List<byte[]> storedTemplates)
    {
        var ok = EnsureOpenWithDb();
        if (!ok.success) return (false, false, -1, 0, ok.error);

        if (storedTemplates == null || storedTemplates.Count == 0)
            return (true, false, -1, 0, null);

        try
        {
            int bestScore = 0, secondBest = 0, bestIndex = -1;

            for (int i = 0; i < storedTemplates.Count; i++)
            {
                int score = zkfp2.DBMatch(_dbHandle, capturedTemplate, capturedTemplate.Length, storedTemplates[i], storedTemplates[i].Length);
                if (score > bestScore)
                {
                    secondBest = bestScore;
                    bestScore = score;
                    bestIndex = i;
                }
                else if (score > secondBest)
                {
                    secondBest = score;
                }
            }

            bool ambiguous = (bestScore - secondBest) < 3;
            bool match = bestScore >= Threshold && !ambiguous;

            _logger.LogDebug("Identify best={Best} second={Second} thr={Thr} match={Match} ambiguous={Amb}",
                bestScore, secondBest, Threshold, match, ambiguous);

            if (ambiguous && bestScore >= Threshold)
                return (false, false, -1, bestScore, "Ambiguous match detected");

            return (true, match, bestIndex, bestScore, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error identifying template");
            return (false, false, -1, 0, ex.Message);
        }
    }

    // ---------- Imagen ----------

    public string? GetLastCapturedImageBase64()
    {
        if (_lastCapturedImage == null || _fpWidth == 0 || _fpHeight == 0) return null;
        try
        {
            return BitmapHelper.ConvertRawToBmpBase64(_lastCapturedImage, _fpWidth, _fpHeight);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error converting image to base64");
            return null;
        }
    }

    public byte[]? GetLastCapturedImageJpeg()
    {
        if (_lastCapturedImage == null || _fpWidth == 0 || _fpHeight == 0) return null;
        try
        {
            return BitmapHelper.ConvertRawToJpeg(_lastCapturedImage, _fpWidth, _fpHeight);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error converting image to JPEG");
            return null;
        }
    }

    // ---------- Dispose ----------

    public void Dispose()
    {
        CloseDevice();
        if (_isInitialized)
        {
            zkfp2.Terminate();
            _isInitialized = false;
        }
        _captureLock.Dispose();
    }
}
