using System.Data;
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

    var societe = new Societe(Guid.NewGuid(), nom, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei);
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

// Le nombre total d'actions n'est pas une colonne de HistoriqueTotauxSociete :
// c'est la somme de ses lignes de détail par Type (HistoriqueTotalActionsType,
// jamais stockée directement — voir le record HistoriqueTotalSociete). Les
// deux tables sont donc toujours lues/écrites ensemble, comme un seul objet
// du point de vue de l'API (POST/PUT prennent la liste complète des lignes
// de détail et la remplacent intégralement, en une transaction SQL).
async Task<List<HistoriqueTotalSociete>> ChargerHistoriqueTotaux(SqlConnection conn)
{
    var parents = (await conn.QueryAsync<HistoriqueTotalSocieteSansDetail>(
        "SELECT Id, SocieteId, CONVERT(varchar(10), DateEffet, 23) AS DateEffet, " +
        "NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable " +
        "FROM dbo.HistoriqueTotauxSociete ORDER BY DateEffet")).ToList();
    var lignes = await conn.QueryAsync<LigneActionsParTypeAvecParent>(
        "SELECT HistoriqueTotalSocieteId, Type, Quantite FROM dbo.HistoriqueTotalActionsType");
    var lignesParParent = lignes
        .GroupBy(l => l.HistoriqueTotalSocieteId)
        .ToDictionary(g => g.Key, g => (IReadOnlyList<LigneActionsParType>)g.Select(l => new LigneActionsParType(l.Type, l.Quantite)).ToList());

    return parents
        .Select(p => new HistoriqueTotalSociete(
            p.Id, p.SocieteId, p.DateEffet, p.NombreTotalDroitVoteTheorique, p.NombreTotalDroitVoteExercable,
            lignesParParent.GetValueOrDefault(p.Id, Array.Empty<LigneActionsParType>())))
        .ToList();
}

app.MapGet("/api/historique-totaux-societe", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    return Results.Ok(await ChargerHistoriqueTotaux(conn));
});

app.MapPost("/api/historique-totaux-societe", async (HistoriqueTotalSocieteInput input) =>
{
    var dateEffet = input.DateEffet;
    if (string.IsNullOrWhiteSpace(dateEffet))
        return Results.BadRequest("La date d'effet est requise.");

    var lignesActions = (input.ActionsParType ?? []).Where(l => l.Quantite != 0).ToList();
    var id = Guid.NewGuid();

    await using var conn = new SqlConnection(ConnectionString());
    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    try
    {
        await conn.ExecuteAsync(
            "INSERT INTO dbo.HistoriqueTotauxSociete (Id, SocieteId, DateEffet, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable) " +
            "VALUES (@Id, @SocieteId, @DateEffet, @NombreTotalDroitVoteTheorique, @NombreTotalDroitVoteExercable)",
            new { Id = id, input.SocieteId, DateEffet = dateEffet, input.NombreTotalDroitVoteTheorique, input.NombreTotalDroitVoteExercable },
            sqlTx);

        foreach (var ligne in lignesActions)
            await conn.ExecuteAsync(
                "INSERT INTO dbo.HistoriqueTotalActionsType (Id, HistoriqueTotalSocieteId, Type, Quantite) VALUES (NEWID(), @id, @Type, @Quantite)",
                new { id, ligne.Type, ligne.Quantite }, sqlTx);

        var erreurComptes = await AssurerComptesParType(conn, sqlTx, input.SocieteId, lignesActions);
        if (erreurComptes is not null)
        {
            await sqlTx.RollbackAsync();
            return Results.BadRequest(erreurComptes);
        }

        await sqlTx.CommitAsync();
    }
    catch (SqlException e) when (e.Number == 2627)
    {
        await sqlTx.RollbackAsync();
        return Results.BadRequest("Cette société a déjà une ligne d'historique à cette date d'effet, ou un Type est en double.");
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }

    var cree = new HistoriqueTotalSociete(id, input.SocieteId, dateEffet, input.NombreTotalDroitVoteTheorique, input.NombreTotalDroitVoteExercable, lignesActions);
    return Results.Created($"/api/historique-totaux-societe/{id}", cree);
});

app.MapPut("/api/historique-totaux-societe/{id:guid}", async (Guid id, HistoriqueTotalSocieteInput input) =>
{
    var dateEffet = input.DateEffet;
    if (string.IsNullOrWhiteSpace(dateEffet))
        return Results.BadRequest("La date d'effet est requise.");

    var lignesActions = (input.ActionsParType ?? []).Where(l => l.Quantite != 0).ToList();

    await using var conn = new SqlConnection(ConnectionString());
    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    int lignes;
    try
    {
        lignes = await conn.ExecuteAsync(
            "UPDATE dbo.HistoriqueTotauxSociete SET SocieteId = @SocieteId, DateEffet = @DateEffet, " +
            "NombreTotalDroitVoteTheorique = @NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable = @NombreTotalDroitVoteExercable " +
            "WHERE Id = @id",
            new { id, input.SocieteId, DateEffet = dateEffet, input.NombreTotalDroitVoteTheorique, input.NombreTotalDroitVoteExercable },
            sqlTx);

        if (lignes > 0)
        {
            await conn.ExecuteAsync("DELETE FROM dbo.HistoriqueTotalActionsType WHERE HistoriqueTotalSocieteId = @id", new { id }, sqlTx);
            foreach (var ligne in lignesActions)
                await conn.ExecuteAsync(
                    "INSERT INTO dbo.HistoriqueTotalActionsType (Id, HistoriqueTotalSocieteId, Type, Quantite) VALUES (NEWID(), @id, @Type, @Quantite)",
                    new { id, ligne.Type, ligne.Quantite }, sqlTx);

            var erreurComptes = await AssurerComptesParType(conn, sqlTx, input.SocieteId, lignesActions);
            if (erreurComptes is not null)
            {
                await sqlTx.RollbackAsync();
                return Results.BadRequest(erreurComptes);
            }
        }

        await sqlTx.CommitAsync();
    }
    catch (SqlException e) when (e.Number == 2627)
    {
        await sqlTx.RollbackAsync();
        return Results.BadRequest("Un Type est en double pour cette ligne d'historique.");
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }

    return lignes > 0 ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/historique-totaux-societe/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.HistoriqueTotauxSociete WHERE Id = @id", new { id });
    return Results.NoContent();
});

const string ColonnesType = "Id, Nom";

app.MapGet("/api/types", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var types = await conn.QueryAsync<TypeTitre>($"SELECT {ColonnesType} FROM dbo.Types ORDER BY Nom");
    return Results.Ok(types);
});

