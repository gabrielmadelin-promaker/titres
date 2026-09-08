using Dapper;
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

// Sans ça, sc.exe démarre bien le processus mais celui-ci ne répond jamais
// au gestionnaire de services Windows (protocole SCM) -> erreur 1053
// "The service did not respond...". Ne change rien quand l'app tourne
// autrement (dotnet run, console) : le hook ne s'active qu'en tant que service.
builder.Host.UseWindowsService();

// Chargé explicitement (indépendamment d'ASPNETCORE_ENVIRONMENT) : le
// service Windows n'a pas de variable d'environnement à configurer, il
// suffit que ce fichier existe à côté de l'exécutable pour surcharger la
// chaîne de connexion et les origines CORS.
builder.Configuration.AddJsonFile("appsettings.Production.json", optional: true, reloadOnChange: false);

// L'API n'est joignable que depuis le réseau interne (pare-feu), pas
// exposée sur internet : pas besoin de restreindre les origines CORS, ça
// n'a fait qu'ajouter un mode de panne (mismatch d'URL) sans bénéfice réel.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();
app.UseCors();

string ConnectionString() =>
    app.Configuration.GetConnectionString("CalculDesTitres")
    is { Length: > 0 } cs
        ? cs
        : throw new InvalidOperationException(
            "ConnectionStrings:CalculDesTitres manquante — créez appsettings.Production.json à côté de l'exécutable.");

app.MapGet("/api/health", async () =>
{
    try
    {
        await using var conn = new SqlConnection(ConnectionString());
        await conn.ExecuteScalarAsync("SELECT 1");
        return Results.Ok(new { status = "ok" });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Connexion SQL Server impossible : {ex.Message}", statusCode: 503);
    }
});

app.MapGet("/api/societes", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var societes = await conn.QueryAsync<Societe>("SELECT Id, Nom, Principale FROM dbo.Societes ORDER BY Nom");
    return Results.Ok(societes);
});

app.MapPost("/api/societes", async (SocieteInput input) =>
{
    var nom = input.Nom?.Trim();
    if (string.IsNullOrEmpty(nom))
        return Results.BadRequest("Le nom est requis.");

    var societe = new Societe(Guid.NewGuid(), nom, input.Principale);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("INSERT INTO dbo.Societes (Id, Nom, Principale) VALUES (@Id, @Nom, @Principale)", societe);
    return Results.Created($"/api/societes/{societe.Id}", societe);
});

app.MapPut("/api/societes/{id:guid}", async (Guid id, SocieteUpdate input) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var lignes = await conn.ExecuteAsync(
        "UPDATE dbo.Societes SET Principale = @Principale WHERE Id = @id", new { id, input.Principale });
    return lignes > 0 ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/societes/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Societes WHERE Id = @id", new { id });
    return Results.NoContent();
});

app.MapGet("/api/transactions", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var transactions = await conn.QueryAsync<Transaction>(
        "SELECT Id, AcheteurId, CibleId, Pourcentage, CONVERT(varchar(10), [Date], 23) AS Date " +
        "FROM dbo.Transactions ORDER BY [Date] DESC");
    return Results.Ok(transactions);
});

app.MapPost("/api/transactions", async (TransactionInput input) =>
{
    if (input.AcheteurId == input.CibleId)
        return Results.BadRequest("La société acheteuse doit être différente de la société cible.");
    if (input.Pourcentage == 0 || input.Pourcentage < -100 || input.Pourcentage > 100)
        return Results.BadRequest("Le pourcentage doit être compris entre -100 et 100, sans être nul (négatif pour une vente).");
    if (string.IsNullOrWhiteSpace(input.Date))
        return Results.BadRequest("La date est requise.");

    var transaction = new Transaction(Guid.NewGuid(), input.AcheteurId, input.CibleId, input.Pourcentage, input.Date);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Transactions (Id, AcheteurId, CibleId, Pourcentage, [Date]) " +
        "VALUES (@Id, @AcheteurId, @CibleId, @Pourcentage, @Date)",
        transaction);
    return Results.Created($"/api/transactions/{transaction.Id}", transaction);
});

app.MapDelete("/api/transactions/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Transactions WHERE Id = @id", new { id });
    return Results.NoContent();
});

app.Run();

record Societe(Guid Id, string Nom, bool Principale);

record SocieteInput(string? Nom, bool Principale = false);

record SocieteUpdate(bool Principale);

record Transaction(Guid Id, Guid AcheteurId, Guid CibleId, decimal Pourcentage, string Date);

record TransactionInput(Guid AcheteurId, Guid CibleId, decimal Pourcentage, string Date);
