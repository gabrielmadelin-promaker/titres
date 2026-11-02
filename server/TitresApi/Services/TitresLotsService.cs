using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

// Suivi FIFO unitaire des lots de titres (dbo.Actions), alimenté
// automatiquement à chaque transaction — jamais saisi à la main.
//
// Entièrement recalculé à chaque écriture (voir RecalculerTousLesLots),
// plutôt que mis à jour de façon incrémentale : une transaction supprimée ou
// modifiée doit pouvoir restituer exactement les lots qu'elle avait
// consommés chez le camp perdant, pas seulement retirer ceux qu'elle avait
// créés côté gagnant. Un patch incrémental ne peut pas le faire sans perdre
// l'identité précise des lots touchés (plusieurs lots partiellement
// consommés, dates d'acquisition distinctes…) ; un recalcul complet, rejoué
// dans l'ordre chronologique exact des transactions, est toujours exact et
// suit le même principe que PlusValueService.CalculerPlusValues (jamais
// stocké de façon incrémentale, toujours rejoué). Au volume actuel de
// l'application (quelques dizaines à centaines de transactions), le coût
// d'un recalcul complet à chaque écriture est négligeable.
static class TitresLotsService
{
    // Consomme jusqu'à `quantite` actions du lot en tête de liste (FIFO, le
    // plus ancien d'abord — les lots sont ajoutés dans l'ordre chronologique
    // de leur création, donc déjà dans le bon ordre), en épuisant un ou
    // plusieurs lots : un lot entièrement consommé est retiré de la liste, un
    // lot partiellement consommé voit sa Quantite réduite d'autant (son
    // PrixInitial/PrixAcquisition/DateAcquisition d'origine restent
    // inchangés sur la portion non consommée).
    // Renvoie le prix d'origine moyen, pondéré par quantité, des titres
    // consommés (null si aucun titre consommé, ou si leurs PrixInitial sont
    // tous NULL), pour pouvoir le reporter sur le lot créé en contrepartie
    // côté acheteur.
    static decimal? Consommer(
        Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotRecalcul>> lots,
        Guid cibleId, string? categorie, Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite)
    {
        if (quantite <= 0)
            return null;
        if (!lots.TryGetValue((cibleId, categorie, detenteurId, detenteurNomExterne, compteId), out var liste))
            return null;

        var restant = quantite;
        decimal sommePrixPondere = 0;
        decimal sommeQuantiteConsommee = 0;
        var i = 0;
        while (i < liste.Count && restant > 0)
        {
            var lot = liste[i];
            var consomme = Math.Min(lot.Quantite, restant);
            if (lot.PrixInitial is decimal prix)
            {
                sommePrixPondere += prix * consomme;
                sommeQuantiteConsommee += consomme;
            }
            lot.Quantite -= consomme;
            restant -= consomme;
            if (lot.Quantite <= 0)
                liste.RemoveAt(i);
            else
                i++;
        }

        return sommeQuantiteConsommee > 0 ? sommePrixPondere / sommeQuantiteConsommee : null;
    }

    // Ajoute un nouveau lot pour ce détenteur (et ce compte, si renseigné) —
    // toujours une ligne distincte, jamais fusionnée avec un lot existant
    // même identique : chaque lot reste associé à la transaction qui l'a créé
    // (TransactionOrigineId), pour l'onglet Titres et la traçabilité.
    static void Creer(
        Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotRecalcul>> lots,
        Guid cibleId, string? categorie, Guid? detenteurId, string? detenteurNomExterne, Guid? compteId,
        decimal quantite, decimal? prixAcquisition, decimal? prixInitial, string date, Guid transactionId)
    {
        if (quantite <= 0)
            return;
        var cle = (cibleId, categorie, detenteurId, detenteurNomExterne, compteId);
        if (!lots.TryGetValue(cle, out var liste))
        {
            liste = [];
            lots[cle] = liste;
        }
        liste.Add(new LotRecalcul
        {
            Quantite = quantite,
            PrixInitial = prixInitial,
            PrixAcquisition = prixAcquisition,
            DateAcquisition = date,
            TransactionOrigineId = transactionId,
        });
    }