app.MapPost("/api/types", async (TypeTitreInput input) =>
{
    var nom = input.Nom?.Trim();
    if (string.IsNullOrEmpty(nom))
        return Results.BadRequest("Le nom est requis.");

    var type = new TypeTitre(Guid.NewGuid(), nom);
    await using var conn = new SqlConnection(ConnectionString());
    try
    {
        await conn.ExecuteAsync("INSERT INTO dbo.Types (Id, Nom) VALUES (@Id, @Nom)", type);
    }
    catch (SqlException e) when (e.Number == 2627)
    {
        return Results.BadRequest($"Le type « {nom} » existe déjà.");
    }
    return Results.Created($"/api/types/{type.Id}", type);
});

app.MapDelete("/api/types/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Types WHERE Id = @id", new { id });
    return Results.NoContent();
});

const string ColonnesCompte = "Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom";

app.MapGet("/api/comptes", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var comptes = await conn.QueryAsync<Compte>($"SELECT {ColonnesCompte} FROM dbo.Comptes ORDER BY Nom");
    return Results.Ok(comptes);
});

(string? Erreur, string? Nom, string? DetenteurNomExterne) ValiderCompteInput(CompteInput input)
{
    var nom = input.Nom?.Trim();
    if (string.IsNullOrEmpty(nom))
        return ("Le nom du compte est requis.", null, null);
    var detenteurNomExterne = string.IsNullOrWhiteSpace(input.DetenteurNomExterne) ? null : input.DetenteurNomExterne.Trim();
    if ((input.DetenteurId is null) == (detenteurNomExterne is null))
        return ("Renseignez le détenteur du compte (dans la liste, ou son nom si hors groupe).", null, null);
    return (null, nom, detenteurNomExterne);
}

app.MapPost("/api/comptes", async (CompteInput input) =>
{
    var (erreur, nom, detenteurNomExterne) = ValiderCompteInput(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    var compte = new Compte(Guid.NewGuid(), input.DetenteurId, detenteurNomExterne, input.SocieteEmettriceId, input.Type, nom!);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Comptes (Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom) " +
        "VALUES (@Id, @DetenteurId, @DetenteurNomExterne, @SocieteEmettriceId, @Type, @Nom)",
        compte);
    return Results.Created($"/api/comptes/{compte.Id}", compte);
});

app.MapPut("/api/comptes/{id:guid}", async (Guid id, CompteInput input) =>
{
    var (erreur, nom, detenteurNomExterne) = ValiderCompteInput(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());
    var lignes = await conn.ExecuteAsync(
        "UPDATE dbo.Comptes SET DetenteurId = @DetenteurId, DetenteurNomExterne = @DetenteurNomExterne, " +
        "SocieteEmettriceId = @SocieteEmettriceId, Type = @Type, Nom = @Nom WHERE Id = @id",
        new { id, input.DetenteurId, detenteurNomExterne, input.SocieteEmettriceId, input.Type, Nom = nom });
    return lignes > 0 ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/comptes/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Comptes WHERE Id = @id", new { id });
    return Results.NoContent();
});

// Résout le Compte d'un camp (acheteur ou vendeur) d'une ligne de
// transaction, ou d'une ligne de ventilation des totaux d'une société :
// - Si `compteIdSaisi` est renseigné, le valide (même détenteur, même
//   société émettrice si le compte en a une, même Catégorie si le compte en
//   a une) et le renvoie tel quel.
// - Sinon, cherche un Compte déjà existant pour (détenteur, société,
//   Catégorie) et le réutilise s'il est unique ; s'il n'en existe aucun, en
//   crée un nouveau (nommé automatiquement "{société} - {catégorie} - {n}") ;
//   s'il en existe PLUSIEURS, impossible de deviner lequel utiliser — erreur,
//   l'utilisateur doit choisir explicitement.
// Ne résout rien (renvoie null, null) si aucun détenteur n'est connu (ex.
// vendeur non renseigné sur une transaction).
async Task<(string? Erreur, Guid? CompteId)> ResoudreCompte(
    SqlConnection conn, IDbTransaction tx, Guid? compteIdSaisi,
    Guid? detenteurId, string? detenteurNomExterne,
    Guid societeId, string nomSociete, string? categorie, string role)
{
    if (compteIdSaisi is not null)
    {
        var compte = await conn.QuerySingleOrDefaultAsync<Compte>(
            $"SELECT {ColonnesCompte} FROM dbo.Comptes WHERE Id = @compteIdSaisi", new { compteIdSaisi }, tx);
        if (compte is null)
            return ($"Le compte sélectionné pour le {role} est introuvable.", null);
        var memeDetenteur = detenteurId is not null ? compte.DetenteurId == detenteurId : compte.DetenteurNomExterne == detenteurNomExterne;
        if (!memeDetenteur)
            return ($"Le compte sélectionné pour le {role} n'appartient pas à ce détenteur.", null);
        if (compte.SocieteEmettriceId is not null && compte.SocieteEmettriceId != societeId)
            return ($"Le compte sélectionné pour le {role} est dédié à une autre société.", null);
        if (compte.Type is not null && categorie is not null && compte.Type != categorie)
            return ($"Le compte sélectionné pour le {role} est dédié à la Catégorie « {compte.Type} », différente de celle de cette ligne.", null);
        return (null, compte.Id);
    }

    if (detenteurId is null && detenteurNomExterne is null)
        return (null, null);

    var existants = (await conn.QueryAsync<Compte>(
        $"SELECT {ColonnesCompte} FROM dbo.Comptes WHERE " +
        "((@detenteurId IS NOT NULL AND DetenteurId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
        "AND SocieteEmettriceId = @societeId " +
        "AND ((@categorie IS NULL AND Type IS NULL) OR Type = @categorie)",
        new { detenteurId, detenteurNomExterne, societeId, categorie }, tx)).ToList();

    if (existants.Count == 1)
        return (null, existants[0].Id);
    if (existants.Count > 1)
        return ($"Plusieurs comptes existent déjà pour le {role} sur cette société et cette Catégorie : choisissez-en un explicitement.", null);

    var n = await conn.ExecuteScalarAsync<int>(
        "SELECT COUNT(*) FROM dbo.Comptes WHERE " +
        "((@detenteurId IS NOT NULL AND DetenteurId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
        "AND SocieteEmettriceId = @societeId",
        new { detenteurId, detenteurNomExterne, societeId }, tx);
    var nouveauCompteId = Guid.NewGuid();
    var nom = $"{nomSociete} - {categorie ?? "Non catégorisé"} - {n + 1}";
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Comptes (Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom) " +
        "VALUES (@Id, @detenteurId, @detenteurNomExterne, @societeId, @categorie, @nom)",
        new { Id = nouveauCompteId, detenteurId, detenteurNomExterne, societeId, categorie, nom }, tx);
    return (null, nouveauCompteId);
}

