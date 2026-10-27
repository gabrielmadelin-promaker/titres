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

const string ColonnesSociete =
    "Id, Nom, ValeurNominale, Pays, SiegeSocial, Siren, Lei, " +
    "NombreTotalActions, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable";

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
        Guid.NewGuid(), nom, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei,
        input.NombreTotalActions, input.NombreTotalDroitVoteTheorique, input.NombreTotalDroitVoteExercable);
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync(
        "INSERT INTO dbo.Societes (Id, Nom, ValeurNominale, Pays, SiegeSocial, Siren, Lei, " +
        "NombreTotalActions, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable) " +
        "VALUES (@Id, @Nom, @ValeurNominale, @Pays, @SiegeSocial, @Siren, @Lei, " +
        "@NombreTotalActions, @NombreTotalDroitVoteTheorique, @NombreTotalDroitVoteExercable)",
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
        "Pays = @Pays, SiegeSocial = @SiegeSocial, Siren = @Siren, Lei = @Lei, " +
        "NombreTotalActions = @NombreTotalActions, NombreTotalDroitVoteTheorique = @NombreTotalDroitVoteTheorique, " +
        "NombreTotalDroitVoteExercable = @NombreTotalDroitVoteExercable WHERE Id = @id",
        new
        {
            id, Nom = nom, input.ValeurNominale, input.Pays, input.SiegeSocial, input.Siren, input.Lei,
            input.NombreTotalActions, input.NombreTotalDroitVoteTheorique, input.NombreTotalDroitVoteExercable,
        });
    return lignes > 0 ? Results.NoContent() : Results.NotFound();
});

app.MapDelete("/api/societes/{id:guid}", async (Guid id) =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.ExecuteAsync("DELETE FROM dbo.Societes WHERE Id = @id", new { id });
    return Results.NoContent();
});

const string ColonnesTransaction =
    "Id, AcheteurId, AcheteurNomExterne, CibleId, CONVERT(varchar(10), [Date], 23) AS Date, NombreActions, " +
    "NombreDroitVoteTheorique, NombreDroitVoteExercable, Categorie, Capital, " +
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
    if (input.NombreActions is null or 0)
        return ("Le nombre d'actions est requis, et ne peut pas être nul (négatif pour une vente).", "", null, null);
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
// valeur en base) ; sinon la plus-value vaut 0. La quantité est prise en
// valeur absolue : que la ligne soit un achat (NombreActions positif) ou
// une vente (négatif), un prix aujourd'hui plus élevé que le prix de
// référence doit toujours donner une plus-value positive.
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

    return Math.Abs(nombreActions.Value) * (prixActionActuel - prixAncien);
}

// Chaque transaction ciblant une société est une "leg" signée pour le
// couple (actionnaire, cible) : + côté acheteur, - côté vendeur si lui
// aussi est une société suivie (même règle que calculerParticipations
// côté frontend). Avant d'accepter une création ou modification, on
// recalcule ces totaux directs en y ajoutant la transaction candidate.
// En dessous de 0, c'est toujours refusé (vendre plus qu'on ne détient),
// que la société cible ait ou non un total de référence renseigné. Le
// dépassement du total émis (NombreTotalX sur la société cible) n'est
// contrôlé que si ce total est renseigné — sans lui, aucune borne connue.
async Task<string?> ValiderBornesParticipation(SqlConnection conn, TransactionInput input, Guid? idAExclure)
{
    var cible = await conn.QuerySingleOrDefaultAsync<Societe>(
        $"SELECT {ColonnesSociete} FROM dbo.Societes WHERE Id = @cibleId", new { cibleId = input.CibleId });

    var lignes = (await conn.QueryAsync<LigneParticipation>(
        "SELECT AcheteurId, VendeurId, NombreActions, NombreDroitVoteTheorique, NombreDroitVoteExercable " +
        "FROM dbo.Transactions WHERE CibleId = @cibleId AND (@idAExclure IS NULL OR Id <> @idAExclure)",
        new { cibleId = input.CibleId, idAExclure })).ToList();
    lignes.Add(new LigneParticipation(
        input.AcheteurId, input.VendeurId, input.NombreActions, input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable));

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

    if (cible is null)
        return null;

    if (cible.NombreTotalActions is decimal totalActions)
    {
        var somme = actionsParId.Values.Sum();
        if (somme > totalActions)
            return $"Cette opération ferait dépasser le nombre total d'actions émises par la société cible ({somme:0.##} pour un total de {totalActions:0.##}).";
    }
    if (cible.NombreTotalDroitVoteTheorique is decimal totalDvTheorique)
    {
        var somme = dvTheoriqueParId.Values.Sum();
        if (somme > totalDvTheorique)
            return $"Cette opération ferait dépasser le nombre total de droits de vote théorique émis par la société cible ({somme:0.##} pour un total de {totalDvTheorique:0.##}).";
    }
    if (cible.NombreTotalDroitVoteExercable is decimal totalDvExercable)
    {
        var somme = dvExercableParId.Values.Sum();
        if (somme > totalDvExercable)
            return $"Cette opération ferait dépasser le nombre total de droits de vote exerçable émis par la société cible ({somme:0.##} pour un total de {totalDvExercable:0.##}).";
    }

    return null;
}

