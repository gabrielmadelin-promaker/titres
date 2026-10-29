using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

// Chargement, validation et résolution des comptes des transactions
// (dbo.Transactions + dbo.TransactionLignes) — les opérations HTTP
// elles-mêmes sont dans Endpoints/TransactionsEndpoints.cs.
static class TransactionsService
{
    public const string ColonnesTransaction =
        "Id, AcheteurId, AcheteurNomExterne, CibleId, CONVERT(varchar(10), [Date], 23) AS Date, " +
        "NombreDroitVoteTheorique, NombreDroitVoteExercable, VendeurId, VendeurNomExterne, PrixAction";

    public const string ColonnesLigneTransaction = "Id, TransactionId, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId";

    // Une transaction peut porter sur plusieurs Catégories à la fois (voir
    // dbo.TransactionLignes) : les deux tables sont donc toujours lues/écrites
    // ensemble, comme un seul objet du point de vue de l'API — même principe
    // que HistoriqueTotauxService.ChargerHistoriqueTotaux pour les totaux par
    // Catégorie d'une société.
    public static async Task<List<Transaction>> ChargerTransactions(SqlConnection conn)
    {
        var parents = (await conn.QueryAsync<TransactionSansLignes>(
            $"SELECT {ColonnesTransaction} FROM dbo.Transactions ORDER BY [Date] DESC")).ToList();
        var lignes = await conn.QueryAsync<LigneTransactionAvecParent>(
            $"SELECT {ColonnesLigneTransaction} FROM dbo.TransactionLignes");
        // PlusValue n'est jamais lue depuis une colonne (voir PlusValueService.CalculerPlusValues) :
        // toujours recalculée à la volée, par ligne, pour rester exacte même si
        // la règle de calcul évolue sans qu'aucune ligne n'ait été rééditée depuis.
        var plusValues = await PlusValueService.CalculerPlusValues(conn);
        var lignesParParent = lignes
            .GroupBy(l => l.TransactionId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<LigneTransaction>)g
                    .Select(l => new LigneTransaction(l.Id, l.Categorie, l.NombreActions, l.CompteAcheteurId, l.CompteVendeurId, plusValues.GetValueOrDefault(l.Id)))
                    .ToList());

