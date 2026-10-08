using Microsoft.AspNetCore.Mvc;
using WolfGym.BiometricService.Data;
using WolfGym.BiometricService.Models;
using WolfGym.BiometricService.Services;
using WolfGym.BiometricService.SDK;

namespace WolfGym.BiometricService.Controllers;

[ApiController]
[Route("")]
public class BiometricController : ControllerBase
{
    private readonly ZKFingerService _fingerService;
    private readonly FingerprintRepository _repository;
    private readonly ILogger<BiometricController> _logger;

    public BiometricController(
        ZKFingerService fingerService,
        FingerprintRepository repository,
        ILogger<BiometricController> logger)
    {
        _fingerService = fingerService;
        _repository = repository;
        _logger = logger;
    }

    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken cancellationToken)
    {
        try
        {
            await _repository.CheckReadyAsync(cancellationToken);
            return Ok(new HealthResponse(true));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Biometric database readiness failed");
            return StatusCode(503, new { ok = false, status = "database-unavailable" });
        }
    }

    [HttpPost("device/open")]
    public IActionResult OpenDevice()
    {
        try
        {
            var (success, error, deviceCount) = _fingerService.Initialize();
            if (!success)
            {
                return Ok(new DeviceOpenResponse(false, 0, null, 0, 0, null, error));
            }

            var openResult = _fingerService.OpenDevice(0);
            if (!openResult.success)
            {
                return Ok(new DeviceOpenResponse(false, deviceCount, null, 0, 0, null, openResult.error));
            }

            return Ok(new DeviceOpenResponse(
                true,
                deviceCount,
                _fingerService.DeviceSerial,
                _fingerService.FpWidth,
                _fingerService.FpHeight,
                "ZK"
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error opening device");
            return Ok(new DeviceOpenResponse(false, 0, null, 0, 0, null, ex.Message));
        }
    }

    [HttpPost("device/close")]
    public IActionResult CloseDevice()
    {
        try
        {
            var (success, error) = _fingerService.CloseDevice();
            return Ok(new DeviceCloseResponse(success, error));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error closing device");
            return Ok(new DeviceCloseResponse(false, ex.Message));
        }
    }

    [HttpGet("device/status")]
    public IActionResult DeviceStatus()
    {
        return Ok(new DeviceStatusResponse(
            true,
            _fingerService.IsDeviceOpen,
            _fingerService.DeviceSerial,
            _fingerService.HasDatabase,
            "10.0"
        ));
    }

    [HttpPost("capture")]
    public async Task<IActionResult> Capture(CancellationToken cancellationToken)
    {
        try
        {
            var (success, template, templateLen, image, error) = await _fingerService.CaptureFingerprint(cancellationToken);
            
            if (!success)
            {
                return Ok(new CaptureResponse(false, null, null, 0, 0, error,
                    error == "No finger detected (timeout)" ? "NO_FINGER" : "CAPTURE_FAILED"));
            }

            var templateB64 = template != null && templateLen > 0
                ? zkfp2.BlobToBase64String(template, templateLen)
                : null;

            var imageB64 = _fingerService.GetLastCapturedImageBase64();

            return Ok(new CaptureResponse(
                true,
                templateB64,
                imageB64,
                templateLen,
                0, // Quality no está directamente disponible en esta versión del SDK
                null
            ));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return StatusCode(499);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error capturing fingerprint");
            return Ok(new CaptureResponse(false, null, null, 0, 0, ex.Message));
        }
    }

    [HttpPost("enroll")]
    public async Task<IActionResult> Enroll([FromBody] EnrollRequest request)
    {
        try
        {
            // Validar entrada
            if (string.IsNullOrEmpty(request.UserId))
            {
                return BadRequest(new EnrollResponse(false, "UserId is required", 0));
            }

            if (request.FingerIndex < 0 || request.FingerIndex > 9)
            {
                return BadRequest(new EnrollResponse(false, "FingerIndex must be between 0 and 9", 0));
            }

            if (request.SamplesB64 == null || (request.SamplesB64.Count != 1 && request.SamplesB64.Count != 3))
            {
                return BadRequest(new EnrollResponse(false, "Exactly 1 or 3 samples required", 0));
            }

            // Convertir muestras de base64 a byte arrays
            List<byte[]> samples;
            try
            {
                samples = request.SamplesB64.Select(s => Convert.FromBase64String(s)).ToList();
            }
            catch (FormatException)
            {
                return BadRequest(new EnrollResponse(false, "Invalid fingerprint sample", 0));
            }
            if (samples.Any(sample => sample.Length == 0 || sample.Length > 2048))
                return BadRequest(new EnrollResponse(false, "Invalid fingerprint sample size", 0));

            byte[] templateToSave;
            int templateLen;

            if (samples.Count == 1)
            {
                templateToSave = samples[0];
                templateLen = samples[0].Length;
                _logger.LogInformation(
                    "Single-sample enrollment selected for user {UserId}, finger {FingerIndex}, length {Length}",
                    request.UserId, request.FingerIndex, templateLen);
            }
            else
            {
                // Validar que las 3 muestras son del mismo dedo usando DBMatch
                // Como en el demo oficial: solo verificar que score > 0 (NO usar threshold específico)
                for (int i = 0; i < samples.Count - 1; i++)
                {
                    // applyThreshold=false => solo verifica score > 0
                    var (success, match, score, error) = _fingerService.VerifyTemplate(
                        samples[i], samples[i + 1], applyThreshold: false);

                    if (!success)
                    {
                        return Ok(new EnrollResponse(false, error ?? "Verification failed", 0));
                    }

                    // Demo oficial usa: if (DBMatch <= 0) => error
                    if (!match || score <= 0)
                    {
                        _logger.LogWarning(
                            "Enrollment validation failed: Samples {i} and {j} don't match (score={Score})",
                            i + 1, i + 2, score);
                        return BadRequest(new EnrollResponse(
                            false,
                            "SAMPLES_DO_NOT_MATCH",
                            0
                        ));
                    }

                    _logger.LogInformation("Enrollment validation: Samples {i} and {j} match OK (score={Score})",
                        i + 1, i + 2, score);
                }

                // Fusionar las 3 muestras
                var mergeResult = _fingerService.MergeTemplates(samples[0], samples[1], samples[2]);
                if (!mergeResult.success || mergeResult.mergedTemplate == null)
                {
                    return Ok(new EnrollResponse(false, mergeResult.error ?? "Merge failed", 0));
                }

                templateToSave = mergeResult.mergedTemplate.Take(mergeResult.templateLen).ToArray();
                templateLen = mergeResult.templateLen;
            }

            // Guardar en base de datos
            var fingerprintRecord = new FingerprintRecord
            {
                UserId = request.UserId,
                FingerIndex = request.FingerIndex,
                Template = templateToSave,
                Version = "ZK",
                DeviceSerial = _fingerService.DeviceSerial,
                TemplateSize = templateLen
            };

            FingerprintSaveResult saved;
            try
            {
                saved = await _repository.SaveFingerprintAsync(fingerprintRecord, stored =>
                {
                    // Test the merged template and each original sample against other owners.
                    foreach (var candidate in samples.Append(templateToSave))
                    {
                        var comparison = _fingerService.VerifyTemplate(candidate, stored);
                        if (!comparison.success) throw new InvalidOperationException("Fingerprint comparison unavailable");
                        if (comparison.match) return true;
                    }
                    return false;
                });
            }
            catch (Exception dbEx)
            {
                _logger.LogError(dbEx, "Database error saving fingerprint");
                return StatusCode(503, new EnrollResponse(false, "Biometric storage or comparison unavailable", 0));
            }
            
            if (saved == FingerprintSaveResult.Duplicate)
                return Conflict(new EnrollResponse(false, "FINGERPRINT_ALREADY_REGISTERED", 0));

            if (saved != FingerprintSaveResult.Saved)
            {
                return NotFound(new EnrollResponse(false, "User not found", 0));
            }

            _logger.LogInformation(
                "Enrollment successful for user {UserId}, finger {FingerIndex}",
                request.UserId, request.FingerIndex);

            return Ok(new EnrollResponse(true, "Enrollment successful", templateLen));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enrolling fingerprint");
            return Ok(new EnrollResponse(false, ex.Message, 0));
        }
    }

    [HttpPost("verify")]
    public async Task<IActionResult> Verify([FromBody] VerifyRequest request)
    {
        try
        {
            // Validar entrada
            if (string.IsNullOrEmpty(request.UserId) || string.IsNullOrEmpty(request.TemplateB64))
            {
                return BadRequest(new VerifyResponse(false, false, 0, 0, "UserId and TemplateB64 are required"));
            }

            if (request.FingerIndex < 0 || request.FingerIndex > 9)
            {
                return BadRequest(new VerifyResponse(false, false, 0, 0, "FingerIndex must be between 0 and 9"));
            }

            // Obtener plantilla almacenada
            var storedFingerprint = await _repository.GetFingerprintAsync(request.UserId, request.FingerIndex);
            if (storedFingerprint == null)
            {
                return Ok(new VerifyResponse(
                    true,
                    false,
                    0,
                    _fingerService.Threshold,
                    "Fingerprint not found for this user and finger"
                ));
            }

            // Convertir plantilla capturada de base64
            var capturedTemplate = Convert.FromBase64String(request.TemplateB64);

            // Verificar usando DBMatch
            var (success, match, score, error) = _fingerService.VerifyTemplate(
                capturedTemplate,
                storedFingerprint.Template
            );

            if (!success)
            {
                return Ok(new VerifyResponse(false, false, 0, _fingerService.Threshold, error));
            }

            _logger.LogInformation(
                "Verification result for user {UserId}, finger {FingerIndex}: {Match} (score: {Score})",
                request.UserId, request.FingerIndex, match, score);

            return Ok(new VerifyResponse(true, match, score, _fingerService.Threshold));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying fingerprint");
            return Ok(new VerifyResponse(false, false, 0, _fingerService.Threshold, ex.Message));
        }
    }

    [HttpPost("identify")]
    public async Task<IActionResult> Identify([FromBody] IdentifyRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.TemplateB64))
            {
                return BadRequest(new IdentifyResponse(false, false, null, 0, 0, 0, "TemplateB64 is required"));
            }

            // Cargar todas las huellas de la base de datos
            var allFingerprints = await _repository.GetAllFingerprintsAsync();
            
            if (allFingerprints.Count == 0)
            {
                return Ok(new IdentifyResponse(
                    true,
                    false,
                    null,
                    0,
                    0,
                    _fingerService.Threshold,
                    "No fingerprints in database"
                ));
            }

            // Convertir plantilla capturada de base64
            var capturedTemplate = Convert.FromBase64String(request.TemplateB64);

            // Identificar usando DBMatch contra todas las plantillas
            var templates = allFingerprints.Select(f => f.template).ToList();
            var (success, match, bestIndex, bestScore, error) = _fingerService.IdentifyTemplate(
                capturedTemplate,
                templates
            );

            if (!success)
            {
                return Ok(new IdentifyResponse(
                    false,
                    false,
                    null,
                    0,
                    0,
                    _fingerService.Threshold,
                    error
                ));
            }

            if (match && bestIndex >= 0)
            {
                var (userId, fingerIndex, _) = allFingerprints[bestIndex];
                
                _logger.LogInformation(
                    "Identification successful: User {UserId}, Finger {FingerIndex}, Score {Score}",
                    userId, fingerIndex, bestScore);

                return Ok(new IdentifyResponse(
                    true,
                    true,
                    userId,
                    fingerIndex,
                    bestScore,
                    _fingerService.Threshold
                ));
            }

            return Ok(new IdentifyResponse(
                true,
                false,
                null,
                0,
                bestScore,
                _fingerService.Threshold,
                "No match found"
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error identifying fingerprint");
            return Ok(new IdentifyResponse(false, false, null, 0, 0, _fingerService.Threshold, ex.Message));
        }
    }

    [HttpGet("image/snapshot")]
    public IActionResult GetSnapshot()
    {
        try
        {
            var jpegData = _fingerService.GetLastCapturedImageJpeg();
            if (jpegData == null || jpegData.Length == 0)
            {
                return NotFound(new { ok = false, message = "No image available" });
            }

            return File(jpegData, "image/jpeg");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting snapshot");
            return StatusCode(500, new { ok = false, message = ex.Message });
        }
    }

    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        return Ok(new ConfigResponse(
            _fingerService.Threshold,
            _fingerService.CaptureTimeout,
            _fingerService.MergeSamples
        ));
    }

    [HttpPost("config")]
    public IActionResult UpdateConfig([FromBody] ConfigUpdateRequest request)
    {
        if (request.Threshold is < 1 or > 100 || request.Timeout is < 1000 or > 30000)
            return BadRequest(new { ok = false, message = "Invalid threshold or timeout" });
        if (request.Threshold.HasValue)
        {
            _fingerService.Threshold = request.Threshold.Value;
        }

        if (request.Timeout.HasValue)
        {
            _fingerService.CaptureTimeout = request.Timeout.Value;
        }

        if (request.MergeSamples.HasValue)
        {
            _fingerService.MergeSamples = request.MergeSamples.Value;
        }

        return Ok(new ConfigResponse(
            _fingerService.Threshold,
            _fingerService.CaptureTimeout,
            _fingerService.MergeSamples
        ));
    }
}
