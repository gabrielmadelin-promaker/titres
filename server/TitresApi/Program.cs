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
    "Id, AcheteurId, AcheteurNomExterne, CibleId, CONVERT(varchar(10), [Date], 23) AS Date, NombreActions, Capital, " +
    "DroitVoteTheorique, DroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction, Qualification";

app.MapGet("/api/transactions", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var transactions = await conn.QueryAsync<Transaction>(
        $"SELECT {ColonnesTransaction} FROM dbo.Transactions ORDER BY [Date] DESC");
    return Results.Ok(transactions);
});

(string? Erreur, string Qualification, string? AcheteurNomExterne, string? VendeurNomExterne) ValiderTransaction(TransactionInput input)
{
    var acheteurNomExterne = string.IsNullOrWhiteSpace(input.AcheteurNomExterne) ? null : input.AcheteurNomExterne.Trim();
    var vendeurNomExterne = string.IsNullOrWhiteSpace(input.VendeurNomExterne) ? null : input.VendeurNomExterne.Trim();

    // Acheteur : soit une société suivie (AcheteurId), soit un nom libre
    // (AcheteurNomExterne) pour un tiers hors groupe — jamais les deux, ni aucun des deux.
    if ((input.AcheteurId is null) == (acheteurNomExterne is null))
        return ("Renseignez la société acheteuse (dans la liste, ou son nom si elle est hors groupe).", "", null, null);
    // Vendeur : facultatif, mais pas les deux à la fois si renseigné.
    if (input.VendeurId is not null && vendeurNomExterne is not null)
        return ("La société vendeuse ne peut pas être à la fois suivie et hors groupe.", "", null, null);
    if (input.AcheteurId is not null && input.AcheteurId == input.CibleId)
        return ("La société acheteuse doit être différente de la société cible.", "", null, null);
    if (input.Capital == 0 || input.Capital < -100 || input.Capital > 100)
        return ("Le capital (%) doit être compris entre -100 et 100, sans être nul (négatif pour une vente).", "", null, null);
    if (input.DroitVoteTheorique is < -100 or > 100)
        return ("Le droit de vote théorique (%) doit être compris entre -100 et 100.", "", null, null);
    if (input.DroitVoteExercable is < -100 or > 100)
        return ("Le droit de vote exerçable (%) doit être compris entre -100 et 100.", "", null, null);
    if (input.PrixAction is < 0)
        return ("Le prix de l'action ne peut pas être négatif.", "", null, null);
    if (string.IsNullOrWhiteSpace(input.Date))
        return ("La date est requise.", "", null, null);

    var qualification = string.IsNullOrWhiteSpace(input.Qualification) ? "Simple" : input.Qualification;
    if (!qualificationsValides.Contains(qualification))
        return ("La qualification doit être Simple, Fusion ou TUPE.", "", null, null);

    return (null, qualification, acheteurNomExterne, vendeurNomExterne);
}

app.MapPost("/api/transactions", async (TransactionInput input) =>
{
    var (erreur, qualification, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    var transaction = new Transaction(
        Guid.NewGuid(), input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions,
        input.Capital, input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, vendeurNomExterne,
        input.PrixAction, qualification);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Transactions (Id, AcheteurId, AcheteurNomExterne, CibleId, [Date], NombreActions, Capital, " +
        "DroitVoteTheorique, DroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction, Qualification) " +
        "VALUES (@Id, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date, @NombreActions, @Capital, @DroitVoteTheorique, " +
        "@DroitVoteExercable, @VendeurId, @VendeurNomExterne, @PrixAction, @Qualification)",
        transaction);
    return Results.Created($"/api/transactions/{transaction.Id}", transaction);
});

app.MapPut("/api/transactions/{id:guid}", async (Guid id, TransactionInput input) =>
{
    var (erreur, qualification, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());
    var lignes = await conn.ExecuteAsync(
        "UPDATE dbo.Transactions SET AcheteurId = @AcheteurId, AcheteurNomExterne = @AcheteurNomExterne, " +
        "CibleId = @CibleId, [Date] = @Date, NombreActions = @NombreActions, Capital = @Capital, " +
        "DroitVoteTheorique = @DroitVoteTheorique, DroitVoteExercable = @DroitVoteExercable, VendeurId = @VendeurId, " +
        "VendeurNomExterne = @VendeurNomExterne, PrixAction = @PrixAction, Qualification = @Qualification WHERE Id = @id",
        new
        {
            id, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions, input.Capital,
            input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, vendeurNomExterne, input.PrixAction,
            Qualification = qualification,
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
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreActions,
    decimal Capital,
    decimal? DroitVoteTheorique,
    decimal? DroitVoteExercable,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    string Qualification);

record TransactionInput(
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreActions,
    decimal Capital,
    decimal? DroitVoteTheorique,
    decimal? DroitVoteExercable,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    string? Qualification);
