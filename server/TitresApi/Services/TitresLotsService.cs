using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

// Suivi FIFO unitaire des lots de titres (dbo.Actions), alimenté
// automatiquement à chaque transaction — jamais saisi à la main.
static class TitresLotsService
{
    // Consomme jusqu'à `quantite` actions appartenant à ce détenteur (et, si
    // renseigné, ce compte précis), pour cette société émettrice et cette
    // catégorie, en épuisant les lots existants du plus ancien au plus récent
    // (FIFO par date d'acquisition) : un lot dont la quantité est entièrement
    // consommée est supprimé, un lot partiellement consommé voit sa Quantite
    // réduite d'autant (jamais supprimé ni recréé, pour ne pas perdre son
    // PrixInitial d'origine sur la portion restante).
    // Renvoie le prix d'origine moyen, pondéré par quantité, des titres
    // consommés (null si aucun titre consommé, ou si leurs PrixInitial sont
    // tous NULL), pour pouvoir le reporter sur le lot créé en contrepartie côté
    // acheteur. Le nombre de lots touchés est borné par le nombre de lots
    // existants pour ce détenteur (donc par le nombre de transactions
    // historiques), jamais par la quantité elle-même — contrairement à l'ancien
    // suivi unitaire, une quantité très élevée (même des milliards) ne
    // nécessite jamais plus d'une poignée de lignes modifiées.
    public static async Task<decimal?> ConsommerLots(
        SqlConnection conn, IDbTransaction tx, Guid societeEmettriceId, string? categorie,
        Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite)
    {
        if (quantite <= 0)
            return null;

        var lots = (await conn.QueryAsync<Lot>(
            "SELECT Id, Quantite, PrixInitial FROM dbo.Actions " +
            "WHERE SocieteEmettriceId = @societeEmettriceId " +
            "  AND ((@detenteurId IS NOT NULL AND SocieteDetentriceId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
            "  AND ((@categorie IS NULL AND Categorie IS NULL) OR Categorie = @categorie) " +
            "  AND ((@compteId IS NULL AND CompteId IS NULL) OR CompteId = @compteId) " +
            "ORDER BY DateAcquisition ASC, Id ASC",
            new { societeEmettriceId, detenteurId, detenteurNomExterne, categorie, compteId },
            tx)).ToList();

        var restant = quantite;
        decimal sommePrixPondere = 0;
        decimal sommeQuantiteConsommee = 0;

        foreach (var lot in lots)
        {
            if (restant <= 0)
                break;
            var consomme = Math.Min(lot.Quantite, restant);

            if (lot.PrixInitial is decimal prix)
            {
                sommePrixPondere += prix * consomme;
                sommeQuantiteConsommee += consomme;
            }

            if (consomme >= lot.Quantite)
                await conn.ExecuteAsync("DELETE FROM dbo.Actions WHERE Id = @id", new { id = lot.Id }, tx);
            else
                await conn.ExecuteAsync("UPDATE dbo.Actions SET Quantite = Quantite - @consomme WHERE Id = @id", new { consomme, id = lot.Id }, tx);

            restant -= consomme;
        }

        return sommeQuantiteConsommee > 0 ? sommePrixPondere / sommeQuantiteConsommee : null;
    }

    // Crée un nouveau lot de `quantite` actions pour ce détenteur (et ce
    // compte, si renseigné) — toujours une seule ligne, quelle que soit la
    // quantité (contrairement à l'ancien suivi unitaire). Jamais fusionné avec
    // un lot existant même identique : chaque lot reste associé à la
    // transaction qui l'a créé (TransactionOrigineId), pour pouvoir le retirer
    // précisément si cette transaction est modifiée ou supprimée (voir
    // RetirerTitresDeTransaction) — fusionner perdrait cette traçabilité.
    public static async Task CreerLot(
        SqlConnection conn, IDbTransaction tx, Guid societeEmettriceId, string? categorie,
        Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite,
        decimal? prixAcquisition, decimal? prixInitial, string date, Guid transactionId)
    {
        if (quantite <= 0)
            return;
        await conn.ExecuteAsync(
            "INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, CompteId, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId) " +
            "VALUES (NEWID(), @societeEmettriceId, @categorie, @detenteurId, @detenteurNomExterne, @compteId, @quantite, @prixInitial, @prixAcquisition, @date, @transactionId)",
            new { societeEmettriceId, categorie, detenteurId, detenteurNomExterne, compteId, quantite, prixInitial, prixAcquisition, date, transactionId },
            tx);
    }

