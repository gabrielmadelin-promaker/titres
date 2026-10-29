using Dapper;
using Microsoft.Data.SqlClient;

// Authentification temporaire par jeton de session, en attendant le SSO
// (voir aussi le middleware app.Use(...) dans Program.cs qui vérifie ce
// jeton sur chaque requête protégée).
static class AuthEndpoints
{
    // Enregistre les routes /api/auth/*.
    public static void MapAuthEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

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
    }
}