// S'assure qu'un Compte existe pour chaque ligne de ventilation par
// Catégorie du nombre d'actions d'une société (voir dbo.HistoriqueTotalActionsType) :
// la société est traitée comme sa propre détentrice par défaut (pool des
// actions émises mais pas encore distribuées à un actionnaire précis), afin
// qu'un Compte existe déjà à choisir comme vendeur lors de la première
// transaction qui distribue réellement ces actions.
async Task<string?> AssurerComptesParType(SqlConnection conn, IDbTransaction tx, Guid societeId, List<LigneActionsParType> lignes)
{
    if (lignes.Count == 0)
        return null;
    var nomSociete = await conn.QuerySingleOrDefaultAsync<string>(
        "SELECT Nom FROM dbo.Societes WHERE Id = @societeId", new { societeId }, tx);
    if (nomSociete is null)
        return null;

    foreach (var ligne in lignes)
    {
        var (erreur, _) = await ResoudreCompte(conn, tx, null, societeId, null, societeId, nomSociete, ligne.Type, "la société émettrice");
        if (erreur is not null)
            return erreur;
    }
    return null;
}

const string ColonnesTransaction =
    "Id, AcheteurId, AcheteurNomExterne, CibleId, CONVERT(varchar(10), [Date], 23) AS Date, " +
    "NombreDroitVoteTheorique, NombreDroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction";

const string ColonnesLigneTransaction = "Id, TransactionId, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId";

// Une transaction peut porter sur plusieurs Catégories à la fois (voir
// dbo.TransactionLignes) : les deux tables sont donc toujours lues/écrites
// ensemble, comme un seul objet du point de vue de l'API — même principe
// que ChargerHistoriqueTotaux pour les totaux par Catégorie d'une société.
async Task<List<Transaction>> ChargerTransactions(SqlConnection conn)
{
    var parents = (await conn.QueryAsync<TransactionSansLignes>(
        $"SELECT {ColonnesTransaction} FROM dbo.Transactions ORDER BY [Date] DESC")).ToList();
    var lignes = await conn.QueryAsync<LigneTransactionAvecParent>(
        $"SELECT {ColonnesLigneTransaction} FROM dbo.TransactionLignes");
    // PlusValue n'est jamais lue depuis une colonne (voir CalculerPlusValues) :
    // toujours recalculée à la volée, par ligne, pour rester exacte même si
    // la règle de calcul évolue sans qu'aucune ligne n'ait été rééditée depuis.
    var plusValues = await CalculerPlusValues(conn);
    var lignesParParent = lignes
        .GroupBy(l => l.TransactionId)
        .ToDictionary(
            g => g.Key,
            g => (IReadOnlyList<LigneTransaction>)g
                .Select(l => new LigneTransaction(l.Id, l.Categorie, l.NombreActions, l.CompteAcheteurId, l.CompteVendeurId, plusValues.GetValueOrDefault(l.Id)))
                .ToList());

    return parents
        .Select(p => new Transaction(
            p.Id, p.AcheteurId, p.AcheteurNomExterne, p.CibleId, p.Date,
            p.NombreDroitVoteTheorique, p.NombreDroitVoteExercable, p.VendeurId, p.VendeurNomExterne, p.PrixAction,
            lignesParParent.GetValueOrDefault(p.Id, Array.Empty<LigneTransaction>())))
        .ToList();
}

async Task<Transaction> ChargerTransaction(SqlConnection conn, Guid id)
{
    var toutes = await ChargerTransactions(conn);
    return toutes.First(t => t.Id == id);
}

app.MapGet("/api/transactions", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    return Results.Ok(await ChargerTransactions(conn));
});

(string? Erreur, string? AcheteurNomExterne, string? VendeurNomExterne) ValiderTransaction(TransactionInput input)
{
    var acheteurNomExterne = string.IsNullOrWhiteSpace(input.AcheteurNomExterne) ? null : input.AcheteurNomExterne.Trim();
    var vendeurNomExterne = string.IsNullOrWhiteSpace(input.VendeurNomExterne) ? null : input.VendeurNomExterne.Trim();

    // Acheteur : soit une société suivie (AcheteurId), soit un nom libre
    // (AcheteurNomExterne) pour un tiers hors groupe — jamais les deux, ni aucun des deux.
    if ((input.AcheteurId is null) == (acheteurNomExterne is null))
        return ("Renseignez la société acheteuse (dans la liste, ou son nom si elle est hors groupe).", null, null);
    // Vendeur : facultatif, mais pas les deux à la fois si renseigné.
    if (input.VendeurId is not null && vendeurNomExterne is not null)
        return ("La société vendeuse ne peut pas être à la fois suivie et hors groupe.", null, null);
    if (input.AcheteurId is not null && input.AcheteurId == input.CibleId)
        return ("La société acheteuse doit être différente de la société cible.", null, null);
    if (input.Lignes is null || input.Lignes.Count == 0)
        return ("Au moins une ligne (Catégorie, nombre d'actions) est requise.", null, null);
    foreach (var ligne in input.Lignes)
        if (ligne.NombreActions is null or 0)
            return ("Le nombre d'actions de chaque ligne est requis, et ne peut pas être nul (négatif pour une vente).", null, null);
    if (input.PrixAction is < 0)
        return ("Le prix de l'action ne peut pas être négatif.", null, null);
    if (string.IsNullOrWhiteSpace(input.Date))
        return ("La date est requise.", null, null);

    return (null, acheteurNomExterne, vendeurNomExterne);
}

// Résout (valide le compte saisi, ou en trouve/crée un automatiquement —
// voir ResoudreCompte) le Compte acheteur et vendeur de chaque ligne d'une
// transaction. S'arrête à la première erreur rencontrée.
async Task<(string? Erreur, List<(string? Categorie, decimal NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId)>? Lignes)> ResoudreComptesLignes(
    SqlConnection conn, IDbTransaction tx, TransactionInput input, string? acheteurNomExterne, string? vendeurNomExterne, string nomCible)
{
    var resultat = new List<(string?, decimal, Guid?, Guid?)>();
    foreach (var ligne in input.Lignes!)
    {
        var (erreurA, compteAcheteurId) = await ResoudreCompte(
            conn, tx, ligne.CompteAcheteurId, input.AcheteurId, acheteurNomExterne, input.CibleId, nomCible, ligne.Categorie, "acheteur");
        if (erreurA is not null)
            return (erreurA, null);

        var (erreurV, compteVendeurId) = await ResoudreCompte(
            conn, tx, ligne.CompteVendeurId, input.VendeurId, vendeurNomExterne, input.CibleId, nomCible, ligne.Categorie, "vendeur");
        if (erreurV is not null)
            return (erreurV, null);

        resultat.Add((ligne.Categorie, ligne.NombreActions!.Value, compteAcheteurId, compteVendeurId));
    }
    return (null, resultat);
}

