using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

// Règles métier autour de dbo.Comptes : résolution automatique (jamais de
// création manuelle, voir ResoudreCompte) et garantie d'existence d'un
// compte par Catégorie émise par une société (AssurerComptesParType).
static class ComptesService
{
    public const string ColonnesCompte = "Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom, Numero";

    // Doit rester alignée avec dbo.Comptes.Numero (NVARCHAR(8)) et avec
    // LONGUEUR_MAX_NUMERO_COMPTE côté frontend (utils/constantes.ts).
    public const int LongueurMaxNumero = 8;

    // Valide les champs d'un Compte (nom requis, un seul détenteur renseigné) ; renvoie le nom et le
    // détenteur externe normalisés (espaces retirés) en plus de l'erreur éventuelle.
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
    //   crée un nouveau, nommé automatiquement "{détenteur} - {société
    //   émettrice} - {catégorie} - {numéro}" (le détenteur étant toujours une
    //   Société suivie à ce stade — voir plus bas — son nom est relu depuis
    //   dbo.Societes) ; s'il en existe PLUSIEURS, impossible de deviner lequel
    //   utiliser — erreur, l'utilisateur doit choisir explicitement.
    // Ne résout rien (renvoie null, null) si aucun détenteur n'est connu (ex.
    // vendeur non renseigné sur une transaction), ni si le détenteur est hors
    // groupe (detenteurId null, même avec un nom externe renseigné) : un tiers
    // hors groupe n'a jamais de compte ni de lot suivi — voir
    // TitresLotsService, même règle côté lots.
    // numeroPersonnalise : numéro à donner au nouveau compte s'il doit
    // effectivement en être créé un (ignoré dans tous les autres cas — compte
    // existant réutilisé, ou compteIdSaisi fourni) ; vide ou non fourni, le
    // numéro auto-généré habituel (n+1) est utilisé. Au plus LongueurMaxNumero
    // caractères (voir dbo.Comptes.Numero) — le reste du nom n'est lui jamais
    // personnalisable.
    public static async Task<(string? Erreur, Guid? CompteId)> ResoudreCompte(
        SqlConnection conn, IDbTransaction tx, Guid? compteIdSaisi,
        Guid? detenteurId, string? detenteurNomExterne,
        Guid societeId, string nomSociete, string? categorie, string role,
        string? numeroPersonnalise = null)
    {
        if (detenteurId is null)
            return (null, null);

        if (compteIdSaisi is not null)
        {
            var compte = await conn.QuerySingleOrDefaultAsync<Compte>(
                $"SELECT {ColonnesCompte} FROM dbo.Comptes WHERE Id = @compteIdSaisi", new { compteIdSaisi }, tx);
            if (compte is null)
                return ($"Le compte sélectionné pour le {role} est introuvable.", null);
            if (compte.DetenteurId != detenteurId)
                return ($"Le compte sélectionné pour le {role} n'appartient pas à ce détenteur.", null);
            if (compte.SocieteEmettriceId is not null && compte.SocieteEmettriceId != societeId)
                return ($"Le compte sélectionné pour le {role} est dédié à une autre société.", null);
            if (compte.Type is not null && categorie is not null && compte.Type != categorie)
                return ($"Le compte sélectionné pour le {role} est dédié à la Catégorie « {compte.Type} », différente de celle de cette ligne.", null);
            return (null, compte.Id);
        }

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

        var numero = numeroPersonnalise?.Trim();
        if (numero is { Length: > LongueurMaxNumero })
            return ($"Le numéro de compte du {role} ne peut pas dépasser {LongueurMaxNumero} caractères.", null);

        var n = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM dbo.Comptes WHERE " +
            "((@detenteurId IS NOT NULL AND DetenteurId = @detenteurId) OR (@detenteurId IS NULL AND DetenteurNomExterne = @detenteurNomExterne)) " +
            "AND SocieteEmettriceId = @societeId",
            new { detenteurId, detenteurNomExterne, societeId }, tx);
        if (string.IsNullOrWhiteSpace(numero))
            numero = (n + 1).ToString();

        // Le détenteur est forcément une Société suivie à ce stade (un tiers
        // hors groupe est déjà écarté plus haut) : son nom n'est jamais passé
        // en paramètre par les appelants (ils ne connaissent que celui de la
        // société émettrice), on le relit donc ici.
        var nomDetenteur = await conn.QuerySingleOrDefaultAsync<string>(
            "SELECT Nom FROM dbo.Societes WHERE Id = @detenteurId", new { detenteurId }, tx) ?? "(société supprimée)";

        var nouveauCompteId = Guid.NewGuid();
        var nom = $"{nomDetenteur} - {nomSociete} - {categorie ?? "Non catégorisé"} - {numero}";
        await conn.ExecuteAsync(
            "INSERT INTO dbo.Comptes (Id, DetenteurId, DetenteurNomExterne, SocieteEmettriceId, Type, Nom, Numero) " +
            "VALUES (@Id, @detenteurId, @detenteurNomExterne, @societeId, @categorie, @nom, @numero)",
            new { Id = nouveauCompteId, detenteurId, detenteurNomExterne, societeId, categorie, nom, numero }, tx);
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
            var (erreur, _) = await ResoudreCompte(conn, tx, null, societeId, null, societeId, nomSociete, ligne.Type, "la société émettrice", ligne.Numero);
            if (erreur is not null)
                return erreur;
        }
        return null;
    }
}
