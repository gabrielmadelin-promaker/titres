using Dapper;
using Microsoft.Data.SqlClient;

// Opérations CRUD sur l'historique des totaux émis par société
// (dbo.HistoriqueTotauxSociete + dbo.HistoriqueTotalActionsType) ; la
// garantie d'existence des Comptes associés à chaque Catégorie (voir
// ComptesService.AssurerComptesParType) fait partie de la même transaction
// SQL que l'écriture des totaux.
static class HistoriqueTotauxEndpoints
{
    public static void MapHistoriqueTotauxEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

        app.MapGet("/api/historique-totaux-societe", async () =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            return Results.Ok(await HistoriqueTotauxService.ChargerHistoriqueTotaux(conn));
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

                var erreurComptes = await ComptesService.AssurerComptesParType(conn, sqlTx, input.SocieteId, lignesActions);
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

                    var erreurComptes = await ComptesService.AssurerComptesParType(conn, sqlTx, input.SocieteId, lignesActions);
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
    }
}