// PlusValue n'est jamais saisie, ni stockée en base : recalculée à chaque
// lecture (voir CalculerPlusValues). Basée sur le FIFO réel des lots
// d'Actions consommés par cette ligne de transaction (voir ConsommerLots) :
// prix de cette transaction moins le prix d'origine moyen, pondéré par
// quantité, des titres effectivement vendus — mathématiquement équivalent à
// la somme tranche par tranche (prix de vente − prix de chaque lot
// consommé) × sa quantité, puisque la vente se fait à un prix unique pour
// toute la transaction. Nulle si cette ligne n'a fait perdre aucun titre à
// personne (ex. achat externe pur, sans consommation d'un lot existant) :
// il n'y a alors pas de prix d'origine auquel se comparer.
decimal? CalculerPlusValue(decimal? nombreActions, decimal? prixAction, decimal? prixInitialReporteActions)
{
    if (nombreActions is null or 0 || prixAction is null || prixInitialReporteActions is null)
        return null;
    return Math.Abs(nombreActions.Value) * (prixAction.Value - prixInitialReporteActions.Value);
}

// Variantes en mémoire de ConsommerLots/CreerLot (voir plus bas), sans
// aucune écriture en base : utilisées uniquement pour rejouer l'historique
// lors du calcul de PlusValue à la lecture (voir CalculerPlusValues
// ci-dessous), avec exactement la même logique FIFO (lots triés par ordre
// d'acquisition, les plus anciens consommés en premier).
decimal? ConsommerLotsMemoire(
    Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotMemoire>> lotsParDetenteur,
    Guid cibleId, string? categorie, Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite)
{
    if (quantite <= 0)
        return null;
    if (!lotsParDetenteur.TryGetValue((cibleId, categorie, detenteurId, detenteurNomExterne, compteId), out var lots))
        return null;

    var restant = quantite;
    decimal sommePrixPondere = 0;
    decimal sommeQuantiteConsommee = 0;
    var i = 0;
    while (i < lots.Count && restant > 0)
    {
        var lot = lots[i];
        var consomme = Math.Min(lot.Quantite, restant);
        if (lot.PrixInitial is decimal prix)
        {
            sommePrixPondere += prix * consomme;
            sommeQuantiteConsommee += consomme;
        }
        lot.Quantite -= consomme;
        restant -= consomme;
        if (lot.Quantite <= 0)
            lots.RemoveAt(i);
        else
            i++;
    }

    return sommeQuantiteConsommee > 0 ? sommePrixPondere / sommeQuantiteConsommee : null;
}

void CreerLotMemoire(
    Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotMemoire>> lotsParDetenteur,
    Guid cibleId, string? categorie, Guid? detenteurId, string? detenteurNomExterne, Guid? compteId,
    decimal quantite, decimal? prixInitial)
{
    if (quantite <= 0)
        return;
    var cle = (cibleId, categorie, detenteurId, detenteurNomExterne, compteId);
    if (!lotsParDetenteur.TryGetValue(cle, out var lots))
    {
        lots = [];
        lotsParDetenteur[cle] = lots;
    }
    lots.Add(new LotMemoire { Quantite = quantite, PrixInitial = prixInitial });
}

// PlusValue n'est jamais stockée en base (TransactionLignes n'a pas de
// colonne PlusValue) : recalculée à chaque lecture, pour toutes les lignes
// à la fois, en rejouant leur historique chronologique en mémoire — jamais
// désynchronisée d'une évolution de la règle de calcul, sans script de
// rattrapage à maintenir. Rejoue les lignes avec exactement la même logique
// que SynchroniserTitres/ConsommerLots/CreerLot (y compris la distinction
// par Compte), appliquée à des lots en mémoire plutôt qu'à la table
// dbo.Actions. Résultat indexé par TransactionLignes.Id (une ligne, pas une
// transaction entière : deux lignes de la même transaction, catégories
// différentes, peuvent avoir des plus-values différentes).
async Task<Dictionary<Guid, decimal?>> CalculerPlusValues(SqlConnection conn)
{
    var lignes = await conn.QueryAsync<LigneTransactionPourPlusValue>(
        "SELECT tl.Id AS LigneId, t.AcheteurId, t.AcheteurNomExterne, t.CibleId, tl.NombreActions, tl.Categorie, " +
        "t.VendeurId, t.VendeurNomExterne, tl.CompteAcheteurId, tl.CompteVendeurId, t.PrixAction " +
        "FROM dbo.TransactionLignes tl JOIN dbo.Transactions t ON t.Id = tl.TransactionId " +
        "ORDER BY t.[Date] ASC, t.Id ASC, tl.Id ASC");

    var lotsParDetenteur = new Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotMemoire>>();
    var resultat = new Dictionary<Guid, decimal?>();

    foreach (var l in lignes)
    {
        decimal? plusValue = null;
        var acheteurEgalVendeur = l.VendeurId is not null && l.AcheteurId is not null && l.VendeurId == l.AcheteurId;
        var variation = l.NombreActions;

        if (variation != 0 && !acheteurEgalVendeur)
        {
            var vendeurRenseigne = l.VendeurId is not null || l.VendeurNomExterne is not null;

            if (variation < 0)
            {
                var prixInitialReporte = ConsommerLotsMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.AcheteurId, l.AcheteurNomExterne, l.CompteAcheteurId, -variation);
                if (vendeurRenseigne)
                    CreerLotMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.VendeurId, l.VendeurNomExterne, l.CompteVendeurId, -variation, prixInitialReporte ?? l.PrixAction);
                plusValue = CalculerPlusValue(variation, l.PrixAction, prixInitialReporte);
            }
            else
            {
                decimal? prixInitialReporte = null;
                if (vendeurRenseigne)
                    prixInitialReporte = ConsommerLotsMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.VendeurId, l.VendeurNomExterne, l.CompteVendeurId, variation);
                CreerLotMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.AcheteurId, l.AcheteurNomExterne, l.CompteAcheteurId, variation, prixInitialReporte ?? l.PrixAction);
                plusValue = CalculerPlusValue(variation, l.PrixAction, prixInitialReporte);
            }
        }

        resultat[l.LigneId] = plusValue;
    }

    return resultat;
}

