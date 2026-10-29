using Dapper;
using Microsoft.Data.SqlClient;

// Lecture seule : dbo.Actions est alimentée automatiquement à chaque
// transaction (voir TitresLotsService), jamais saisie à la main — pas de
// POST/PUT/DELETE.
static class TitresEndpoints
{
    const string ColonnesTitre =
        "Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, CompteId, Quantite, PrixInitial, PrixAcquisition, " +
        "CONVERT(varchar(10), DateAcquisition, 23) AS DateAcquisition, TransactionOrigineId";

    public static void MapTitresEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

        app.MapGet("/api/titres/actions", async () =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            var titres = await conn.QueryAsync<Titre>($"SELECT {ColonnesTitre} FROM dbo.Actions ORDER BY DateAcquisition DESC");
            return Results.Ok(titres);
        });
    }
}
