using Dapper;
using Microsoft.Data.SqlClient;

// Opérations CRUD sur les catégories de titres suggérées (dbo.Types).
static class TypesEndpoints
{
    const string ColonnesType = "Id, Nom, RentreDansCapital";

    // Enregistre les routes /api/types.
    public static void MapTypesEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

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

            var type = new TypeTitre(Guid.NewGuid(), nom, input.RentreDansCapital);
            await using var conn = new SqlConnection(ConnectionString());
            try
            {
                await conn.ExecuteAsync("INSERT INTO dbo.Types (Id, Nom, RentreDansCapital) VALUES (@Id, @Nom, @RentreDansCapital)", type);
            }
            catch (SqlException e) when (e.Number == 2627)
            {
                return Results.BadRequest($"Le type « {nom} » existe déjà.");
            }
            return Results.Created($"/api/types/{type.Id}", type);
        });

        app.MapPut("/api/types/{id:guid}", async (Guid id, TypeTitreInput input) =>
        {
            var nom = input.Nom?.Trim();
            if (string.IsNullOrEmpty(nom))
                return Results.BadRequest("Le nom est requis.");

            await using var conn = new SqlConnection(ConnectionString());
            try
            {
                var lignes = await conn.ExecuteAsync(
                    "UPDATE dbo.Types SET Nom = @nom, RentreDansCapital = @RentreDansCapital WHERE Id = @id",
                    new { id, nom, input.RentreDansCapital });
                return lignes > 0 ? Results.NoContent() : Results.NotFound();
            }
            catch (SqlException e) when (e.Number == 2627)
            {
                return Results.BadRequest($"Le type « {nom} » existe déjà.");
            }
        });

        app.MapDelete("/api/types/{id:guid}", async (Guid id) =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            await conn.ExecuteAsync("DELETE FROM dbo.Types WHERE Id = @id", new { id });
            return Results.NoContent();
        });
    }
}