// Chaque transaction ciblant une société est une "leg" signée pour le
// couple (actionnaire, cible) : + côté acheteur, - côté vendeur si lui
// aussi est une société suivie (même règle que calculerParticipations
// côté frontend). Avant d'accepter une création ou modification, on
// recalcule ces totaux directs en y ajoutant la transaction candidate — le
// nombre d'actions d'une transaction est désormais la SOMME de ses lignes
// (plusieurs Catégories possibles, voir dbo.TransactionLignes), jamais une
// colonne directe. En dessous de 0, c'est toujours refusé (vendre plus
// qu'on ne détient), que la société cible ait ou non un total de référence
// connu à cette date. Le dépassement du total émis n'est contrôlé que si un
// total est connu à la date de la transaction (voir dbo.HistoriqueTotauxSociete)
// — sans lui, aucune borne connue.
async Task<string?> ValiderBornesParticipation(SqlConnection conn, TransactionInput input, Guid? idAExclure)
{
    var totaux = await conn.QuerySingleOrDefaultAsync<TotauxSociete>(
        "SELECT TOP 1 Id, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable " +
        "FROM dbo.HistoriqueTotauxSociete WHERE SocieteId = @cibleId AND DateEffet <= @date ORDER BY DateEffet DESC",
        new { cibleId = input.CibleId, date = input.Date });
    // Le total d'actions n'est pas une colonne : c'est la somme des lignes
    // de détail par Type de cette ligne d'historique (voir ChargerHistoriqueTotaux).
    var totalActions = totaux is null
        ? null
        : await conn.ExecuteScalarAsync<decimal?>(
            "SELECT SUM(Quantite) FROM dbo.HistoriqueTotalActionsType WHERE HistoriqueTotalSocieteId = @id", new { id = totaux.Id });

    var lignes = (await conn.QueryAsync<LigneParticipation>(
        "SELECT t.AcheteurId, t.VendeurId, " +
        "(SELECT SUM(tl.NombreActions) FROM dbo.TransactionLignes tl WHERE tl.TransactionId = t.Id) AS NombreActions, " +
        "t.NombreDroitVoteTheorique, t.NombreDroitVoteExercable " +
        "FROM dbo.Transactions t WHERE t.CibleId = @cibleId AND (@idAExclure IS NULL OR t.Id <> @idAExclure)",
        new { cibleId = input.CibleId, idAExclure })).ToList();
    var nombreActionsCandidate = input.Lignes?.Sum(l => l.NombreActions ?? 0) ?? 0;
    lignes.Add(new LigneParticipation(
        input.AcheteurId, input.VendeurId, nombreActionsCandidate, input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable));

    var actionsParId = new Dictionary<Guid, decimal>();
    var dvTheoriqueParId = new Dictionary<Guid, decimal>();
    var dvExercableParId = new Dictionary<Guid, decimal>();

    void Ajouter(Dictionary<Guid, decimal> dict, Guid id, decimal valeur)
    {
        dict[id] = dict.GetValueOrDefault(id) + valeur;
    }

    foreach (var l in lignes)
    {
        if (l.AcheteurId is Guid acheteurId)
        {
            Ajouter(actionsParId, acheteurId, l.NombreActions ?? 0);
            Ajouter(dvTheoriqueParId, acheteurId, l.NombreDroitVoteTheorique ?? 0);
            Ajouter(dvExercableParId, acheteurId, l.NombreDroitVoteExercable ?? 0);
        }
        if (l.VendeurId is Guid vendeurId && l.VendeurId != l.AcheteurId)
        {
            Ajouter(actionsParId, vendeurId, -(l.NombreActions ?? 0));
            Ajouter(dvTheoriqueParId, vendeurId, -(l.NombreDroitVoteTheorique ?? 0));
            Ajouter(dvExercableParId, vendeurId, -(l.NombreDroitVoteExercable ?? 0));
        }
    }

    foreach (var n in actionsParId.Values)
        if (n < 0)
            return $"Cette opération ferait passer le nombre d'actions détenu par une société dans la cible à {n:0.##}, ce qui est négatif.";
    foreach (var n in dvTheoriqueParId.Values)
        if (n < 0)
            return $"Cette opération ferait passer le nombre de droits de vote théorique détenu par une société dans la cible à {n:0.##}, ce qui est négatif.";
    foreach (var n in dvExercableParId.Values)
        if (n < 0)
            return $"Cette opération ferait passer le nombre de droits de vote exerçable détenu par une société dans la cible à {n:0.##}, ce qui est négatif.";

    if (totalActions is decimal ta)
    {
        var somme = actionsParId.Values.Sum();
        if (somme > ta)
            return $"Cette opération ferait dépasser le nombre total d'actions émises par la société cible à cette date ({somme:0.##} pour un total de {ta:0.##}).";
    }
    if (totaux?.NombreTotalDroitVoteTheorique is decimal totalDvTheorique)
    {
        var somme = dvTheoriqueParId.Values.Sum();
        if (somme > totalDvTheorique)
            return $"Cette opération ferait dépasser le nombre total de droits de vote théorique émis par la société cible à cette date ({somme:0.##} pour un total de {totalDvTheorique:0.##}).";
    }
    if (totaux?.NombreTotalDroitVoteExercable is decimal totalDvExercable)
    {
        var somme = dvExercableParId.Values.Sum();
        if (somme > totalDvExercable)
            return $"Cette opération ferait dépasser le nombre total de droits de vote exerçable émis par la société cible à cette date ({somme:0.##} pour un total de {totalDvExercable:0.##}).";
    }

    return null;
}