    // Applique l'effet d'une ligne de transaction sur les lots en mémoire —
    // même règle que ValiderBornesParticipation/PlusValueService.CalculerPlusValues
    // (positif = l'acheteur gagne, négatif = l'acheteur perd ; symétrique côté
    // vendeur s'il est renseigné). Le camp perdant est toujours traité en
    // premier, pour pouvoir reporter le prix d'origine de ses lots retirés
    // sur le lot créé en contrepartie côté gagnant.
    static void AppliquerLigne(Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotRecalcul>> lots, LigneTransactionPourRecalculTitres l)
    {
        if (l.NombreActions == 0)
            return;
        var vendeurRenseigne = l.VendeurId is not null || l.VendeurNomExterne is not null;
        if (vendeurRenseigne && l.VendeurId is not null && l.VendeurId == l.AcheteurId)
            return; // acheteur == vendeur : rien à faire (cas déjà écarté par ValiderTransaction, par précaution).

        if (l.NombreActions < 0)
        {
            var prixInitialReporte = Consommer(lots, l.CibleId, l.Categorie, l.AcheteurId, l.AcheteurNomExterne, l.CompteAcheteurId, -l.NombreActions);
            if (vendeurRenseigne)
                Creer(lots, l.CibleId, l.Categorie, l.VendeurId, l.VendeurNomExterne, l.CompteVendeurId, -l.NombreActions, l.PrixAction, prixInitialReporte ?? l.PrixAction, l.Date, l.TransactionId);
        }
        else
        {
            decimal? prixInitialReporte = null;
            if (vendeurRenseigne)
                prixInitialReporte = Consommer(lots, l.CibleId, l.Categorie, l.VendeurId, l.VendeurNomExterne, l.CompteVendeurId, l.NombreActions);
            Creer(lots, l.CibleId, l.Categorie, l.AcheteurId, l.AcheteurNomExterne, l.CompteAcheteurId, l.NombreActions, l.PrixAction, prixInitialReporte ?? l.PrixAction, l.Date, l.TransactionId);
        }
    }

    // Recalcule entièrement dbo.Actions à partir de dbo.TransactionLignes +
    // dbo.Transactions, en rejouant leur historique chronologique — à
    // appeler après tout POST/PUT/DELETE sur /api/transactions, dans la même
    // transaction SQL que l'écriture. Toujours exact, quel que soit le nombre
    // de modifications/suppressions passées (pas d'état incrémental à tenir à
    // jour) : même principe que PlusValueService.CalculerPlusValues, mais
    // écrit le résultat en base plutôt que de ne garder qu'un prix calculé.
    public static async Task RecalculerTousLesLots(SqlConnection conn, IDbTransaction tx)
    {
        var lignes = await conn.QueryAsync<LigneTransactionPourRecalculTitres>(
            "SELECT t.Id AS TransactionId, t.[Date], t.CibleId, t.PrixAction, " +
            "t.AcheteurId, t.AcheteurNomExterne, t.VendeurId, t.VendeurNomExterne, " +
            "tl.Categorie, tl.NombreActions, tl.CompteAcheteurId, tl.CompteVendeurId " +
            "FROM dbo.TransactionLignes tl JOIN dbo.Transactions t ON t.Id = tl.TransactionId " +
            "ORDER BY t.[Date] ASC, t.Id ASC, tl.Id ASC",
            transaction: tx);

        var lots = new Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotRecalcul>>();
        foreach (var l in lignes)
            AppliquerLigne(lots, l);

        await conn.ExecuteAsync("DELETE FROM dbo.Actions", transaction: tx);

        foreach (var ((cibleId, categorie, detenteurId, detenteurNomExterne, compteId), liste) in lots)
            foreach (var lot in liste)
                await conn.ExecuteAsync(
                    "INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, CompteId, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId) " +
                    "VALUES (NEWID(), @cibleId, @categorie, @detenteurId, @detenteurNomExterne, @compteId, @Quantite, @PrixInitial, @PrixAcquisition, @DateAcquisition, @TransactionOrigineId)",
                    new
                    {
                        cibleId, categorie, detenteurId, detenteurNomExterne, compteId,
                        lot.Quantite, lot.PrixInitial, lot.PrixAcquisition, lot.DateAcquisition, lot.TransactionOrigineId,
                    },
                    tx);
    }
}
