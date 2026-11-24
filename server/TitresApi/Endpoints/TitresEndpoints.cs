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

    // Enregistre la route /api/titres/actions.
    public static void MapTitresEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

        // date (optionnel, "yyyy-MM-dd") : au lieu de l'état actuel de
        // dbo.Actions, reconstitue l'état des lots tel qu'il aurait été à
        // cette date (voir TitresLotsService.ObtenirLotsADate) — un calcul "à
        // blanc", jamais écrit en base, pour la consultation historique
        // (écran Actionnariat, "Détail par Compte" à une date de référence).
        app.MapGet("/api/titres/actions", async (string? date) =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            if (string.IsNullOrWhiteSpace(date))
            {
                var titres = await conn.QueryAsync<Titre>($"SELECT {ColonnesTitre} FROM dbo.Actions ORDER BY DateAcquisition DESC");
                return Results.Ok(titres);
            }

            var titresADate = await TitresLotsService.ObtenirLotsADate(conn, date);
            return Results.Ok(titresADate.OrderByDescending(t => t.DateAcquisition));
        });
    }
}