// Consomme jusqu'à `quantite` actions appartenant à ce détenteur (et, si
// renseigné, ce compte précis), pour cette société émettrice et cette
// catégorie, en épuisant les lots existants du plus ancien au plus récent
// (FIFO par date d'acquisition) : un lot dont la quantité est entièrement
// consommée est supprimé, un lot partiellement consommé voit sa Quantite
// réduite d'autant (jamais supprimé ni recréé, pour ne pas perdre son
// PrixInitial d'origine sur la portion restante).
// Renvoie le prix d'origine moyen, pondéré par quantité, des titres
// consommés (null si aucun titre consommé, ou si leurs PrixInitial sont
// tous NULL), pour pouvoir le reporter sur le lot créé en contrepartie côté
// acheteur. Le nombre de lots touchés est borné par le nombre de lots
// existants pour ce détenteur (donc par le nombre de transactions
// historiques), jamais par la quantité elle-même — contrairement à l'ancien
// suivi unitaire, une quantité très élevée (même des milliards) ne
// nécessite jamais plus d'une poignée de lignes modifiées.
async Task<decimal?> ConsommerLots(
    SqlConnection conn, IDbTransaction tx, Guid societeEmettriceId, string? categorie,
    Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite)
{
    if (quantite <= 0)
        return null;

    var lots = (await conn.QueryAsync<Lot>(
        "SELECT Id, Quantite, PrixInitial FROM dbo.Actions " +
        "WHERE SocieteEmettriceId = @societeEmettriceId " +
        "  AND ((@detenteurId IS NOT NULL AND SocieteDetentriceId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
        "  AND ((@categorie IS NULL AND Categorie IS NULL) OR Categorie = @categorie) " +
        "  AND ((@compteId IS NULL AND CompteId IS NULL) OR CompteId = @compteId) " +
        "ORDER BY DateAcquisition ASC, Id ASC",
        new { societeEmettriceId, detenteurId, detenteurNomExterne, categorie, compteId },
        tx)).ToList();

    var restant = quantite;
    decimal sommePrixPondere = 0;
    decimal sommeQuantiteConsommee = 0;

    foreach (var lot in lots)
    {
        if (restant <= 0)
            break;
        var consomme = Math.Min(lot.Quantite, restant);

        if (lot.PrixInitial is decimal prix)
        {
            sommePrixPondere += prix * consomme;
            sommeQuantiteConsommee += consomme;
        }

        if (consomme >= lot.Quantite)
            await conn.ExecuteAsync("DELETE FROM dbo.Actions WHERE Id = @id", new { id = lot.Id }, tx);
        else
            await conn.ExecuteAsync("UPDATE dbo.Actions SET Quantite = Quantite - @consomme WHERE Id = @id", new { consomme, id = lot.Id }, tx);

        restant -= consomme;
    }

    return sommeQuantiteConsommee > 0 ? sommePrixPondere / sommeQuantiteConsommee : null;
}

// Crée un nouveau lot de `quantite` actions pour ce détenteur (et ce
// compte, si renseigné) — toujours une seule ligne, quelle que soit la
// quantité (contrairement à l'ancien suivi unitaire). Jamais fusionné avec
// un lot existant même identique : chaque lot reste associé à la
// transaction qui l'a créé (TransactionOrigineId), pour pouvoir le retirer
// précisément si cette transaction est modifiée ou supprimée (voir
// RetirerTitresDeTransaction) — fusionner perdrait cette traçabilité.
async Task CreerLot(
    SqlConnection conn, IDbTransaction tx, Guid societeEmettriceId, string? categorie,
    Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite,
    decimal? prixAcquisition, decimal? prixInitial, string date, Guid transactionId)
{
    if (quantite <= 0)
        return;
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, CompteId, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId) " +
        "VALUES (NEWID(), @societeEmettriceId, @categorie, @detenteurId, @detenteurNomExterne, @compteId, @quantite, @prixInitial, @prixAcquisition, @date, @transactionId)",
        new { societeEmettriceId, categorie, detenteurId, detenteurNomExterne, compteId, quantite, prixInitial, prixAcquisition, date, transactionId },
        tx);
}

// Synchronise les lots d'Actions avec la quantité signée d'une ligne de
// transaction (positif = l'acheteur gagne, négatif = l'acheteur perd ;
// symétrique côté vendeur s'il est renseigné — même règle que
// ValiderBornesParticipation/calculerParticipations). Le camp perdant est
// toujours traité en premier, pour pouvoir reporter le prix d'origine de
// ses lots retirés sur le lot créé en contrepartie côté gagnant.
//
// Ne synchronise que les actions : les droits de vote théorique/exerçable
// n'ont pas de table de lots (retirée, voir dbo.DroitsVoteTheorique/
// DroitsVoteExercable) — aucun calcul de l'application n'en dépendait.
//
// Limite connue : modifier ou supprimer une transaction retire les lots
// qu'elle avait créés (via TransactionOrigineId, voir RetirerTitresDeTransaction),
// mais ne restitue pas ceux qu'elle avait consommés chez le camp perdant —
// leur identité précise n'est pas conservée au-delà du prix moyen reporté.
// Un correctif manuel dans l'onglet Titres peut être nécessaire dans ce cas,
// normalement rare (modification peu après la saisie, ou correction d'une
// erreur de saisie).
async Task SynchroniserTitres(
    SqlConnection conn, IDbTransaction tx, Guid cibleId, string? categorie,
    Guid? acheteurId, string? acheteurNomExterne, Guid? compteAcheteurId,
    Guid? vendeurId, string? vendeurNomExterne, Guid? compteVendeurId,
    decimal nombreActions, decimal? prixAction, string date, Guid transactionId)
{
    if (nombreActions == 0)
        return;

    var vendeurRenseigne = vendeurId is not null || vendeurNomExterne is not null;
    if (vendeurRenseigne && vendeurId is not null && vendeurId == acheteurId)
        return; // acheteur == vendeur : rien à faire (cas déjà écarté par ValiderTransaction, par précaution).

    if (nombreActions < 0)
    {
        var prixInitialReporte = await ConsommerLots(conn, tx, cibleId, categorie, acheteurId, acheteurNomExterne, compteAcheteurId, -nombreActions);
        if (vendeurRenseigne)
            await CreerLot(conn, tx, cibleId, categorie, vendeurId, vendeurNomExterne, compteVendeurId, -nombreActions, prixAction, prixInitialReporte ?? prixAction, date, transactionId);
    }
    else
    {
        decimal? prixInitialReporte = null;
        if (vendeurRenseigne)
            prixInitialReporte = await ConsommerLots(conn, tx, cibleId, categorie, vendeurId, vendeurNomExterne, compteVendeurId, nombreActions);
        await CreerLot(conn, tx, cibleId, categorie, acheteurId, acheteurNomExterne, compteAcheteurId, nombreActions, prixAction, prixInitialReporte ?? prixAction, date, transactionId);
    }
}

// Retire les lots d'Actions créés par cette transaction (voir la limite
// documentée sur SynchroniserTitres). Couvre toutes les lignes de la
// transaction à la fois : TransactionOrigineId identifie la transaction,
// pas une ligne précise.
async Task RetirerTitresDeTransaction(SqlConnection conn, IDbTransaction tx, Guid transactionId)
{
    await conn.ExecuteAsync("DELETE FROM dbo.Actions WHERE TransactionOrigineId = @transactionId", new { transactionId }, tx);
}

