using Dapper;
using Microsoft.Data.SqlClient;

// Opérations CRUD sur les transactions (dbo.Transactions + dbo.TransactionLignes) —
// chaque écriture synchronise aussi les comptes (ComptesService) et les lots
// de titres (TitresLotsService) dans la même transaction SQL.
static class TransactionsEndpoints
{
    public static void MapTransactionsEndpoints(this WebApplication app)
    {
        string ConnectionString() => app.Configuration.ChaineConnexionTitres();

        app.MapGet("/api/transactions", async () =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            return Results.Ok(await TransactionsService.ChargerTransactions(conn));
        });

        app.MapPost("/api/transactions", async (TransactionInput input) =>
        {
            var (erreur, acheteurNomExterne, vendeurNomExterne) = TransactionsService.ValiderTransaction(input);
            if (erreur is not null)
                return Results.BadRequest(erreur);

            await using var conn = new SqlConnection(ConnectionString());

            var erreurBornes = await TransactionsService.ValiderBornesParticipation(conn, input, null);
            if (erreurBornes is not null)
                return Results.BadRequest(erreurBornes);

            var nomCible = await conn.QuerySingleOrDefaultAsync<string>(
                "SELECT Nom FROM dbo.Societes WHERE Id = @cibleId", new { cibleId = input.CibleId }) ?? "(société inconnue)";

            var transactionId = Guid.NewGuid();
            await conn.OpenAsync();
            await using var sqlTx = await conn.BeginTransactionAsync();
            try
            {
                var (erreurComptes, lignesResolues) = await TransactionsService.ResoudreComptesLignes(conn, sqlTx, input, acheteurNomExterne, vendeurNomExterne, nomCible);
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

                    await TitresLotsService.SynchroniserTitres(
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

            var transactionCreee = await TransactionsService.ChargerTransaction(conn, transactionId);
            return Results.Created($"/api/transactions/{transactionCreee.Id}", transactionCreee);
        });

        app.MapPut("/api/transactions/{id:guid}", async (Guid id, TransactionInput input) =>
        {
            var (erreur, acheteurNomExterne, vendeurNomExterne) = TransactionsService.ValiderTransaction(input);
            if (erreur is not null)
                return Results.BadRequest(erreur);

            await using var conn = new SqlConnection(ConnectionString());

            var erreurBornes = await TransactionsService.ValiderBornesParticipation(conn, input, id);
            if (erreurBornes is not null)
                return Results.BadRequest(erreurBornes);

            var nomCible = await conn.QuerySingleOrDefaultAsync<string>(
                "SELECT Nom FROM dbo.Societes WHERE Id = @cibleId", new { cibleId = input.CibleId }) ?? "(société inconnue)";

            await conn.OpenAsync();
            await using var sqlTx = await conn.BeginTransactionAsync();
            int lignesAffectees;
            try
            {
                var (erreurComptes, lignesResolues) = await TransactionsService.ResoudreComptesLignes(conn, sqlTx, input, acheteurNomExterne, vendeurNomExterne, nomCible);
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
                    await TitresLotsService.RetirerTitresDeTransaction(conn, sqlTx, id);
                    await conn.ExecuteAsync("DELETE FROM dbo.TransactionLignes WHERE TransactionId = @id", new { id }, sqlTx);

                    foreach (var ligne in lignesResolues!)
                    {
                        await conn.ExecuteAsync(
                            "INSERT INTO dbo.TransactionLignes (Id, TransactionId, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId) " +
                            "VALUES (NEWID(), @id, @Categorie, @NombreActions, @CompteAcheteurId, @CompteVendeurId)",
                            new { id, ligne.Categorie, ligne.NombreActions, ligne.CompteAcheteurId, ligne.CompteVendeurId },
                            sqlTx);

                        await TitresLotsService.SynchroniserTitres(
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

            var transactionModifiee = await TransactionsService.ChargerTransaction(conn, id);
            return Results.Ok(transactionModifiee);
        });

        app.MapDelete("/api/transactions/{id:guid}", async (Guid id) =>
        {
            await using var conn = new SqlConnection(ConnectionString());
            await conn.OpenAsync();
            await using var sqlTx = await conn.BeginTransactionAsync();
            try
            {
                await TitresLotsService.RetirerTitresDeTransaction(conn, sqlTx, id);
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
    }
}
