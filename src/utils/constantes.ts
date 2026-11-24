// Constantes partagées entre plusieurs écrans — un seul endroit à modifier
// si une contrainte change côté serveur.

// Doit rester alignée avec la largeur des colonnes Categorie/Type côté
// serveur (NVARCHAR(50) : Transactions.TransactionLignes, Comptes, Types,
// HistoriqueTotalActionsType).
export const LONGUEUR_MAX_CATEGORIE = 50;

// Doit rester alignée avec dbo.Comptes.Numero (NVARCHAR(8)) et avec
// ComptesService.LongueurMaxNumero côté serveur.
export const LONGUEUR_MAX_NUMERO_COMPTE = 8;
