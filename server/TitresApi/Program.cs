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

var qualificationsValides = new[] { "Simple", "Fusion", "TUPE" };

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

const string ColonnesSociete = "Id, Nom, Principale, ValeurNominale, Pays, SiegeSocial, Siren, Lei";

app.MapGet("/api/societes", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var societes = await conn.QueryAsync<Societe>($"SELECT {ColonnesSociete} FROM dbo.Societes ORDER BY Nom");
    return Results.Ok(societes);
});

app.MapPost("/api/societes", async (SocieteInput input) =>
{
    var nom = input.Nom?.Trim();
    if (string.IsNullOrEmpty(nom))
        return Results.BadRequest("Le nom est requis.");

    var societe = new Societe(
        Guid.NewGuid(), nom, input.Principale, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Societes (Id, Nom, Principale, ValeurNominale, Pays, SiegeSocial, Siren, Lei) " +
        "VALUES (@Id, @Nom, @Principale, @ValeurNominale, @Pays, @SiegeSocial, @Siren, @Lei)",
        societe);
    return Results.Created($"/api/societes/{societe.Id}", societe);
});

app.MapPut("/api/societes/{id:guid}", async (Guid id, SocieteUpdate input) =>
{
    var nom = input.Nom?.Trim();
    if (string.IsNullOrEmpty(nom))
        return Results.BadRequest("Le nom est requis.");

    await using var conn = new SqlConnection(ConnectionString());
    var lignes = await conn.ExecuteAsync(
        "UPDATE dbo.Societes SET Nom = @Nom, Principale = @Principale, ValeurNominale = @ValeurNominale, " +
        "Pays = @Pays, SiegeSocial = @SiegeSocial, Siren = @Siren, Lei = @Lei WHERE Id = @id",
        new { id, Nom = nom, input.Principale, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei });
    return lignes > 0 ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/societes/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Societes WHERE Id = @id", new { id });
    return Results.NoContent();
});

const string ColonnesTransaction =
    "Id, AcheteurId, CibleId, CONVERT(varchar(10), [Date], 23) AS Date, NombreActions, Capital, " +
    "DroitVoteTheorique, DroitVoteExercable, VendeurId, PrixAction, Qualification";

app.MapGet("/api/transactions", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var transactions = await conn.QueryAsync<Transaction>(
        $"SELECT {ColonnesTransaction} FROM dbo.Transactions ORDER BY [Date] DESC");
    return Results.Ok(transactions);
});

(string? Erreur, string Qualification) ValiderTransaction(TransactionInput input)
{
    if (input.AcheteurId == input.CibleId)
        return ("La société acheteuse doit être différente de la société cible.", "");
    if (input.Capital == 0 || input.Capital < -100 || input.Capital > 100)
        return ("Le capital (%) doit être compris entre -100 et 100, sans être nul (négatif pour une vente).", "");
    if (input.DroitVoteTheorique is < -100 or > 100)
        return ("Le droit de vote théorique (%) doit être compris entre -100 et 100.", "");
    if (input.DroitVoteExercable is < -100 or > 100)
        return ("Le droit de vote exerçable (%) doit être compris entre -100 et 100.", "");
    if (input.PrixAction is < 0)
        return ("Le prix de l'action ne peut pas être négatif.", "");
    if (string.IsNullOrWhiteSpace(input.Date))
        return ("La date est requise.", "");

    var qualification = string.IsNullOrWhiteSpace(input.Qualification) ? "Simple" : input.Qualification;
    if (!qualificationsValides.Contains(qualification))
        return ("La qualification doit être Simple, Fusion ou TUPE.", "");

    return (null, qualification);
}

app.MapPost("/api/transactions", async (TransactionInput input) =>
{
    var (erreur, qualification) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    var transaction = new Transaction(
        Guid.NewGuid(), input.AcheteurId, input.CibleId, input.Date, input.NombreActions, input.Capital,
        input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, input.PrixAction, qualification);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Transactions (Id, AcheteurId, CibleId, [Date], NombreActions, Capital, DroitVoteTheorique, " +
        "DroitVoteExercable, VendeurId, PrixAction, Qualification) " +
        "VALUES (@Id, @AcheteurId, @CibleId, @Date, @NombreActions, @Capital, @DroitVoteTheorique, " +
        "@DroitVoteExercable, @VendeurId, @PrixAction, @Qualification)",
        transaction);
    return Results.Created($"/api/transactions/{transaction.Id}", transaction);
});

app.MapPut("/api/transactions/{id:guid}", async (Guid id, TransactionInput input) =>
{
    var (erreur, qualification) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());
    var lignes = await conn.ExecuteAsync(
        "UPDATE dbo.Transactions SET AcheteurId = @AcheteurId, CibleId = @CibleId, [Date] = @Date, " +
        "NombreActions = @NombreActions, Capital = @Capital, DroitVoteTheorique = @DroitVoteTheorique, " +
        "DroitVoteExercable = @DroitVoteExercable, VendeurId = @VendeurId, PrixAction = @PrixAction, " +
        "Qualification = @Qualification WHERE Id = @id",
        new
        {
            id, input.AcheteurId, input.CibleId, input.Date, input.NombreActions, input.Capital,
            input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, input.PrixAction, Qualification = qualification,
        });
    return lignes > 0 ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/transactions/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Transactions WHERE Id = @id", new { id });
    return Results.NoContent();
});

app.Run();

record Societe(
    Guid Id, string Nom, bool Principale, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei);

record SocieteInput(
    string? Nom,
    bool Principale = false,
    decimal? ValeurNominale = null,
    string? Pays = null,
    string? SiegeSocial = null,
    string? Siren = null,
    string? Lei = null);

record SocieteUpdate(
    string? Nom,
    bool Principale,
    decimal? ValeurNominale,
    string? Pays,
    string? SiegeSocial,
    string? Siren,
    string? Lei);

record Transaction(
    Guid Id,
    Guid AcheteurId,
    Guid CibleId,
    string Date,
    decimal? NombreActions,
    decimal Capital,
    decimal? DroitVoteTheorique,
    decimal? DroitVoteExercable,
    Guid? VendeurId,
    decimal? PrixAction,
    string Qualification);

record TransactionInput(
    Guid AcheteurId,
    Guid CibleId,
    string Date,
    decimal? NombreActions,
    decimal Capital,
    decimal? DroitVoteTheorique,
    decimal? DroitVoteExercable,
    Guid? VendeurId,
    decimal? PrixAction,
    string? Qualification);