app.MapPost("/api/transactions", async (TransactionInput input) =>
{
    var (erreur, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());

    var erreurBornes = await ValiderBornesParticipation(conn, input, null);
    if (erreurBornes is not null)
        return Results.BadRequest(erreurBornes);

    var nomCible = await conn.QuerySingleOrDefaultAsync<string>(
        "SELECT Nom FROM dbo.Societes WHERE Id = @cibleId", new { cibleId = input.CibleId }) ?? "(société inconnue)";

    var transactionId = Guid.NewGuid();
    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    try
    {
        var (erreurComptes, lignesResolues) = await ResoudreComptesLignes(conn, sqlTx, input, acheteurNomExterne, vendeurNomExterne, nomCible);
        if (erreurComptes is not null)
        {
            await sqlTx.RollbackAsync();
            return Results.BadRequest(erreurComptes);
        }

        await conn.ExecuteAsync(
            "INSERT INTO dbo.Transactions (Id, AcheteurId, AcheteurNomExterne, CibleId, [Date], " +
            "NombreDroitVoteTheorique, NombreDroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction) " +
            "VALUES (@Id, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date, " +
            "@NombreDroitVoteTheorique, @NombreDroitVoteExercable, @VendeurId, @VendeurNomExterne, @PrixAction)",
            new
            {
                Id = transactionId, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date,
                input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable, input.VendeurId, vendeurNomExterne, input.PrixAction,
            },
            sqlTx);

        foreach (var ligne in lignesResolues!)
        {
            await conn.ExecuteAsync(
                "INSERT INTO dbo.TransactionLignes (Id, TransactionId, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId) " +
                "VALUES (NEWID(), @transactionId, @Categorie, @NombreActions, @CompteAcheteurId, @CompteVendeurId)",
                new { transactionId, ligne.Categorie, ligne.NombreActions, ligne.CompteAcheteurId, ligne.CompteVendeurId },
                sqlTx);

            await SynchroniserTitres(
                conn, sqlTx, input.CibleId, ligne.Categorie, input.AcheteurId, acheteurNomExterne, ligne.CompteAcheteurId,
                input.VendeurId, vendeurNomExterne, ligne.CompteVendeurId, ligne.NombreActions, input.PrixAction, input.Date, transactionId);
        }

        await sqlTx.CommitAsync();
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }

    var transactionCreee = await ChargerTransaction(conn, transactionId);
    return Results.Created($"/api/transactions/{transactionCreee.Id}", transactionCreee);
});

app.MapPut("/api/transactions/{id:guid}", async (Guid id, TransactionInput input) =>
{
    var (erreur, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());

    var erreurBornes = await ValiderBornesParticipation(conn, input, id);
    if (erreurBornes is not null)
        return Results.BadRequest(erreurBornes);

    var nomCible = await conn.QuerySingleOrDefaultAsync<string>(
        "SELECT Nom FROM dbo.Societes WHERE Id = @cibleId", new { cibleId = input.CibleId }) ?? "(société inconnue)";

    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    int lignesAffectees;
    try
    {
        var (erreurComptes, lignesResolues) = await ResoudreComptesLignes(conn, sqlTx, input, acheteurNomExterne, vendeurNomExterne, nomCible);
        if (erreurComptes is not null)
        {
            await sqlTx.RollbackAsync();
            return Results.BadRequest(erreurComptes);
        }

        // Ce UPDATE sert aussi à vérifier que la transaction existe
        // (lignesAffectees > 0) avant de toucher aux lignes et aux titres.
        lignesAffectees = await conn.ExecuteAsync(
            "UPDATE dbo.Transactions SET AcheteurId = @AcheteurId, AcheteurNomExterne = @AcheteurNomExterne, " +
            "CibleId = @CibleId, [Date] = @Date, " +
            "NombreDroitVoteTheorique = @NombreDroitVoteTheorique, NombreDroitVoteExercable = @NombreDroitVoteExercable, " +
            "VendeurId = @VendeurId, VendeurNomExterne = @VendeurNomExterne, PrixAction = @PrixAction " +
            "WHERE Id = @id",
            new
            {
                id, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date,
                input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable, input.VendeurId, vendeurNomExterne, input.PrixAction,
            },
            sqlTx);

        if (lignesAffectees > 0)
        {
            await RetirerTitresDeTransaction(conn, sqlTx, id);
            await conn.ExecuteAsync("DELETE FROM dbo.TransactionLignes WHERE TransactionId = @id", new { id }, sqlTx);

            foreach (var ligne in lignesResolues!)
            {
                await conn.ExecuteAsync(
                    "INSERT INTO dbo.TransactionLignes (Id, TransactionId, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId) " +
                    "VALUES (NEWID(), @id, @Categorie, @NombreActions, @CompteAcheteurId, @CompteVendeurId)",
                    new { id, ligne.Categorie, ligne.NombreActions, ligne.CompteAcheteurId, ligne.CompteVendeurId },
                    sqlTx);

                await SynchroniserTitres(
                    conn, sqlTx, input.CibleId, ligne.Categorie, input.AcheteurId, acheteurNomExterne, ligne.CompteAcheteurId,
                    input.VendeurId, vendeurNomExterne, ligne.CompteVendeurId, ligne.NombreActions, input.PrixAction, input.Date, id);
            }
        }

        await sqlTx.CommitAsync();
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }

    if (lignesAffectees == 0)
        return Results.NotFound();

    var transactionModifiee = await ChargerTransaction(conn, id);
    return Results.Ok(transactionModifiee);
});

app.MapDelete("/api/transactions/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    try
    {
        await RetirerTitresDeTransaction(conn, sqlTx, id);
        // TransactionLignes est supprimée en cascade (ON DELETE CASCADE) avec sa transaction.
        await conn.ExecuteAsync("DELETE FROM dbo.Transactions WHERE Id = @id", new { id }, sqlTx);
        await sqlTx.CommitAsync();
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }
    return Results.NoContent();
});

const string ColonnesTitre =
    "Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, CompteId, Quantite, PrixInitial, PrixAcquisition, " +
    "CONVERT(varchar(10), DateAcquisition, 23) AS DateAcquisition, TransactionOrigineId";