// Noms des trois tables de titres, alimentées automatiquement à partir des
// transactions (jamais saisies à la main) : une par notion.
string[] TablesTitres = ["Actions", "DroitsVoteTheorique", "DroitsVoteExercable"];

// Retire jusqu'à `quantite` lignes existantes appartenant à ce détenteur
// (les plus anciennes par date d'acquisition d'abord), pour cette société
// émettrice et cette catégorie ; renvoie le prix d'origine moyen des lignes
// retirées (null si aucune, ou si leurs PrixInitial sont tous NULL), pour
// pouvoir le reporter sur les lignes créées en contrepartie côté acheteur.
// Toujours un INSERT/DELETE ensembliste (jamais une boucle ligne à ligne)
// pour rester praticable même avec des centaines de milliers de titres.
async Task<decimal?> SupprimerTitres(
    SqlConnection conn, IDbTransaction tx, string table, Guid societeEmettriceId, string? categorie,
    Guid? detenteurId, string? detenteurNomExterne, decimal quantite)
{
    if (quantite <= 0)
        return null;
    return await conn.ExecuteScalarAsync<decimal?>(
        "DECLARE @Supprimes TABLE (PrixInitial DECIMAL(18,4) NULL); " +
        $"DELETE FROM dbo.{table} " +
        "OUTPUT deleted.PrixInitial INTO @Supprimes " +
        "WHERE Id IN (" +
        $"  SELECT TOP (@quantite) Id FROM dbo.{table} " +
        "  WHERE SocieteEmettriceId = @societeEmettriceId " +
        "    AND ((@detenteurId IS NOT NULL AND SocieteDetentriceId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
        "    AND ((@categorie IS NULL AND Categorie IS NULL) OR Categorie = @categorie) " +
        "  ORDER BY DateAcquisition ASC, Id ASC" +
        "); " +
        "SELECT AVG(PrixInitial) FROM @Supprimes;",
        new { quantite = (int)quantite, societeEmettriceId, detenteurId, detenteurNomExterne, categorie },
        tx);
}

// Crée `quantite` nouvelles lignes identiques pour ce détenteur, en un seul
// INSERT ensembliste (table de nombres générée par produit cartésien de
// sys.all_objects, sans dépendre d'une table de tally dédiée ni d'une limite
// de récursion).
async Task CreerTitres(
    SqlConnection conn, IDbTransaction tx, string table, Guid societeEmettriceId, string? categorie,
    Guid? detenteurId, string? detenteurNomExterne, decimal quantite,
    decimal? prixAcquisition, decimal? prixInitial, string date, Guid transactionId)
{
    if (quantite <= 0)
        return;
    await conn.ExecuteAsync(
        $"INSERT INTO dbo.{table} (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId) " +
        "SELECT NEWID(), @societeEmettriceId, @categorie, @detenteurId, @detenteurNomExterne, @prixInitial, @prixAcquisition, @date, @transactionId " +
        "FROM (SELECT TOP (@quantite) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres",
        new { quantite = (int)quantite, societeEmettriceId, categorie, detenteurId, detenteurNomExterne, prixInitial, prixAcquisition, date, transactionId },
        tx);
}

