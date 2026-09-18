using System.Security.Cryptography;
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

// Authentification temporaire, en attendant le SSO : toute l'application
// (hors health-check et login lui-même) exige un jeton de session valide,
// vérifié à chaque requête. Pas de rôle vérifié ici : le rôle est pour
// l'instant seulement enregistré (voir écran "Utilisateurs"), pas encore
// utilisé pour restreindre quoi que ce soit.
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    var estRoutePublique =
        context.Request.Method == "OPTIONS"
        || !path.StartsWithSegments("/api")
        || path.StartsWithSegments("/api/health")
        || path.StartsWithSegments("/api/auth/login");
    if (estRoutePublique)
    {
        await next();
        return;
    }

    var enTete = context.Request.Headers["Authorization"].ToString();
    if (!enTete.StartsWith("Bearer ") || !Guid.TryParse(enTete["Bearer ".Length..], out var jeton))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsync("Authentification requise.");
        return;
    }

    await using var conn = new SqlConnection(ConnectionString());
    var session = await conn.QuerySingleOrDefaultAsync<SessionInfo>(
        "SELECT u.Email, u.Role FROM dbo.Sessions s " +
        "JOIN dbo.Utilisateurs u ON u.Id = s.UtilisateurId " +
        "WHERE s.Token = @jeton AND s.ExpireLe > SYSUTCDATETIME()",
        new { jeton });
    if (session is null)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsync("Session invalide ou expirée.");
        return;
    }

    context.Items["Email"] = session.Email;
    context.Items["Role"] = session.Role;
    await next();
});

var qualificationsValides = new[] { "Simple", "Fusion", "TUPE" };
var rolesValides = new[] { "DSI", "Direction des titres" };

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

const string ColonnesSociete = "Id, Nom, ValeurNominale, Pays, SiegeSocial, Siren, Lei";

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
        Guid.NewGuid(), nom, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Societes (Id, Nom, ValeurNominale, Pays, SiegeSocial, Siren, Lei) " +
        "VALUES (@Id, @Nom, @ValeurNominale, @Pays, @SiegeSocial, @Siren, @Lei)",
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
        "UPDATE dbo.Societes SET Nom = @Nom, ValeurNominale = @ValeurNominale, " +
        "Pays = @Pays, SiegeSocial = @SiegeSocial, Siren = @Siren, Lei = @Lei WHERE Id = @id",
        new { id, Nom = nom, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei });
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
    "DroitVoteTheorique, DroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction, Qualification, PlusValue";

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

// PlusValue n'est jamais saisie : calculée et enregistrée à chaque création
// ou modification d'une transaction, qu'il s'agisse d'un achat ou d'une
// vente. Le prix de cette transaction est comparé au prix de la
// transaction la plus ancienne connue pour la même société cible
// (idAExclure évite qu'une modification se compare à sa propre ancienne
// valeur en base) ; sinon la plus-value vaut 0.
async Task<decimal?> CalculerPlusValue(
    SqlConnection conn, Guid cibleId, decimal? nombreActions, decimal? prixActionActuel, Guid? idAExclure)
{
    if (nombreActions is null)
        return 0m;
    if (prixActionActuel is null)
        return null;

    var prixAncien = await conn.QuerySingleOrDefaultAsync<decimal?>(
        "SELECT TOP 1 PrixAction FROM dbo.Transactions " +
        "WHERE CibleId = @cibleId AND (@idAExclure IS NULL OR Id <> @idAExclure) " +
        "ORDER BY [Date] ASC, Id ASC",
        new { cibleId, idAExclure });
    if (prixAncien is null)
        return null;

    return -nombreActions * (prixActionActuel - prixAncien);
}

app.MapPost("/api/transactions", async (TransactionInput input) =>
{
    var (erreur, qualification, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());
    var plusValue = await CalculerPlusValue(conn, input.CibleId, input.NombreActions, input.PrixAction, null);

    var transaction = new Transaction(
        Guid.NewGuid(), input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions,
        input.Capital, input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, vendeurNomExterne,
        input.PrixAction, qualification, plusValue);
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Transactions (Id, AcheteurId, AcheteurNomExterne, CibleId, [Date], NombreActions, Capital, " +
        "DroitVoteTheorique, DroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction, Qualification, PlusValue) " +
        "VALUES (@Id, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date, @NombreActions, @Capital, @DroitVoteTheorique, " +
        "@DroitVoteExercable, @VendeurId, @VendeurNomExterne, @PrixAction, @Qualification, @PlusValue)",
        transaction);
    return Results.Created($"/api/transactions/{transaction.Id}", transaction);
});