app.MapGet("/api/titres/actions", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var titres = await conn.QueryAsync<Titre>($"SELECT {ColonnesTitre} FROM dbo.Actions ORDER BY DateAcquisition DESC");
    return Results.Ok(titres);
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

record Societe(Guid Id, string Nom, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei);

record SocieteInput(
    string? Nom,
    decimal? ValeurNominale = null,
    string? Pays = null,
    string? SiegeSocial = null,
    string? Siren = null,
    string? Lei = null);

record SocieteUpdate(string? Nom, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei);

// Une ligne (= un Type) de la ventilation du nombre d'actions d'une société
// à une date d'effet donnée (voir HistoriqueTotalSociete).
record LigneActionsParType(string? Type, decimal Quantite);

// Projection brute d'une ligne de dbo.HistoriqueTotalActionsType, avec
// l'id de son parent — utilisée uniquement pour regrouper les lignes par
// ligne d'historique dans ChargerHistoriqueTotaux.
record LigneActionsParTypeAvecParent(Guid HistoriqueTotalSocieteId, string? Type, decimal Quantite);

// Le total émis par une société à une date d'effet donnée — voir
// dbo.HistoriqueTotauxSociete. Le nombre total d'actions n'est pas une
// colonne : c'est la somme de ActionsParType (voir dbo.HistoriqueTotalActionsType),
// jamais stockée directement (même principe que PlusValue sur Transactions).
// Seuls les droits de vote théorique/exerçable restent un nombre global.
record HistoriqueTotalSociete(
    Guid Id, Guid SocieteId, string DateEffet,
    decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable,
    IReadOnlyList<LigneActionsParType> ActionsParType);

record HistoriqueTotalSocieteInput(
    Guid SocieteId, string? DateEffet,
    decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable,
    List<LigneActionsParType>? ActionsParType);

// Projection (sans le détail par Type) d'une ligne de dbo.HistoriqueTotauxSociete,
// utilisée pour construire HistoriqueTotalSociete dans ChargerHistoriqueTotaux.
record HistoriqueTotalSocieteSansDetail(
    Guid Id, Guid SocieteId, string DateEffet, decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable);

// Projection du total en vigueur à une date donnée (voir ValiderBornesParticipation) :
// Id sert à retrouver la somme des lignes HistoriqueTotalActionsType correspondantes.
record TotauxSociete(Guid Id, decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable);

// Une catégorie de titre (A, B, C...) — voir dbo.Types. Sert uniquement de
// suggestions sur les champs Categorie (Transactions/Actions), qui restent
// du texte libre.
record TypeTitre(Guid Id, string Nom);

record TypeTitreInput(string? Nom);

// Regroupement nommé des titres détenus par un actionnaire, dédié à une
// seule Société émettrice ET une seule Catégorie — voir dbo.Comptes.
// DetenteurId/DetenteurNomExterne : même convention que pour
// Transactions/Actions (l'un des deux, jamais les deux).
record Compte(Guid Id, Guid? DetenteurId, string? DetenteurNomExterne, Guid? SocieteEmettriceId, string? Type, string Nom);

record CompteInput(Guid? DetenteurId, string? DetenteurNomExterne, Guid? SocieteEmettriceId, string? Type, string? Nom);

// Une transaction entre deux parties concernant une société cible — les
// mouvements d'actions eux-mêmes sont dans Lignes (une transaction peut
// porter sur plusieurs Catégories à la fois, voir dbo.TransactionLignes) ;
// seuls les droits de vote théorique/exerçable restent des nombres globaux,
// non ventilés par Catégorie.
record Transaction(
    Guid Id,
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreDroitVoteTheorique,
    decimal? NombreDroitVoteExercable,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    IReadOnlyList<LigneTransaction> Lignes);

record TransactionInput(
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreDroitVoteTheorique,
    decimal? NombreDroitVoteExercable,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    List<LigneTransactionInput>? Lignes);

// Un mouvement d'actions d'une Catégorie donnée au sein d'une transaction —
// voir dbo.TransactionLignes. PlusValue n'est jamais stockée : recalculée à
// chaque lecture, par ligne (voir CalculerPlusValues).
record LigneTransaction(Guid Id, string? Categorie, decimal NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId, decimal? PlusValue);

record LigneTransactionInput(string? Categorie, decimal? NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId);

// Projection brute d'une ligne de dbo.TransactionLignes, avec l'id de son
// parent — utilisée uniquement pour regrouper les lignes par transaction
// dans ChargerTransactions.
record LigneTransactionAvecParent(Guid Id, Guid TransactionId, string? Categorie, decimal NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId);

// Projection (sans les lignes) d'une transaction, utilisée pour construire
// Transaction dans ChargerTransactions.
record TransactionSansLignes(
    Guid Id, Guid? AcheteurId, string? AcheteurNomExterne, Guid CibleId, string Date,
    decimal? NombreDroitVoteTheorique, decimal? NombreDroitVoteExercable,
    Guid? VendeurId, string? VendeurNomExterne, decimal? PrixAction);

// Projection minimale d'une transaction pour ValiderBornesParticipation :
// seules les colonnes qui contribuent aux totaux par actionnaire (NombreActions
// est la somme des lignes de cette transaction, voir la requête appelante).
record LigneParticipation(
    Guid? AcheteurId, Guid? VendeurId, decimal? NombreActions, decimal? NombreDroitVoteTheorique, decimal? NombreDroitVoteExercable);

// Projection d'un lot existant, pour la consommation FIFO dans ConsommerLots.
record Lot(Guid Id, decimal Quantite, decimal? PrixInitial);

// Lot en mémoire (jamais écrit en base), pour rejouer le FIFO lors du
// calcul de PlusValue à la lecture — voir ConsommerLotsMemoire/CreerLotMemoire/CalculerPlusValues.
class LotMemoire
{
    public decimal Quantite;
    public decimal? PrixInitial;
}

// Projection minimale d'une ligne de transaction pour CalculerPlusValues
// (jointe à sa transaction parente pour les champs partagés).
record LigneTransactionPourPlusValue(
    Guid LigneId, Guid? AcheteurId, string? AcheteurNomExterne, Guid CibleId, decimal NombreActions,
    string? Categorie, Guid? VendeurId, string? VendeurNomExterne,
    Guid? CompteAcheteurId, Guid? CompteVendeurId, decimal? PrixAction);

// Projection d'une ligne (un lot) de dbo.Actions.
record Titre(
    Guid Id,
    Guid SocieteEmettriceId,
    string? Categorie,
    Guid? SocieteDetentriceId,
    string? DetenteurNomExterne,
    Guid? CompteId,
    decimal Quantite,
    decimal? PrixInitial,
    decimal? PrixAcquisition,
    string? DateAcquisition,
    Guid? TransactionOrigineId);

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