// Synchronise une seule table de titres avec la quantité signée d'une
// transaction (positif = l'acheteur gagne, négatif = l'acheteur perd ;
// symétrique côté vendeur s'il est renseigné — même règle que
// ValiderBornesParticipation/calculerParticipations). Le camp perdant est
// toujours traité en premier, pour pouvoir reporter le prix d'origine de ses
// lignes retirées sur les nouvelles lignes du camp gagnant.
async Task SynchroniserTitresMetrique(
    SqlConnection conn, IDbTransaction tx, string table, Guid cibleId, string? categorie,
    Guid? acheteurId, string? acheteurNomExterne, decimal? quantiteSignee,
    Guid? vendeurId, string? vendeurNomExterne,
    decimal? prixAction, string date, Guid transactionId)
{
    if (quantiteSignee is not decimal variation || variation == 0)
        return;

    var vendeurRenseigne = vendeurId is not null || vendeurNomExterne is not null;
    if (vendeurRenseigne && vendeurId is not null && vendeurId == acheteurId)
        return; // acheteur == vendeur : rien à faire (cas déjà écarté par ValiderTransaction, par précaution).

    if (variation < 0)
    {
        var prixInitialReporte = await SupprimerTitres(conn, tx, table, cibleId, categorie, acheteurId, acheteurNomExterne, -variation);
        if (vendeurRenseigne)
            await CreerTitres(conn, tx, table, cibleId, categorie, vendeurId, vendeurNomExterne, -variation, prixAction, prixInitialReporte ?? prixAction, date, transactionId);
    }
    else
    {
        decimal? prixInitialReporte = null;
        if (vendeurRenseigne)
            prixInitialReporte = await SupprimerTitres(conn, tx, table, cibleId, categorie, vendeurId, vendeurNomExterne, variation);
        await CreerTitres(conn, tx, table, cibleId, categorie, acheteurId, acheteurNomExterne, variation, prixAction, prixInitialReporte ?? prixAction, date, transactionId);
    }
}

// Point d'entrée : applique une transaction aux trois tables de titres, une
// fois par métrique.
//
// Limite connue : modifier ou supprimer une transaction retire les lignes
// qu'elle avait créées (via TransactionOrigineId, voir RetirerTitresDeTransaction),
// mais ne restitue pas celles qu'elle avait consommées chez le camp perdant
// — leur identité précise n'est pas conservée au-delà du prix moyen reporté.
// Un correctif manuel dans l'onglet Titres peut être nécessaire dans ce cas,
// normalement rare (modification peu après la saisie, ou correction d'une
// erreur de saisie).
async Task SynchroniserTitres(
    SqlConnection conn, IDbTransaction tx, Guid cibleId, string? categorie,
    Guid? acheteurId, string? acheteurNomExterne, Guid? vendeurId, string? vendeurNomExterne,
    decimal? nombreActions, decimal? nombreDroitVoteTheorique, decimal? nombreDroitVoteExercable,
    decimal? prixAction, string date, Guid transactionId)
{
    await SynchroniserTitresMetrique(
        conn, tx, "Actions", cibleId, categorie, acheteurId, acheteurNomExterne, nombreActions,
        vendeurId, vendeurNomExterne, prixAction, date, transactionId);
    await SynchroniserTitresMetrique(
        conn, tx, "DroitsVoteTheorique", cibleId, categorie, acheteurId, acheteurNomExterne, nombreDroitVoteTheorique,
        vendeurId, vendeurNomExterne, prixAction, date, transactionId);
    await SynchroniserTitresMetrique(
        conn, tx, "DroitsVoteExercable", cibleId, categorie, acheteurId, acheteurNomExterne, nombreDroitVoteExercable,
        vendeurId, vendeurNomExterne, prixAction, date, transactionId);
}

// Retire, dans les trois tables, toutes les lignes créées par cette
// transaction (voir la limite documentée sur SynchroniserTitres).
async Task RetirerTitresDeTransaction(SqlConnection conn, IDbTransaction tx, Guid transactionId)
{
    foreach (var table in TablesTitres)
        await conn.ExecuteAsync($"DELETE FROM dbo.{table} WHERE TransactionOrigineId = @transactionId", new { transactionId }, tx);
}

app.MapPost("/api/transactions", async (TransactionInput input) =>
{
    var (erreur, qualification, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());

    var erreurBornes = await ValiderBornesParticipation(conn, input, null);
    if (erreurBornes is not null)
        return Results.BadRequest(erreurBornes);

    var plusValue = await CalculerPlusValue(conn, input.CibleId, input.NombreActions, input.PrixAction, null);

    var transactionId = Guid.NewGuid();
    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    try
    {
        await conn.ExecuteAsync(
            "INSERT INTO dbo.Transactions (Id, AcheteurId, AcheteurNomExterne, CibleId, [Date], NombreActions, " +
            "NombreDroitVoteTheorique, NombreDroitVoteExercable, Categorie, VendeurId, VendeurNomExterne, PrixAction, Qualification, PlusValue) " +
            "VALUES (@Id, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date, @NombreActions, " +
            "@NombreDroitVoteTheorique, @NombreDroitVoteExercable, @Categorie, @VendeurId, @VendeurNomExterne, @PrixAction, @Qualification, @PlusValue)",
            new
            {
                Id = transactionId, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions,
                input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable, input.Categorie, input.VendeurId,
                vendeurNomExterne, input.PrixAction, Qualification = qualification, PlusValue = plusValue,
            },
            sqlTx);

        await SynchroniserTitres(
            conn, sqlTx, input.CibleId, input.Categorie, input.AcheteurId, acheteurNomExterne, input.VendeurId, vendeurNomExterne,
            input.NombreActions, input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable, input.PrixAction, input.Date, transactionId);

        await sqlTx.CommitAsync();
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }

    var transactionCreee = await conn.QuerySingleAsync<Transaction>(
        $"SELECT {ColonnesTransaction} FROM dbo.Transactions WHERE Id = @transactionId", new { transactionId });
    return Results.Created($"/api/transactions/{transactionCreee.Id}", transactionCreee);
});

