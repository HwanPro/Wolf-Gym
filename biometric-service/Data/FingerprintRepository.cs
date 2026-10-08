using Npgsql;
using WolfGym.BiometricService.Models;

namespace WolfGym.BiometricService.Data;

public enum FingerprintSaveResult { Saved, UserNotFound, Duplicate }

public class FingerprintRepository
{
    private readonly string _connectionString;
    private readonly ILogger<FingerprintRepository> _logger;

    public FingerprintRepository(IConfiguration configuration, ILogger<FingerprintRepository> logger)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection") 
            ?? throw new InvalidOperationException("Connection string not found");
        if (string.IsNullOrWhiteSpace(_connectionString)) throw new InvalidOperationException("Biometric database not configured");
        _logger = logger;
    }

    public async Task CheckReadyAsync(CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand("SELECT 1 FROM fingerprints LIMIT 1", connection);
        await command.ExecuteScalarAsync(cancellationToken);
    }

    /// <summary>
    /// Verifica si existe un usuario
    /// </summary>
    public async Task<bool> UserExistsAsync(string userId)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            await using var cmd = new NpgsqlCommand(
                "SELECT COUNT(*) FROM users WHERE id = @userId", connection);
            cmd.Parameters.AddWithValue("userId", userId);

            var count = (long)(await cmd.ExecuteScalarAsync() ?? 0L);
            return count > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking if user exists: {UserId}", userId);
            throw;
        }
    }

    /// <summary>
    /// Guarda o actualiza una huella digital
    /// </summary>
    public async Task<FingerprintSaveResult> SaveFingerprintAsync(FingerprintRecord fingerprint, Func<byte[], bool> matches)
    {
        try
        {
            // Verificar que el usuario existe
            if (!await UserExistsAsync(fingerprint.UserId))
            {
                _logger.LogWarning("User {UserId} does not exist", fingerprint.UserId);
                return FingerprintSaveResult.UserNotFound;
            }

            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            await using var transaction = await connection.BeginTransactionAsync();
            // Serialize all fingerprint writes, including writes from another service instance.
            // Read fresh templates under the lock; comparing a cached list permits duplicate races.
            await using (var tableLock = new NpgsqlCommand("LOCK TABLE fingerprints IN SHARE ROW EXCLUSIVE MODE", connection, transaction))
                await tableLock.ExecuteNonQueryAsync();
            await using (var duplicates = new NpgsqlCommand("SELECT template FROM fingerprints WHERE user_id <> @userId", connection, transaction))
            {
                duplicates.Parameters.AddWithValue("userId", fingerprint.UserId);
                await using var reader = await duplicates.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    if (matches((byte[])reader.GetValue(0))) return FingerprintSaveResult.Duplicate;
                }
            }

            const string sql = @"
                INSERT INTO fingerprints 
                    (id, user_id, finger_index, template, version, device_serial, quality, template_size, created_at, updated_at)
                VALUES 
                    (@id, @userId, @fingerIndex, @template, @version, @deviceSerial, @quality, @templateSize, @createdAt, @updatedAt)
                ON CONFLICT (user_id, finger_index) 
                DO UPDATE SET
                    template = EXCLUDED.template,
                    version = EXCLUDED.version,
                    device_serial = EXCLUDED.device_serial,
                    quality = EXCLUDED.quality,
                    template_size = EXCLUDED.template_size,
                    updated_at = EXCLUDED.updated_at";

            await using var cmd = new NpgsqlCommand(sql, connection, transaction);
            cmd.Parameters.AddWithValue("id", fingerprint.Id);
            cmd.Parameters.AddWithValue("userId", fingerprint.UserId);
            cmd.Parameters.AddWithValue("fingerIndex", fingerprint.FingerIndex);
            cmd.Parameters.AddWithValue("template", fingerprint.Template);
            cmd.Parameters.AddWithValue("version", (object?)fingerprint.Version ?? DBNull.Value);
            cmd.Parameters.AddWithValue("deviceSerial", (object?)fingerprint.DeviceSerial ?? DBNull.Value);
            cmd.Parameters.AddWithValue("quality", (object?)fingerprint.Quality ?? DBNull.Value);
            cmd.Parameters.AddWithValue("templateSize", fingerprint.TemplateSize);
            cmd.Parameters.AddWithValue("createdAt", fingerprint.CreatedAt);
            cmd.Parameters.AddWithValue("updatedAt", DateTime.UtcNow);

            var rows = await cmd.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
            
            _logger.LogInformation(
                "Fingerprint saved for user {UserId}, finger {FingerIndex}", 
                fingerprint.UserId, fingerprint.FingerIndex);
            
            return rows > 0 ? FingerprintSaveResult.Saved : FingerprintSaveResult.UserNotFound;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving fingerprint for user {UserId}", fingerprint.UserId);
            throw;
        }
    }

    /// <summary>
    /// Obtiene una huella específica
    /// </summary>
    public async Task<FingerprintRecord?> GetFingerprintAsync(string userId, int fingerIndex)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = @"
                SELECT id, user_id, finger_index, template, version, device_serial, 
                       quality, template_size, created_at, updated_at
                FROM fingerprints
                WHERE user_id = @userId AND finger_index = @fingerIndex";

            await using var cmd = new NpgsqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("userId", userId);
            cmd.Parameters.AddWithValue("fingerIndex", fingerIndex);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return new FingerprintRecord
                {
                    Id = reader.GetString(0),
                    UserId = reader.GetString(1),
                    FingerIndex = reader.GetInt32(2),
                    Template = (byte[])reader.GetValue(3),
                    Version = reader.IsDBNull(4) ? null : reader.GetString(4),
                    DeviceSerial = reader.IsDBNull(5) ? null : reader.GetString(5),
                    Quality = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                    TemplateSize = reader.GetInt32(7),
                    CreatedAt = reader.GetDateTime(8),
                    UpdatedAt = reader.GetDateTime(9)
                };
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting fingerprint for user {UserId}, finger {FingerIndex}", 
                userId, fingerIndex);
            throw;
        }
    }

    /// <summary>
    /// Obtiene todas las huellas de un usuario
    /// </summary>
    public async Task<List<FingerprintRecord>> GetUserFingerprintsAsync(string userId)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = @"
                SELECT id, user_id, finger_index, template, version, device_serial, 
                       quality, template_size, created_at, updated_at
                FROM fingerprints
                WHERE user_id = @userId
                ORDER BY finger_index";

            await using var cmd = new NpgsqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("userId", userId);

            var fingerprints = new List<FingerprintRecord>();
            await using var reader = await cmd.ExecuteReaderAsync();
            
            while (await reader.ReadAsync())
            {
                fingerprints.Add(new FingerprintRecord
                {
                    Id = reader.GetString(0),
                    UserId = reader.GetString(1),
                    FingerIndex = reader.GetInt32(2),
                    Template = (byte[])reader.GetValue(3),
                    Version = reader.IsDBNull(4) ? null : reader.GetString(4),
                    DeviceSerial = reader.IsDBNull(5) ? null : reader.GetString(5),
                    Quality = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                    TemplateSize = reader.GetInt32(7),
                    CreatedAt = reader.GetDateTime(8),
                    UpdatedAt = reader.GetDateTime(9)
                });
            }

            return fingerprints;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting fingerprints for user {UserId}", userId);
            throw;
        }
    }

    /// <summary>
    /// Obtiene todas las huellas almacenadas (para identificación 1:N)
    /// </summary>
    public async Task<List<(string userId, int fingerIndex, byte[] template)>> GetAllFingerprintsAsync()
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = @"
                SELECT user_id, finger_index, template
                FROM fingerprints
                ORDER BY user_id, finger_index";

            await using var cmd = new NpgsqlCommand(sql, connection);
            
            var fingerprints = new List<(string, int, byte[])>();
            await using var reader = await cmd.ExecuteReaderAsync();
            
            while (await reader.ReadAsync())
            {
                fingerprints.Add((
                    reader.GetString(0),
                    reader.GetInt32(1),
                    (byte[])reader.GetValue(2)
                ));
            }

            _logger.LogDebug("Loaded {Count} fingerprints for identification", fingerprints.Count);
            return fingerprints;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all fingerprints");
            throw;
        }
    }

    /// <summary>
    /// Elimina una huella específica
    /// </summary>
    public async Task<bool> DeleteFingerprintAsync(string userId, int fingerIndex)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = "DELETE FROM fingerprints WHERE user_id = @userId AND finger_index = @fingerIndex";
            
            await using var cmd = new NpgsqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("userId", userId);
            cmd.Parameters.AddWithValue("fingerIndex", fingerIndex);

            var rows = await cmd.ExecuteNonQueryAsync();
            
            _logger.LogInformation(
                "Fingerprint deleted for user {UserId}, finger {FingerIndex}", 
                userId, fingerIndex);
            
            return rows > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting fingerprint for user {UserId}, finger {FingerIndex}", 
                userId, fingerIndex);
            throw;
        }
    }

    /// <summary>
    /// Elimina todas las huellas de un usuario
    /// </summary>
    public async Task<int> DeleteUserFingerprintsAsync(string userId)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = "DELETE FROM fingerprints WHERE user_id = @userId";
            
            await using var cmd = new NpgsqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("userId", userId);

            var rows = await cmd.ExecuteNonQueryAsync();
            
            _logger.LogInformation("Deleted {Count} fingerprints for user {UserId}", rows, userId);
            return rows;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting fingerprints for user {UserId}", userId);
            throw;
        }
    }
}
