using System.Security.Cryptography;
using Dapper;
using Microsoft.Data.SqlClient;

// Opérations CRUD sur les comptes utilisateurs de l'application
// (dbo.Utilisateurs) — réservées au rôle DSI (voir EstDsi).
static class UtilisateursEndpoints
{
    const string ColonnesUtilisateur = "Id, Email, MotDePasse, Role, CreeLe";

    static readonly string[] RolesValides = { "DSI", "Direction des titres" };

    // Seul le rôle DSI a accès à cet écran et à ces données (mots de passe en
    // clair inclus) — unique restriction de rôle pour l'instant, sur demande
    // explicite ; tout le reste de l'API reste ouvert à n'importe quel rôle.
    static bool EstDsi(HttpContext ctx) => ctx.Items["Role"] as string == "DSI";

    // Génère un mot de passe temporaire de 10 caractères, sans les caractères
    // ambigus à recopier (0/O, 1/l/I). Pas de niveau cryptographique requis vu
    // l'usage (solution provisoire en attendant le SSO), mais RandomNumberGenerator
    // coûte le même prix qu'un Random classique et évite d'y penser deux fois.
    static string GenererMotDePasse()
    {
        const string caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        var octets = RandomNumberGenerator.GetBytes(10);
        var motDePasse = new char[10];
        for (var i = 0; i < 10; i++)
            motDePasse[i] = caracteres[octets[i] % caracteres.Length];
        return new string(motDePasse);
    }

    // Enregistre les routes /api/utilisateurs.
    public static void MapUtilisateursEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

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
            if (string.IsNullOrEmpty(input.Role) || !RolesValides.Contains(input.Role))
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
    }
}
