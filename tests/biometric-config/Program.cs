global using Microsoft.Extensions.Configuration;
using Npgsql;
using WolfGym.BiometricService.Data;

// Configuration tests never open a database connection or load the reader SDK.
var root = Path.Combine(Directory.GetCurrentDirectory(), ".local", "biometric-config-tests", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
File.WriteAllText(Path.Combine(root, "package.json"), "{}");
var file = Path.Combine(root, ".env.local");
var count = 0;
IConfiguration Config(string? connection = null) => new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connection }).Build();
void Expect(bool value) { if (!value) throw new Exception("Configuration regression failed"); }
void Reject(string value) {
    File.WriteAllText(file, "DATABASE_URL=" + value);
    try { LocalDatabaseConfiguration.Apply(Config(), root); }
    catch (InvalidOperationException) { count++; return; }
    throw new Exception("Unsafe configuration was accepted");
}

File.WriteAllText(file, "DATABASE_URL=\"postgresql://test:p%3Bword%27%22@127.0.0.1:5433/wolfgym?schema=public\"");
var config = Config("");
Expect(LocalDatabaseConfiguration.Apply(config, root));
var parsed = new NpgsqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection"));
Expect(parsed.Host == "127.0.0.1" && parsed.Port == 5433 && parsed.Database == "wolfgym" && parsed.Password == "p;word'\"");
count++;
Reject("postgresql://test:pass@remote.invalid:5432/wolfgym");
Reject("postgresql://test:pass@127.0.0.1/wolfgym?host=remote.invalid");
Reject("https://test:pass@127.0.0.1/wolfgym");
Reject("postgresql://test:pass@127.0.0.1/postgres");
File.WriteAllText(file, "OTHER_VARIABLE=unused");
try { LocalDatabaseConfiguration.Apply(Config(), root); throw new Exception("Missing URL was accepted"); }
catch (InvalidOperationException) { count++; }
var previousMode = Environment.GetEnvironmentVariable("WOLF_LOCAL_ONLY");
try {
    Environment.SetEnvironmentVariable("WOLF_LOCAL_ONLY", "1");
    Expect(LocalDatabaseConfiguration.Apply(Config("Host=127.0.0.1;Database=wolfgym;Username=test;Password=pass"), root)); count++;
    try { LocalDatabaseConfiguration.Apply(Config("Host=remote.invalid;Database=wolfgym;Username=test;Password=pass"), root); throw new Exception("Remote explicit connection was accepted"); }
    catch (InvalidOperationException) { count++; }
} finally { Environment.SetEnvironmentVariable("WOLF_LOCAL_ONLY", previousMode); }
Console.WriteLine($"Biometric configuration: {count} checks passed; no database connections.");