app.MapPut("/api/transactions/{id:guid}", async (Guid id, TransactionInput input) =>
{
    var (erreur, qualification, acheteurNomExterne, vendeurNomExterne) = ValiderTransaction(input);
    if (erreur is not null)
        return Results.BadRequest(erreur);

    await using var conn = new SqlConnection(ConnectionString());

    var erreurBornes = await ValiderBornesParticipation(conn, input, id);
    if (erreurBornes is not null)
        return Results.BadRequest(erreurBornes);

    var plusValue = await CalculerPlusValue(conn, input.CibleId, input.NombreActions, input.PrixAction, id);

    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    int lignes;
    try
    {
        lignes = await conn.ExecuteAsync(
            "UPDATE dbo.Transactions SET AcheteurId = @AcheteurId, AcheteurNomExterne = @AcheteurNomExterne, " +
            "CibleId = @CibleId, [Date] = @Date, NombreActions = @NombreActions, " +
            "NombreDroitVoteTheorique = @NombreDroitVoteTheorique, NombreDroitVoteExercable = @NombreDroitVoteExercable, " +
            "Categorie = @Categorie, VendeurId = @VendeurId, " +
            "VendeurNomExterne = @VendeurNomExterne, PrixAction = @PrixAction, Qualification = @Qualification, " +
            "PlusValue = @PlusValue WHERE Id = @id",
            new
            {
                id, input.AcheteurId, acheteurNomExterne, input.CibleId, input.Date, input.NombreActions,
                input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable, input.Categorie, input.VendeurId,
                vendeurNomExterne, input.PrixAction, Qualification = qualification, PlusValue = plusValue,
            },
            sqlTx);

        if (lignes > 0)
        {
            await RetirerTitresDeTransaction(conn, sqlTx, id);
            await SynchroniserTitres(
                conn, sqlTx, input.CibleId, input.Categorie, input.AcheteurId, acheteurNomExterne, input.VendeurId, vendeurNomExterne,
                input.NombreActions, input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable, input.PrixAction, input.Date, id);
        }

        await sqlTx.CommitAsync();
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }

    if (lignes == 0)
        return Results.NotFound();

    var transactionModifiee = await conn.QuerySingleAsync<Transaction>(
        $"SELECT {ColonnesTransaction} FROM dbo.Transactions WHERE Id = @id", new { id });
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
    "Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, " +
    "CONVERT(varchar(10), DateAcquisition, 23) AS DateAcquisition, TransactionOrigineId";

app.MapGet("/api/titres/actions", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var titres = await conn.QueryAsync<Titre>($"SELECT {ColonnesTitre} FROM dbo.Actions ORDER BY DateAcquisition DESC");
    return Results.Ok(titres);
});

app.MapGet("/api/titres/droits-vote-theorique", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var titres = await conn.QueryAsync<Titre>($"SELECT {ColonnesTitre} FROM dbo.DroitsVoteTheorique ORDER BY DateAcquisition DESC");
    return Results.Ok(titres);
});

app.MapGet("/api/titres/droits-vote-exercable", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    var titres = await conn.QueryAsync<Titre>($"SELECT {ColonnesTitre} FROM dbo.DroitsVoteExercable ORDER BY DateAcquisition DESC");
    return Results.Ok(titres);
});

