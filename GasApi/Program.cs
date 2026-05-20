// GasApi/Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:4200").AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();
app.UseCors();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/gas-prices/{zipcode}", async (string zipcode, HttpContext httpContext, CancellationToken ct) =>
{
    httpContext.Response.Headers.ContentType = "text/event-stream";
    httpContext.Response.Headers.CacheControl = "no-cache";
    httpContext.Response.Headers.Connection = "keep-alive";

    var brands = new[]
    {
        ("Shell", "123 Main St"),
        ("Exxon", "456 Oak Ave"),
        ("BP", "789 Pine Rd"),
        ("Costco Wholesale", "100 Retail Way"),
        ("Chevron", "555 Express Blvd"),
        ("Mobil", "321 Market St"),
        ("7-Eleven", "777 Convenience Ln"),
        ("Circle K", "888 Quick Stop Dr"),
        ("Texaco", "222 Fuel St"),
        ("Arco", "333 Discount Ave")
    };

    // Deterministic per-zip pricing so two clients hitting the same zip see the same trend,
    // but different zips produce visibly different numbers.
    var seed = zipcode.Aggregate(0, (acc, c) => acc * 31 + c);
    var rng = new Random(seed);
    var basePrice = 3.00m + (decimal)(rng.NextDouble() * 1.5);

    foreach (var (name, address) in brands)
    {
        if (ct.IsCancellationRequested) break;

        try
        {
            await Task.Delay(1000, ct);
        }
        catch (TaskCanceledException)
        {
            break;
        }

        var price = Math.Round(basePrice + (decimal)(rng.NextDouble() * 0.4 - 0.2), 2);

        var update = new GasStationUpdate(
            Id: Guid.NewGuid().ToString(),
            Name: name,
            Address: address,
            Price: price,
            LastUpdated: DateTime.Now.ToString("T")
        );

        var jsonChunk = System.Text.Json.JsonSerializer.Serialize(update);
        await httpContext.Response.WriteAsync($"data: {jsonChunk}\n\n", ct);
        await httpContext.Response.Body.FlushAsync(ct);
    }
});

app.Run();

public record GasStationUpdate(string Id, string Name, string Address, decimal Price, string LastUpdated);
