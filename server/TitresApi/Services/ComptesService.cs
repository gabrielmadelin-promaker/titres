using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

// Règles métier autour de dbo.Comptes : résolution automatique (jamais de
// création manuelle, voir ResoudreCompte) et garantie d'existence d'un
// compte par Catégorie émise par une société (AssurerComptesParType).
static class ComptesService
{
    public const string ColonnesCompte = "Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom";

    public static (string? Erreur, string? Nom, string? DetenteurNomExterne) ValiderCompteInput(CompteInput input)
    {
        var nom = input.Nom?.Trim();
        if (string.IsNullOrEmpty(nom))
            return ("Le nom du compte est requis.", null, null);
        var detenteurNomExterne = string.IsNullOrWhiteSpace(input.DetenteurNomExterne) ? null : input.DetenteurNomExterne.Trim();
        if ((input.DetenteurId is null) == (detenteurNomExterne is null))
            return ("Renseignez le détenteur du compte (dans la liste, ou son nom si hors groupe).", null, null);
        return (null, nom, detenteurNomExterne);
    }

    // Résout le Compte d'un camp (acheteur ou vendeur) d'une ligne de
    // transaction, ou d'une ligne de ventilation des totaux d'une société :
    // - Si `compteIdSaisi` est renseigné, le valide (même détenteur, même
    //   société émettrice si le compte en a une, même Catégorie si le compte en
    //   a une) et le renvoie tel quel.
    // - Sinon, cherche un Compte déjà existant pour (détenteur, société,
    //   Catégorie) et le réutilise s'il est unique ; s'il n'en existe aucun, en
    //   crée un nouveau (nommé automatiquement "{société} - {catégorie} - {n}") ;
    //   s'il en existe PLUSIEURS, impossible de deviner lequel utiliser — erreur,
    //   l'utilisateur doit choisir explicitement.
    // Ne résout rien (renvoie null, null) si aucun détenteur n'est connu (ex.
    // vendeur non renseigné sur une transaction).
    public static async Task<(string? Erreur, Guid? CompteId)> ResoudreCompte(
        SqlConnection conn, IDbTransaction tx, Guid? compteIdSaisi,
        Guid? detenteurId, string? detenteurNomExterne,
        Guid societeId, string nomSociete, string? categorie, string role)
    {
        if (compteIdSaisi is not null)
        {
            var compte = await conn.QuerySingleOrDefaultAsync<Compte>(
                $"SELECT {ColonnesCompte} FROM dbo.Comptes WHERE Id = @compteIdSaisi", new { compteIdSaisi }, tx);
            if (compte is null)
                return ($"Le compte sélectionné pour le {role} est introuvable.", null);
            var memeDetenteur = detenteurId is not null ? compte.DetenteurId == detenteurId : compte.DetenteurNomExterne == detenteurNomExterne;
            if (!memeDetenteur)
                return ($"Le compte sélectionné pour le {role} n'appartient pas à ce détenteur.", null);
            if (compte.SocieteEmettriceId is not null && compte.SocieteEmettriceId != societeId)
                return ($"Le compte sélectionné pour le {role} est dédié à une autre société.", null);
            if (compte.Type is not null && categorie is not null && compte.Type != categorie)
                return ($"Le compte sélectionné pour le {role} est dédié à la Catégorie « {compte.Type} », différente de celle de cette ligne.", null);
            return (null, compte.Id);
        }

        if (detenteurId is null && detenteurNomExterne is null)
            return (null, null);

        var existants = (await conn.QueryAsync<Compte>(
            $"SELECT {ColonnesCompte} FROM dbo.Comptes WHERE " +
            "((@detenteurId IS NOT NULL AND DetenteurId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
            "AND SocieteEmettriceId = @societeId " +
            "AND ((@categorie IS NULL AND Type IS NULL) OR Type = @categorie)",
            new { detenteurId, detenteurNomExterne, societeId, categorie }, tx)).ToList();

        if (existants.Count == 1)
            return (null, existants[0].Id);
        if (existants.Count > 1)
            return ($"Plusieurs comptes existent déjà pour le {role} sur cette société et cette Catégorie : choisissez-en un explicitement.", null);

        var n = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.Comptes WHERE " +
            "((@detenteurId IS NOT NULL AND DetenteurId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
            "AND SocieteEmettriceId = @societeId",
            new { detenteurId, detenteurNomExterne, societeId }, tx);
        var nouveauCompteId = Guid.NewGuid();
        var nom = $"{nomSociete} - {categorie ?? "Non catégorisé"} - {n + 1}";
        await conn.ExecuteAsync(
            "INSERT INTO dbo.Comptes (Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom) " +
            "VALUES (@Id, @detenteurId, @detenteurNomExterne, @societeId, @categorie, @nom)",
            new { Id = nouveauCompteId, detenteurId, detenteurNomExterne, societeId, categorie, nom }, tx);
        return (null, nouveauCompteId);
    }

    // S'assure qu'un Compte existe pour chaque ligne de ventilation par
    // Catégorie du nombre d'actions d'une société (voir dbo.HistoriqueTotalActionsType) :
    // la société est traitée comme sa propre détentrice par défaut (pool des
    // actions émises mais pas encore distribuées à un actionnaire précis), afin
    // qu'un Compte existe déjà à choisir comme vendeur lors de la première
    // transaction qui distribue réellement ces actions.
    public static async Task<string?> AssurerComptesParType(SqlConnection conn, IDbTransaction tx, Guid societeId, List<LigneActionsParType> lignes)
    {
        if (lignes.Count == 0)
            return null;
        var nomSociete = await conn.QuerySingleOrDefaultAsync<string>(
            "SELECT Nom FROM dbo.Societes WHERE Id = @societeId", new { societeId }, tx);
        if (nomSociete is null)
            return null;

        foreach (var ligne in lignes)
        {
            var (erreur, _) = await ResoudreCompte(conn, tx, null, societeId, null, societeId, nomSociete, ligne.Type, "la société émettrice");
            if (erreur is not null)
                return erreur;
        }
        return null;
    }
}
