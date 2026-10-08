using System.Text.Json.Serialization;

namespace WolfGym.BiometricService.Models;

// Respuestas
public record DeviceOpenResponse(
    bool Ok,
    int DeviceCount,
    string? Serial,
    int Width,
    int Height,
    string? FpVersion,
    string? Message = null
);

public record DeviceCloseResponse(bool Ok, string? Message = null);

public record DeviceStatusResponse(
    bool Ok,
    bool Opened,
    string? Serial,
    bool HasDB,
    string? SdkVersion
);

public record CaptureResponse(
    bool Ok,
    [property: JsonPropertyName("template")] string? TemplateB64,
    [property: JsonPropertyName("image")] string? ImageB64,
    int Length,
    int Quality,
    string? Message = null,
    string? Reason = null
);

public record EnrollRequest(
    string UserId,
    int FingerIndex,
    List<string> SamplesB64
);

public record EnrollResponse(
    bool Ok,
    string? Message,
    int TemplateLen
);

public record VerifyRequest(
    string UserId,
    int FingerIndex,
    string TemplateB64
);

public record VerifyResponse(
    bool Ok,
    bool Match,
    int Score,
    int Threshold,
    string? Message = null
);

public record IdentifyRequest(string TemplateB64);

public record IdentifyResponse(
    bool Ok,
    bool Match,
    string? UserId,
    int FingerIndex,
    int Score,
    int Threshold,
    string? Message = null
);

public record HealthResponse(bool Ok, string Status = "healthy");

public record ConfigResponse(
    int Threshold,
    int Timeout,
    bool MergeSamples
);

public record ConfigUpdateRequest(
    int? Threshold,
    int? Timeout,
    bool? MergeSamples
);

// Modelos de dominio
public class FingerprintRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public int FingerIndex { get; set; }
    public byte[] Template { get; set; } = Array.Empty<byte>();
    public string? Version { get; set; }
    public string? DeviceSerial { get; set; }
    public int? Quality { get; set; }
    public int TemplateSize { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