app.MapPut("/api/transactions/{id:guid}", async (Guid id, TransactionInput input) =>
{
    var (erreur, qualification, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());
    var plusValue = await CalculerPlusValue(conn, input.CibleId, input.NombreActions, input.PrixAction, id);

    var lignes = await conn.ExecuteAsync(
        "UPDATE dbo.Transactions SET AcheteurId = @AcheteurId, AcheteurNomExterne = @AcheteurNomExterne, " +
        "CibleId = @CibleId, [Date] = @Date, NombreActions = @NombreActions, Capital = @Capital, " +
        "DroitVoteTheorique = @DroitVoteTheorique, DroitVoteExercable = @DroitVoteExercable, VendeurId = @VendeurId, " +
        "VendeurNomExterne = @VendeurNomExterne, PrixAction = @PrixAction, Qualification = @Qualification, " +
        "PlusValue = @PlusValue WHERE Id = @id",
        new
        {
            id, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions, input.Capital,
            input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, vendeurNomExterne, input.PrixAction,
            Qualification = qualification, PlusValue = plusValue,
        });
    if (lignes == 0)
        return Results.NotFound();

    var transaction = new Transaction(
        id, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions,
        input.Capital, input.DroitVoteTheorique, input.DroitVoteExercable, input.VendeurId, vendeurNomExterne,
        input.PrixAction, qualification, plusValue);
    return Results.Ok(transaction);
});

app.MapDelete("/api/transactions/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Transactions WHERE Id = @id", new { id });
    return Results.NoContent();
});

// Génère un mot de passe temporaire de 10 caractères, sans les caractères
// ambigus à recopier (0/O, 1/l/I). Pas de niveau cryptographique requis vu
// l'usage (solution provisoire en attendant le SSO), mais RandomNumberGenerator
// coûte le même prix qu'un Random classique et évite d'y penser deux fois.
string GenererMotDePasse()
{
    const string caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    var octets = RandomNumberGenerator.GetBytes(10);
    var motDePasse = new char[10];
    for (var i = 0; i < 10; i++)
        motDePasse[i] = caracteres[octets[i] % caracteres.Length];
    return new string(motDePasse);
}

app.MapPost("/api/auth/login", async (LoginInput input) =>
{
    var email = input.Email?.Trim();
    if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(input.MotDePasse))
        return Results.BadRequest("Email et mot de passe requis.");

    await using var conn = new SqlConnection(ConnectionString());
    var utilisateur = await conn.QuerySingleOrDefaultAsync<UtilisateurAuth>(
        "SELECT Id, Email, MotDePasse, Role FROM dbo.Utilisateurs WHERE LOWER(Email) = LOWER(@email)",
        new { email });
    if (utilisateur is null || utilisateur.MotDePasse != input.MotDePasse)
        return Results.Unauthorized();

    var jeton = Guid.NewGuid();
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Sessions (Token, UtilisateurId, ExpireLe) VALUES (@jeton, @UtilisateurId, DATEADD(DAY, 30, SYSUTCDATETIME()))",
        new { jeton, UtilisateurId = utilisateur.Id });
    return Results.Ok(new { token = jeton, utilisateur.Email, utilisateur.Role });
});

app.MapPost("/api/auth/logout", async (HttpContext ctx) =>
{
    var enTete = ctx.Request.Headers["Authorization"].ToString();
    if (enTete.StartsWith("Bearer ") && Guid.TryParse(enTete["Bearer ".Length..], out var jeton))
    {
        await using var conn = new SqlConnection(ConnectionString());
        await conn.ExecuteAsync("DELETE FROM dbo.Sessions WHERE Token = @jeton", new { jeton });
    }
    return Results.NoContent();
});

