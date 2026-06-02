using System.Data;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();

var telegramToken = builder.Configuration["Telegram:BotToken"] ?? builder.Configuration["TELEGRAM_BOT_TOKEN"];
var telegramChatId = builder.Configuration["Telegram:ChatId"] ?? builder.Configuration["TELEGRAM_CHAT_ID"];
var connectionString = $"Data Source={Path.Combine(builder.Environment.ContentRootPath, "products.db")}";

builder.Services.AddSingleton(new AppSettings(telegramToken, telegramChatId, connectionString));
builder.Services.AddHttpClient();

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

await InitializeDatabaseAsync(connectionString);

app.MapGet("/api/products", async () => await GetAllProductsAsync(connectionString));

app.MapPost("/api/products", async (ProductRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { error = "El nombre del producto es obligatorio." });
    }

    var id = await CreateProductAsync(connectionString, request);
    return Results.Ok(new { id });
});

app.MapPut("/api/products/{id:int}", async (int id, ProductRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { error = "El nombre del producto es obligatorio." });
    }

    var changed = await UpdateProductAsync(connectionString, id, request);
    return changed > 0 ? Results.Ok(new { changes = changed }) : Results.NotFound(new { error = "Producto no encontrado." });
});

app.MapDelete("/api/products/{id:int}", async (int id) =>
{
    var changed = await DeleteProductAsync(connectionString, id);
    return changed > 0 ? Results.Ok(new { changes = changed }) : Results.NotFound(new { error = "Producto no encontrado." });
});

app.MapPost("/api/notify", async (NotificationRequest request, IHttpClientFactory httpClientFactory, AppSettings settings) =>
{
    if (request.ProductId <= 0 || string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new { error = "productId y message son obligatorios." });
    }

    if (string.IsNullOrWhiteSpace(settings.TelegramBotToken) || string.IsNullOrWhiteSpace(settings.TelegramChatId))
    {
        return Results.Problem("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.", statusCode: 500);
    }

    var product = await GetProductByIdAsync(connectionString, request.ProductId);
    if (product is null)
    {
        return Results.NotFound(new { error = "Producto no encontrado." });
    }

    var text = $"Producto: {product.Name}\nTipo: {product.Type}\nCantidad: {product.Quantity}\nEstado: {product.Status}\nMensaje: {request.Message}";
    var httpClient = httpClientFactory.CreateClient();
    var response = await httpClient.PostAsJsonAsync($"https://api.telegram.org/bot{settings.TelegramBotToken}/sendMessage", new
    {
        chat_id = settings.TelegramChatId,
        text
    });

    if (!response.IsSuccessStatusCode)
    {
        return Results.Problem("Error al enviar Telegram.", statusCode: 500);
    }

    var result = await response.Content.ReadFromJsonAsync<TelegramResponse>();
    if (result is null || !result.Ok)
    {
        return Results.Problem(result?.Description ?? "Error al enviar Telegram.", statusCode: 500);
    }

    return Results.Ok(new { success = true });
});

app.Run();

static async Task InitializeDatabaseAsync(string connectionString)
{
    await using var connection = new SqliteConnection(connectionString);
    await connection.OpenAsync();

    const string createTableSql = @"
        CREATE TABLE IF NOT EXISTS Products (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Type TEXT,
            Quantity INTEGER NOT NULL DEFAULT 0,
            Status TEXT NOT NULL DEFAULT 'activo',
            Notes TEXT,
            CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ";

    await using var command = connection.CreateCommand();
    command.CommandText = createTableSql;
    await command.ExecuteNonQueryAsync();
}

static async Task<List<Product>> GetAllProductsAsync(string connectionString)
{
    var products = new List<Product>();

    await using var connection = new SqliteConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = @"SELECT Id, Name, Type, Quantity, Status, Notes, CreatedAt FROM Products ORDER BY CreatedAt DESC";

    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        products.Add(new Product(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
            reader.GetInt32(3),
            reader.GetString(4),
            reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
            reader.GetString(6)));
    }

    return products;
}

static async Task<Product?> GetProductByIdAsync(string connectionString, int id)
{
    await using var connection = new SqliteConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = @"SELECT Id, Name, Type, Quantity, Status, Notes, CreatedAt FROM Products WHERE Id = $id";
    command.Parameters.AddWithValue("$id", id);

    await using var reader = await command.ExecuteReaderAsync();
    if (await reader.ReadAsync())
    {
        return new Product(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
            reader.GetInt32(3),
            reader.GetString(4),
            reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
            reader.GetString(6));
    }

    return null;
}

static async Task<int> CreateProductAsync(string connectionString, ProductRequest request)
{
    await using var connection = new SqliteConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = @"INSERT INTO Products (Name, Type, Quantity, Status, Notes) VALUES ($name, $type, $quantity, $status, $notes); SELECT last_insert_rowid();";
    command.Parameters.AddWithValue("$name", request.Name);
    command.Parameters.AddWithValue("$type", request.Type ?? string.Empty);
    command.Parameters.AddWithValue("$quantity", request.Quantity);
    command.Parameters.AddWithValue("$status", request.Status ?? "activo");
    command.Parameters.AddWithValue("$notes", request.Notes ?? string.Empty);

    var result = await command.ExecuteScalarAsync();
    return Convert.ToInt32(result);
}

static async Task<int> UpdateProductAsync(string connectionString, int id, ProductRequest request)
{
    await using var connection = new SqliteConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = @"UPDATE Products SET Name = $name, Type = $type, Quantity = $quantity, Status = $status, Notes = $notes WHERE Id = $id";
    command.Parameters.AddWithValue("$name", request.Name);
    command.Parameters.AddWithValue("$type", request.Type ?? string.Empty);
    command.Parameters.AddWithValue("$quantity", request.Quantity);
    command.Parameters.AddWithValue("$status", request.Status ?? "activo");
    command.Parameters.AddWithValue("$notes", request.Notes ?? string.Empty);
    command.Parameters.AddWithValue("$id", id);

    return await command.ExecuteNonQueryAsync();
}

static async Task<int> DeleteProductAsync(string connectionString, int id)
{
    await using var connection = new SqliteConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = @"DELETE FROM Products WHERE Id = $id";
    command.Parameters.AddWithValue("$id", id);

    return await command.ExecuteNonQueryAsync();
}

internal sealed record AppSettings(string? TelegramBotToken, string? TelegramChatId, string ConnectionString);
internal sealed record Product(int Id, string Name, string Type, int Quantity, string Status, string Notes, string CreatedAt);
internal sealed record ProductRequest(string Name, string? Type, int Quantity, string? Status, string? Notes);
internal sealed record NotificationRequest(int ProductId, string Message);
internal sealed record TelegramResponse(bool Ok, int? ErrorCode, string? Description);
