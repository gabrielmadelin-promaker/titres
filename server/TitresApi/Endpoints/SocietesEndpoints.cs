using Dapper;
using Microsoft.Data.SqlClient;

// Opérations CRUD sur les sociétés suivies (dbo.Societes).
static class SocietesEndpoints
{
    const string ColonnesSociete = "Id, Nom, ValeurNominale, Pays, SiegeSocial, Siren, Lei";

    public static void MapSocietesEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

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
    }
}