    // Synchronise les lots d'Actions avec la quantité signée d'une ligne de
    // transaction (positif = l'acheteur gagne, négatif = l'acheteur perd ;
    // symétrique côté vendeur s'il est renseigné — même règle que
    // TransactionsService.ValiderBornesParticipation/calculerParticipations).
    // Le camp perdant est toujours traité en premier, pour pouvoir reporter le
    // prix d'origine de ses lots retirés sur le lot créé en contrepartie côté
    // gagnant.
    //
    // Ne synchronise que les actions : les droits de vote théorique/exerçable
    // n'ont pas de table de lots (retirée, voir dbo.DroitsVoteTheorique/
    // DroitsVoteExercable) — aucun calcul de l'application n'en dépendait.
    //
    // Limite connue : modifier ou supprimer une transaction retire les lots
    // qu'elle avait créés (via TransactionOrigineId, voir RetirerTitresDeTransaction),
    // mais ne restitue pas ceux qu'elle avait consommés chez le camp perdant —
    // leur identité précise n'est pas conservée au-delà du prix moyen reporté.
    // Un correctif manuel dans l'onglet Titres peut être nécessaire dans ce cas,
    // normalement rare (modification peu après la saisie, ou correction d'une
    // erreur de saisie).
    public static async Task SynchroniserTitres(
        SqlConnection conn, IDbTransaction tx, Guid cibleId, string? categorie,
        Guid? acheteurId, string? acheteurNomExterne, Guid? compteAcheteurId,
        Guid? vendeurId, string? vendeurNomExterne, Guid? compteVendeurId,
        decimal nombreActions, decimal? prixAction, string date, Guid transactionId)
    {
        if (nombreActions == 0)
            return;

        var vendeurRenseigne = vendeurId is not null || vendeurNomExterne is not null;
        if (vendeurRenseigne && vendeurId is not null && vendeurId == acheteurId)
            return; // acheteur == vendeur : rien à faire (cas déjà écarté par ValiderTransaction, par précaution).

        if (nombreActions < 0)
        {
            var prixInitialReporte = await ConsommerLots(conn, tx, cibleId, categorie, acheteurId, acheteurNomExterne, compteAcheteurId, -nombreActions);
            if (vendeurRenseigne)
                await CreerLot(conn, tx, cibleId, categorie, vendeurId, vendeurNomExterne, compteVendeurId, -nombreActions, prixAction, prixInitialReporte ?? prixAction, date, transactionId);
        }
        else
        {
            decimal? prixInitialReporte = null;
            if (vendeurRenseigne)
                prixInitialReporte = await ConsommerLots(conn, tx, cibleId, categorie, vendeurId, vendeurNomExterne, compteVendeurId, nombreActions);
            await CreerLot(conn, tx, cibleId, categorie, acheteurId, acheteurNomExterne, compteAcheteurId, nombreActions, prixAction, prixInitialReporte ?? prixAction, date, transactionId);
        }
    }

    // Retire les lots d'Actions créés par cette transaction (voir la limite
    // documentée sur SynchroniserTitres). Couvre toutes les lignes de la
    // transaction à la fois : TransactionOrigineId identifie la transaction,
    // pas une ligne précise.
    public static async Task RetirerTitresDeTransaction(SqlConnection conn, IDbTransaction tx, Guid transactionId)
    {
        await conn.ExecuteAsync("DELETE FROM dbo.Actions WHERE TransactionOrigineId = @transactionId", new { transactionId }, tx);
    }
}
