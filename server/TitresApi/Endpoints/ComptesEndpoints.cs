using Dapper;
using Microsoft.Data.SqlClient;

// Opérations sur les comptes (dbo.Comptes) — pas de POST : un Compte n'est
// jamais créé manuellement, uniquement résolu automatiquement (voir
// ComptesService.ResoudreCompte) depuis une transaction ou une ligne de
// totaux par Catégorie.
static class ComptesEndpoints
{
    // Enregistre les routes /api/comptes (consultation, renommage, suppression).
    public static void MapComptesEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres(RequeteCourante.Environnement);

        app.MapGet("/api/comptes", async () =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            var comptes = await conn.QueryAsync<Compte>($"SELECT {ComptesService.ColonnesCompte} FROM dbo.Comptes ORDER BY Nom");
            return Results.Ok(comptes);
        });

        app.MapPut("/api/comptes/{id:guid}", async (Guid id, CompteInput input) =>
        {
            var (erreur, nom, detenteurNomExterne) = ComptesService.ValiderCompteInput(input);
            if (erreur is not null)
                return Results.BadRequest(erreur);

            await using var conn = new SqlConnection(ConnectionString());
            var lignes = await conn.ExecuteAsync(
                "UPDATE dbo.Comptes SET DetenteurId = @DetenteurId, DetenteurNomExterne = @DetenteurNomExterne, " +
                "SocieteEmettriceId = @SocieteEmettriceId, Type = @Type, Nom = @Nom, Numero = @Numero WHERE Id = @id",
                new { id, input.DetenteurId, detenteurNomExterne, input.SocieteEmettriceId, input.Type, Nom = nom, input.Numero });
            return lignes > 0 ? Results.NoContent() : Results.NotFound();
        });

        app.MapDelete("/api/comptes/{id:guid}", async (Guid id) =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            // Un Compte encore référencé (ligne de transaction, lot de titres) ne
            // peut pas être supprimé silencieusement : la référence resterait
            // orpheline (affichée "(supprimé)" côté client) sans que personne ne
            // comprenne pourquoi le compte a disparu des transactions passées.
            var nombreReferences = await conn.ExecuteScalarAsync<int>(
                "SELECT " +
                "(SELECT COUNT(*) FROM dbo.TransactionLignes WHERE CompteAcheteurId = @id OR CompteVendeurId = @id) + " +
                "(SELECT COUNT(*) FROM dbo.Actions WHERE CompteId = @id)",
                new { id });
            if (nombreReferences > 0)
                return Results.BadRequest(
                    $"Impossible de supprimer ce compte : encore utilisé par {nombreReferences} ligne(s) de transaction ou lot(s) de titres.");

            await conn.ExecuteAsync("DELETE FROM dbo.Comptes WHERE Id = @id", new { id });
            return Results.NoContent();
        });
    }
}