app.MapGet("/api/auth/me", IResult (HttpContext ctx) =>
{
    if (ctx.Items["Email"] is string email && ctx.Items["Role"] is string role)
        return Results.Ok(new { email, role });
    return Results.Unauthorized();
});

const string ColonnesUtilisateur = "Id, Email, MotDePasse, Role, CreeLe";

// Seul le rôle DSI a accès à cet écran et à ces données (mots de passe en
// clair inclus) — unique restriction de rôle pour l'instant, sur demande
// explicite ; tout le reste de l'API reste ouvert à n'importe quel rôle.
bool EstDsi(HttpContext ctx) => ctx.Items["Role"] as string == "DSI";

app.MapGet("/api/utilisateurs", async (HttpContext ctx) =>
{
    if (!EstDsi(ctx))
        return Results.Problem("Réservé au rôle DSI.", statusCode: StatusCodes.Status403Forbidden);

    await using var conn = new SqlConnection(ConnectionString());
    var utilisateurs = await conn.QueryAsync<Utilisateur>(
        $"SELECT {ColonnesUtilisateur} FROM dbo.Utilisateurs ORDER BY Email");
    return Results.Ok(utilisateurs);
});

app.MapPost("/api/utilisateurs", async (HttpContext ctx, UtilisateurInput input) =>
{
    if (!EstDsi(ctx))
        return Results.Problem("Réservé au rôle DSI.", statusCode: StatusCodes.Status403Forbidden);

    var email = input.Email?.Trim();
    if (string.IsNullOrEmpty(email))
        return Results.BadRequest("L'email est requis.");
    if (string.IsNullOrEmpty(input.Role) || !rolesValides.Contains(input.Role))
        return Results.BadRequest("Le rôle doit être DSI ou Direction des titres.");

    var utilisateur = new Utilisateur(Guid.NewGuid(), email, GenererMotDePasse(), input.Role, DateTime.UtcNow);
    await using var conn = new SqlConnection(ConnectionString());
    try
    {
        await conn.ExecuteAsync(
            "INSERT INTO dbo.Utilisateurs (Id, Email, MotDePasse, Role) VALUES (@Id, @Email, @MotDePasse, @Role)",
            utilisateur);
    }
    catch (SqlException ex) when (ex.Number is 2601 or 2627)
    {
        return Results.Conflict($"Un utilisateur avec l'email « {email} » existe déjà.");
    }
    return Results.Created($"/api/utilisateurs/{utilisateur.Id}", utilisateur);
});

app.MapDelete("/api/utilisateurs/{id:guid}", async (HttpContext ctx, Guid id) =>
{
    if (!EstDsi(ctx))
        return Results.Problem("Réservé au rôle DSI.", statusCode: StatusCodes.Status403Forbidden);

    await using var conn = new SqlConnection(ConnectionString());
    var total = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.Utilisateurs");
    if (total <= 1)
        return Results.BadRequest("Impossible de supprimer le dernier utilisateur : plus personne ne pourrait se connecter.");

    await conn.ExecuteAsync("DELETE FROM dbo.Utilisateurs WHERE Id = @id", new { id });
    return Results.NoContent();
});

app.Run();

record Societe(
    Guid Id, string Nom, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei);

record SocieteInput(
    string? Nom,
    decimal? ValeurNominale = null,
    string? Pays = null,
    string? SiegeSocial = null,
    string? Siren = null,
    string? Lei = null);

record SocieteUpdate(
    string? Nom,
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
    string Qualification,
    decimal? PlusValue);

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

record SessionInfo(string Email, string Role);

record LoginInput(string? Email, string? MotDePasse);

// Utilisé uniquement pour la vérification du mot de passe au login : jamais
// renvoyé tel quel au client (le login ne renvoie que email/role/token).
record UtilisateurAuth(Guid Id, string Email, string MotDePasse, string Role);

// MotDePasse est ici volontairement inclus dans ce qui est renvoyé au
// client (liste et création) : c'est le seul moyen, en attendant le SSO,
// qu'un administrateur puisse le relire pour le communiquer.
record Utilisateur(Guid Id, string Email, string MotDePasse, string Role, DateTime CreeLe);

record UtilisateurInput(string? Email, string? Role);