// Vide puis régénère entièrement les trois tables de titres à partir de
// l'historique des transactions : rejoue SynchroniserTitres pour chaque
// transaction existante, dans l'ordre chronologique (comme si elles
// venaient d'être saisies une par une dans cet ordre) — exactement la même
// logique qu'une création normale, voir le commentaire sur
// SynchroniserTitres pour ses limites. Opération ponctuelle, déclenchée à
// la main (bouton dans l'onglet Titres) : à utiliser pour initialiser les
// tables après ce déploiement, ou pour les reconstruire depuis zéro en cas
// d'incohérence constatée. Sans effet sur les transactions elles-mêmes.
app.MapPost("/api/titres/initialiser", async () =>
{
    await using var conn = new SqlConnection(ConnectionString());
    await conn.OpenAsync();
    await using var sqlTx = await conn.BeginTransactionAsync();
    try
    {
        foreach (var table in TablesTitres)
            await conn.ExecuteAsync($"DELETE FROM dbo.{table}", transaction: sqlTx);

        var transactions = (await conn.QueryAsync<TransactionPourInitialisation>(
            "SELECT Id, AcheteurId, AcheteurNomExterne, CibleId, CONVERT(varchar(10), [Date], 23) AS Date, " +
            "NombreActions, NombreDroitVoteTheorique, NombreDroitVoteExercable, Categorie, VendeurId, VendeurNomExterne, PrixAction " +
            "FROM dbo.Transactions ORDER BY [Date] ASC, Id ASC",
            transaction: sqlTx)).ToList();

        foreach (var t in transactions)
        {
            await SynchroniserTitres(
                conn, sqlTx, t.CibleId, t.Categorie, t.AcheteurId, t.AcheteurNomExterne, t.VendeurId, t.VendeurNomExterne,
                t.NombreActions, t.NombreDroitVoteTheorique, t.NombreDroitVoteExercable, t.PrixAction, t.Date, t.Id);
        }

        var compte = new Dictionary<string, int>();
        foreach (var table in TablesTitres)
            compte[table] = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) FROM dbo.{table}", transaction: sqlTx);

        await sqlTx.CommitAsync();
        return Results.Ok(new
        {
            transactionsTraitees = transactions.Count,
            actions = compte["Actions"],
            droitsVoteTheorique = compte["DroitsVoteTheorique"],
            droitsVoteExercable = compte["DroitsVoteExercable"],
        });
    }
    catch
    {
        await sqlTx.RollbackAsync();
        throw;
    }
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
    Guid Id, string Nom, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei,
    decimal? NombreTotalActions, decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable);

record SocieteInput(
    string? Nom,
    decimal? ValeurNominale = null,
    string? Pays = null,
    string? SiegeSocial = null,
    string? Siren = null,
    string? Lei = null,
    decimal? NombreTotalActions = null,
    decimal? NombreTotalDroitVoteTheorique = null,
    decimal? NombreTotalDroitVoteExercable = null);

record SocieteUpdate(
    string? Nom,
    decimal? ValeurNominale,
    string? Pays,
    string? SiegeSocial,
    string? Siren,
    string? Lei,
    decimal? NombreTotalActions,
    decimal? NombreTotalDroitVoteTheorique,
    decimal? NombreTotalDroitVoteExercable);

record Transaction(
    Guid Id,
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreActions,
    decimal? NombreDroitVoteTheorique,
    decimal? NombreDroitVoteExercable,
    string? Categorie,
    // Pourcentages de repli, hérités des transactions saisies avant
    // l'introduction des quantités ci-dessus : jamais écrits par l'API pour
    // une transaction créée ou modifiée désormais (toujours NULL dans ce
    // cas), uniquement lus pour l'affichage d'anciennes lignes qui n'ont pas
    // de quantité correspondante.
    decimal? Capital,
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
    decimal? NombreDroitVoteTheorique,
    decimal? NombreDroitVoteExercable,
    string? Categorie,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    string? Qualification);

// Projection minimale d'une transaction pour ValiderBornesParticipation :
// seules les colonnes qui contribuent aux totaux par actionnaire.
record LigneParticipation(
    Guid? AcheteurId, Guid? VendeurId, decimal? NombreActions, decimal? NombreDroitVoteTheorique, decimal? NombreDroitVoteExercable);

// Projection d'une ligne des tables Actions/DroitsVoteTheorique/DroitsVoteExercable.
record Titre(
    Guid Id,
    Guid SocieteEmettriceId,
    string? Categorie,
    Guid? SocieteDetentriceId,
    string? DetenteurNomExterne,
    decimal? PrixInitial,
    decimal? PrixAcquisition,
    string? DateAcquisition,
    Guid? TransactionOrigineId);

// Projection minimale d'une transaction déjà en base, pour rejouer
// SynchroniserTitres sur tout l'historique (voir /api/titres/initialiser).
record TransactionPourInitialisation(
    Guid Id, Guid? AcheteurId, string? AcheteurNomExterne, Guid CibleId, string Date,
    decimal? NombreActions, decimal? NombreDroitVoteTheorique, decimal? NombreDroitVoteExercable,
    string? Categorie, Guid? VendeurId, string? VendeurNomExterne, decimal? PrixAction);

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
