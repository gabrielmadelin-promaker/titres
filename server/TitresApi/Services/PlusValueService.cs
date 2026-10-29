using Dapper;
using Microsoft.Data.SqlClient;

// Calcul de la plus-value réalisée par chaque ligne de transaction, jamais
// stockée en base (voir CalculerPlusValues) : rejouée en mémoire selon le
// même FIFO que TitresLotsService, mais sans toucher dbo.Actions.
static class PlusValueService
{
    // PlusValue n'est jamais saisie, ni stockée en base : recalculée à chaque
    // lecture (voir CalculerPlusValues). Basée sur le FIFO réel des lots
    // d'Actions consommés par cette ligne de transaction (voir TitresLotsService.ConsommerLots) :
    // prix de cette transaction moins le prix d'origine moyen, pondéré par
    // quantité, des titres effectivement vendus — mathématiquement équivalent à
    // la somme tranche par tranche (prix de vente − prix de chaque lot
    // consommé) × sa quantité, puisque la vente se fait à un prix unique pour
    // toute la transaction. Nulle si cette ligne n'a fait perdre aucun titre à
    // personne (ex. achat externe pur, sans consommation d'un lot existant) :
    // il n'y a alors pas de prix d'origine auquel se comparer.
    public static decimal? CalculerPlusValue(decimal? nombreActions, decimal? prixAction, decimal? prixInitialReporteActions)
    {
        if (nombreActions is null or 0 || prixAction is null || prixInitialReporteActions is null)
            return null;
        return Math.Abs(nombreActions.Value) * (prixAction.Value - prixInitialReporteActions.Value);
    }

    // Variantes en mémoire de TitresLotsService.ConsommerLots/CreerLot, sans
    // aucune écriture en base : utilisées uniquement pour rejouer l'historique
    // lors du calcul de PlusValue à la lecture (voir CalculerPlusValues
    // ci-dessous), avec exactement la même logique FIFO (lots triés par ordre
    // d'acquisition, les plus anciens consommés en premier).
    static decimal? ConsommerLotsMemoire(
        Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotMemoire>> lotsParDetenteur,
        Guid cibleId, string? categorie, Guid? detenteurId, string? detenteurNomExterne, Guid? compteId, decimal quantite)
    {
        if (quantite <= 0)
            return null;
        if (!lotsParDetenteur.TryGetValue((cibleId, categorie, detenteurId, detenteurNomExterne, compteId), out var lots))
            return null;

        var restant = quantite;
        decimal sommePrixPondere = 0;
        decimal sommeQuantiteConsommee = 0;
        var i = 0;
        while (i < lots.Count && restant > 0)
        {
            var lot = lots[i];
            var consomme = Math.Min(lot.Quantite, restant);
            if (lot.PrixInitial is decimal prix)
            {
                sommePrixPondere += prix * consomme;
                sommeQuantiteConsommee += consomme;
            }
            lot.Quantite -= consomme;
            restant -= consomme;
            if (lot.Quantite <= 0)
                lots.RemoveAt(i);
            else
                i++;
        }

        return sommeQuantiteConsommee > 0 ? sommePrixPondere / sommeQuantiteConsommee : null;
    }

    // Ajoute un lot en mémoire pour ce détenteur (voir ConsommerLotsMemoire ci-dessus pour le FIFO qui le consomme).
    static void CreerLotMemoire(
        Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotMemoire>> lotsParDetenteur,
        Guid cibleId, string? categorie, Guid? detenteurId, string? detenteurNomExterne, Guid? compteId,
        decimal quantite, decimal? prixInitial)
    {
        if (quantite <= 0)
            return;
        var cle = (cibleId, categorie, detenteurId, detenteurNomExterne, compteId);
        if (!lotsParDetenteur.TryGetValue(cle, out var lots))
        {
            lots = [];
            lotsParDetenteur[cle] = lots;
        }
        lots.Add(new LotMemoire { Quantite = quantite, PrixInitial = prixInitial });
    }

    // PlusValue n'est jamais stockée en base (TransactionLignes n'a pas de
    // colonne PlusValue) : recalculée à chaque lecture, pour toutes les lignes
    // à la fois, en rejouant leur historique chronologique en mémoire — jamais
    // désynchronisée d'une évolution de la règle de calcul, sans script de
    // rattrapage à maintenir. Rejoue les lignes avec exactement la même logique
    // que TitresLotsService.SynchroniserTitres/ConsommerLots/CreerLot (y
    // compris la distinction par Compte), appliquée à des lots en mémoire
    // plutôt qu'à la table dbo.Actions. Résultat indexé par
    // TransactionLignes.Id (une ligne, pas une transaction entière : deux
    // lignes de la même transaction, catégories différentes, peuvent avoir des
    // plus-values différentes).
    public static async Task<Dictionary<Guid, decimal?>> CalculerPlusValues(SqlConnection conn)
    {
        var lignes = await conn.QueryAsync<LigneTransactionPourPlusValue>(
            "SELECT tl.Id AS LigneId, t.AcheteurId, t.AcheteurNomExterne, t.CibleId, tl.NombreActions, tl.Categorie, " +
            "t.VendeurId, t.VendeurNomExterne, tl.CompteAcheteurId, tl.CompteVendeurId, t.PrixAction " +
            "FROM dbo.TransactionLignes tl JOIN dbo.Transactions t ON t.Id = tl.TransactionId " +
            "ORDER BY t.[Date] ASC, t.Id ASC, tl.Id ASC");

        var lotsParDetenteur = new Dictionary<(Guid, string?, Guid?, string?, Guid?), List<LotMemoire>>();
        var resultat = new Dictionary<Guid, decimal?>();

        foreach (var l in lignes)
        {
            decimal? plusValue = null;
            var acheteurEgalVendeur = l.VendeurId is not null && l.AcheteurId is not null && l.VendeurId == l.AcheteurId;
            var variation = l.NombreActions;

            if (variation != 0 && !acheteurEgalVendeur)
            {
                var vendeurRenseigne = l.VendeurId is not null || l.VendeurNomExterne is not null;

                if (variation < 0)
                {
                    var prixInitialReporte = ConsommerLotsMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.AcheteurId, l.AcheteurNomExterne, l.CompteAcheteurId, -variation);
                    if (vendeurRenseigne)
                        CreerLotMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.VendeurId, l.VendeurNomExterne, l.CompteVendeurId, -variation, prixInitialReporte ?? l.PrixAction);
                    plusValue = CalculerPlusValue(variation, l.PrixAction, prixInitialReporte);
                }
                else
                {
                    decimal? prixInitialReporte = null;
                    if (vendeurRenseigne)
                        prixInitialReporte = ConsommerLotsMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.VendeurId, l.VendeurNomExterne, l.CompteVendeurId, variation);
                    CreerLotMemoire(lotsParDetenteur, l.CibleId, l.Categorie, l.AcheteurId, l.AcheteurNomExterne, l.CompteAcheteurId, variation, prixInitialReporte ?? l.PrixAction);
                    plusValue = CalculerPlusValue(variation, l.PrixAction, prixInitialReporte);
                }
            }

            resultat[l.LigneId] = plusValue;
        }

        return resultat;
    }
}
