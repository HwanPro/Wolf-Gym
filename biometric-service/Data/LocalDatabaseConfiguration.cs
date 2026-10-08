using Npgsql;

namespace WolfGym.BiometricService.Data;

public static class LocalDatabaseConfiguration
{
    public static bool Apply(IConfiguration configuration, string contentRoot)
    {
        var configured = configuration.GetConnectionString("DefaultConnection");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            if (Environment.GetEnvironmentVariable("WOLF_LOCAL_ONLY") != "1") return false;
            var existing = new NpgsqlConnectionStringBuilder(configured);
            RequireLoopback(existing.Host);
            return true;
        }

        // Debug/desktop starts must not silently run with an empty connection string.
        // Search only for the repository's explicit local configuration, never .env.
        foreach (var start in new[] { contentRoot, AppContext.BaseDirectory })
        {
            DirectoryInfo? directory = new DirectoryInfo(start);
            for (var depth = 0; directory != null && depth < 10; depth++, directory = directory.Parent)
            {
                var file = Path.Combine(directory.FullName, ".env.local");
                if (!File.Exists(file) || !File.Exists(Path.Combine(directory.FullName, "package.json"))) continue;
                var line = File.ReadLines(file).FirstOrDefault(value => value.TrimStart().StartsWith("DATABASE_URL=", StringComparison.Ordinal));
                if (line == null) throw new InvalidOperationException("DATABASE_URL missing from local configuration.");
                var value = line.Trim().Substring("DATABASE_URL=".Length).Trim().Trim('"', '\'');
                var uri = new Uri(value);
                if (uri.Scheme != "postgres" && uri.Scheme != "postgresql") throw new InvalidOperationException("Invalid local database protocol.");
                RequireLoopback(uri.Host);
                if (uri.Query.Split('&').Any(part => new[] { "host", "service", "socket", "options" }.Contains(part.TrimStart('?').Split('=')[0])))
                    throw new InvalidOperationException("Local database redirections are not allowed.");
                var credentials = uri.UserInfo.Split(':', 2);
                if (credentials.Length != 2) throw new InvalidOperationException("Local database credentials missing.");
                var database = Uri.UnescapeDataString(uri.AbsolutePath.Trim('/'));
                if (string.IsNullOrWhiteSpace(database) || new[] { "postgres", "template0", "template1" }.Contains(database))
                    throw new InvalidOperationException("A dedicated local database is required.");
                var connection = new NpgsqlConnectionStringBuilder
                {
                    Host = uri.Host, Port = uri.Port > 0 ? uri.Port : 5432,
                    Database = database, Username = Uri.UnescapeDataString(credentials[0]),
                    Password = Uri.UnescapeDataString(credentials[1]), SslMode = SslMode.Disable
                };
                configuration["ConnectionStrings:DefaultConnection"] = connection.ConnectionString;
                return true;
            }
        }
        throw new InvalidOperationException("Biometric database not configured. Start with the local launcher or configure DefaultConnection explicitly.");
    }

    private static void RequireLoopback(string? host)
    {
        if (!new[] { "localhost", "127.0.0.1", "::1", "[::1]" }.Contains(host, StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Local biometric database must use loopback.");
    }
}
