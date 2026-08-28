using Serilog;
using WolfGym.BiometricService.Services;
using WolfGym.BiometricService.Data;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Hosting.WindowsServices;

//
//  ───────────────────────── LOGS SERILOG ─────────────────────────
//
var logPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
    "WolfGym", "biometric", "logs", "service-.log"
);
Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()  // Cambiado a Debug para diagnóstico
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File(
        logPath,
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 30,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}"
    )
    .CreateLogger();

try
{
    Log.Information("Starting WolfGym Biometric Service");

    var builder = WebApplication.CreateBuilder(args);

    // Serilog provider
    builder.Host.UseSerilog();

    // Ejecutable como Servicio de Windows (no se cierra al cerrar consola)
    // Si también lo corres en consola, no pasa nada.
    builder.Host.UseWindowsService();

    // El lector solo debe ser accesible desde la PC anfitriona.
    var biometricPort = builder.Configuration.GetValue("BiometricService:Port", 8001);
    builder.WebHost.ConfigureKestrel(k =>
    {
        k.Limits.MaxRequestBodySize = 5 * 1024 * 1024; // 5MB por si envías imágenes
        k.ListenLocalhost(biometricPort);
    });

    // CORS: configuración para desarrollo y producción
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            var isDevelopment = builder.Environment.IsDevelopment();
            if (isDevelopment)
            {
                // Desarrollo: solo localhost
                policy.WithOrigins(
                        "http://localhost:3000", 
                        "http://127.0.0.1:3000"
                      )
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            }
            else
            {
                // Producción web y aplicación de escritorio local.
                policy.WithOrigins(
                        "https://wolf-gym.com",
                        "https://www.wolf-gym.com",
                        "http://wolf-gym.com",
                        "http://www.wolf-gym.com",
                        "http://localhost:3000",
                        "http://127.0.0.1:3000"
                      )
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            }
        });
    });

    // Controllers + JSON
    builder.Services.AddControllers()
        .AddJsonOptions(o =>
        {
            o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        });

    // Swagger
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new() { Title = "WolfGym Biometric API", Version = "v1" });
    });

    // Health checks (para ping desde el cliente)
    builder.Services.AddHealthChecks();

    // DI de la app
    builder.Services.AddSingleton<ZKFingerService>();
    builder.Services.AddScoped<FingerprintRepository>();

    // Watchdog que mantiene device/DB listos (auto-recuperación)
    // DESHABILITADO TEMPORALMENTE - causaba crash al iniciar
    // builder.Services.AddHostedService<BiometricWatchdog>();

    var app = builder.Build();

    // Middleware global de errores (no mata el proceso)
    app.UseExceptionHandler(errorApp =>
    {
        errorApp.Run(async context =>
        {
            var feature = context.Features.Get<IExceptionHandlerPathFeature>();
            Log.Error(feature?.Error, "Unhandled exception");
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { ok = false, message = "internal-error" });
        });
    });

    // CORS
    app.UseCors();

    // Swagger solo en Dev (si quieres siempre, quita el if)
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
        {
            c.SwaggerEndpoint("/swagger/v1/swagger.json", "WolfGym Biometric API v1");
        });
    }

    // Rutas
    app.MapControllers();
    app.MapHealthChecks("/health");

    // Logs de ciclo de vida (útil si Windows reinicia el servicio)
    app.Lifetime.ApplicationStarted.Register(() =>
        Log.Information("Service started successfully on http://127.0.0.1:{Port}", biometricPort));
    app.Lifetime.ApplicationStopping.Register(() =>
        Log.Information("Service stopping..."));
    app.Lifetime.ApplicationStopped.Register(() =>
        Log.Information("Service stopped."));

    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

/// <summary>
/// Watchdog: reabre device/DB si quedaron cerrados.
/// Se apoya en EnsureOpenWithDb() del ZKFingerService (método interno que ya tienes).
/// </summary>
public sealed class BiometricWatchdog : BackgroundService
{
    private readonly ILogger<BiometricWatchdog> _logger;
    private readonly ZKFingerService _zk;

    public BiometricWatchdog(ILogger<BiometricWatchdog> logger, ZKFingerService zk)
    {
        _logger = logger;
        _zk = zk;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Watchdog started");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Invoca el método internal EnsureOpenWithDb() por reflexión
                var mi = typeof(ZKFingerService)
                    .GetMethod("EnsureOpenWithDb", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);

                if (mi != null)
                {
                    var result = (ValueTuple<bool, string?>) (mi.Invoke(_zk, null) ?? (false, "no-result"));
                    if (!result.Item1)
                        _logger.LogWarning("Watchdog EnsureOpenWithDb failed: {err}", result.Item2);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Watchdog error");
            }

            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
        }
        _logger.LogInformation("Watchdog stopped");
    }
}