        return parents
            .Select(p => new Transaction(
                p.Id, p.AcheteurId, p.AcheteurNomExterne, p.CibleId, p.Date,
                p.NombreDroitVoteTheorique, p.NombreDroitVoteExercable, p.VendeurId, p.VendeurNomExterne, p.PrixAction,
                lignesParParent.GetValueOrDefault(p.Id, Array.Empty<LigneTransaction>())))
            .ToList();
    }

    // Recharge une seule transaction (avec ses lignes et leur PlusValue) après une écriture — recalcule tout
    // via ChargerTransactions plutôt qu'une requête ciblée, pour garantir la même logique de calcul.
    public static async Task<Transaction> ChargerTransaction(SqlConnection conn, Guid id)
    {
        var toutes = await ChargerTransactions(conn);
        return toutes.First(t => t.Id == id);
    }

    // Valide les champs d'une transaction (acheteur/vendeur, au moins une ligne, prix non négatif, date requise) ;
    // renvoie l'acheteur et le vendeur externes normalisés en plus de l'erreur éventuelle.
    public static (string? Erreur, string? AcheteurNomExterne, string? VendeurNomExterne) ValiderTransaction(TransactionInput input)
    {
        var acheteurNomExterne = string.IsNullOrWhiteSpace(input.AcheteurNomExterne) ? null : input.AcheteurNomExterne.Trim();
        var vendeurNomExterne = string.IsNullOrWhiteSpace(input.VendeurNomExterne) ? null : input.VendeurNomExterne.Trim();

        // Acheteur : soit une société suivie (AcheteurId), soit un nom libre
        // (AcheteurNomExterne) pour un tiers hors groupe — jamais les deux, ni aucun des deux.
        if ((input.AcheteurId is null) == (acheteurNomExterne is null))
            return ("Renseignez la société acheteuse (dans la liste, ou son nom si elle est hors groupe).", null, null);
        // Vendeur : facultatif, mais pas les deux à la fois si renseigné.
        if (input.VendeurId is not null && vendeurNomExterne is not null)
            return ("La société vendeuse ne peut pas être à la fois suivie et hors groupe.", null, null);
        if (input.AcheteurId is not null && input.AcheteurId == input.CibleId)
            return ("La société acheteuse doit être différente de la société cible.", null, null);
        if (input.Lignes is null || input.Lignes.Count == 0)
            return ("Au moins une ligne (Catégorie, nombre d'actions) est requise.", null, null);
        foreach (var ligne in input.Lignes)
            if (ligne.NombreActions is null or 0)
                return ("Le nombre d'actions de chaque ligne est requis, et ne peut pas être nul (négatif pour une vente).", null, null);
        if (input.PrixAction is < 0)
            return ("Le prix de l'action ne peut pas être négatif.", null, null);
        if (string.IsNullOrWhiteSpace(input.Date))
            return ("La date est requise.", null, null);

        return (null, acheteurNomExterne, vendeurNomExterne);
    }

    // Résout (valide le compte saisi, ou en trouve/crée un automatiquement —
    // voir ComptesService.ResoudreCompte) le Compte acheteur et vendeur de
    // chaque ligne d'une transaction. S'arrête à la première erreur
    // rencontrée.
    public static async Task<(string? Erreur, List<(string? Categorie, decimal NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId)>? Lignes)> ResoudreComptesLignes(
        SqlConnection conn, IDbTransaction tx, TransactionInput input, string? acheteurNomExterne, string? vendeurNomExterne, string nomCible)
    {
        var resultat = new List<(string?, decimal, Guid?, Guid?)>();
        foreach (var ligne in input.Lignes!)
        {
            var (erreurA, compteAcheteurId) = await ComptesService.ResoudreCompte(
                conn, tx, ligne.CompteAcheteurId, input.AcheteurId, acheteurNomExterne, input.CibleId, nomCible, ligne.Categorie, "acheteur");
            if (erreurA is not null)
                return (erreurA, null);

            var (erreurV, compteVendeurId) = await ComptesService.ResoudreCompte(
                conn, tx, ligne.CompteVendeurId, input.VendeurId, vendeurNomExterne, input.CibleId, nomCible, ligne.Categorie, "vendeur");
            if (erreurV is not null)
                return (erreurV, null);

            resultat.Add((ligne.Categorie, ligne.NombreActions!.Value, compteAcheteurId, compteVendeurId));
        }
        return (null, resultat);
    }

    // Chaque transaction ciblant une société est une "leg" signée pour le
    // couple (actionnaire, cible) : + côté acheteur, - côté vendeur si lui
    // aussi est une société suivie (même règle que calculerParticipations
    // côté frontend). Avant d'accepter une création ou modification, on
    // recalcule ces totaux directs en y ajoutant la transaction candidate — le
    // nombre d'actions d'une transaction est désormais la SOMME de ses lignes
    // (plusieurs Catégories possibles, voir dbo.TransactionLignes), jamais une
    // colonne directe. En dessous de 0, c'est toujours refusé (vendre plus
    // qu'on ne détient), que la société cible ait ou non un total de référence
    // connu à cette date. Le dépassement du total émis n'est contrôlé que si un
    // total est connu à la date de la transaction (voir dbo.HistoriqueTotauxSociete)
    // — sans lui, aucune borne connue.
    public static async Task<string?> ValiderBornesParticipation(SqlConnection conn, TransactionInput input, Guid? idAExclure)
    {
        var totaux = await conn.QuerySingleOrDefaultAsync<TotauxSociete>(
            "SELECT TOP 1 Id, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable " +
            "FROM dbo.HistoriqueTotauxSociete WHERE SocieteId = @cibleId AND DateEffet <= @date ORDER BY DateEffet DESC",
            new { cibleId = input.CibleId, date = input.Date });
        // Le total d'actions n'est pas une colonne : c'est la somme des lignes
        // de détail par Type de cette ligne d'historique (voir HistoriqueTotauxService.ChargerHistoriqueTotaux).
        var totalActions = totaux is null
            ? null
            : await conn.ExecuteScalarAsync<decimal?>(
                "SELECT SUM(Quantite) FROM dbo.HistoriqueTotalActionsType WHERE HistoriqueTotalSocieteId = @id", new { id = totaux.Id });

        var lignes = (await conn.QueryAsync<LigneParticipation>(
            "SELECT t.AcheteurId, t.VendeurId, " +
            "(SELECT SUM(tl.NombreActions) FROM dbo.TransactionLignes tl WHERE tl.TransactionId = t.Id) AS NombreActions, " +
            "t.NombreDroitVoteTheorique, t.NombreDroitVoteExercable " +
            "FROM dbo.Transactions t WHERE t.CibleId = @cibleId AND (@idAExclure IS NULL OR t.Id <> @idAExclure)",
            new { cibleId = input.CibleId, idAExclure })).ToList();
        var nombreActionsCandidate = input.Lignes?.Sum(l => l.NombreActions ?? 0) ?? 0;
        lignes.Add(new LigneParticipation(
            input.AcheteurId, input.VendeurId, nombreActionsCandidate, input.NombreDroitVoteTheorique, input.NombreDroitVoteExercable));

        var actionsParId = new Dictionary<Guid, decimal>();
        var dvTheoriqueParId = new Dictionary<Guid, decimal>();
        var dvExercableParId = new Dictionary<Guid, decimal>();

        void Ajouter(Dictionary<Guid, decimal> dict, Guid id, decimal valeur)
        {
            dict[id] = dict.GetValueOrDefault(id) + valeur;
        }

        foreach (var l in lignes)
        {
            if (l.AcheteurId is Guid acheteurId)
            {
                Ajouter(actionsParId, acheteurId, l.NombreActions ?? 0);
                Ajouter(dvTheoriqueParId, acheteurId, l.NombreDroitVoteTheorique ?? 0);
                Ajouter(dvExercableParId, acheteurId, l.NombreDroitVoteExercable ?? 0);
            }
            if (l.VendeurId is Guid vendeurId && l.VendeurId != l.AcheteurId)
            {
                Ajouter(actionsParId, vendeurId, -(l.NombreActions ?? 0));
                Ajouter(dvTheoriqueParId, vendeurId, -(l.NombreDroitVoteTheorique ?? 0));
                Ajouter(dvExercableParId, vendeurId, -(l.NombreDroitVoteExercable ?? 0));
            }
        }

        foreach (var n in actionsParId.Values)
            if (n < 0)
                return $"Cette opération ferait passer le nombre d'actions détenu par une société dans la cible à {n:0.##}, ce qui est négatif.";
        foreach (var n in dvTheoriqueParId.Values)
            if (n < 0)
                return $"Cette opération ferait passer le nombre de droits de vote théorique détenu par une société dans la cible à {n:0.##}, ce qui est négatif.";
        foreach (var n in dvExercableParId.Values)
            if (n < 0)
                return $"Cette opération ferait passer le nombre de droits de vote exerçable détenu par une société dans la cible à {n:0.##}, ce qui est négatif.";

        if (totalActions is decimal ta)
        {
            var somme = actionsParId.Values.Sum();
            if (somme > ta)
                return $"Cette opération ferait dépasser le nombre total d'actions émises par la société cible à cette date ({somme:0.##} pour un total de {ta:0.##}).";
        }
        if (totaux?.NombreTotalDroitVoteTheorique is decimal totalDvTheorique)
        {
            var somme = dvTheoriqueParId.Values.Sum();
            if (somme > totalDvTheorique)
                return $"Cette opération ferait dépasser le nombre total de droits de vote théorique émis par la société cible à cette date ({somme:0.##} pour un total de {totalDvTheorique:0.##}).";
        }
        if (totaux?.NombreTotalDroitVoteExercable is decimal totalDvExercable)
        {
            var somme = dvExercableParId.Values.Sum();
            if (somme > totalDvExercable)
                return $"Cette opération ferait dépasser le nombre total de droits de vote exerçable émis par la société cible à cette date ({somme:0.##} pour un total de {totalDvExercable:0.##}).";
        }

        return null;
    }
}
