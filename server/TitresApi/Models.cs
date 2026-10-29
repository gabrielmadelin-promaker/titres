// Formes de données (enregistrements reçus/renvoyés par l'API, projections
// internes utilisées pour construire les requêtes Dapper) — aucune logique
// ici, voir Services/ pour les règles métier et Endpoints/ pour les
// opérations HTTP qui les exposent.

record Societe(Guid Id, string Nom, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei);

record SocieteInput(
    string? Nom,
    decimal? ValeurNominale = null,
    string? Pays = null,
    string? SiegeSocial = null,
    string? Siren = null,
    string? Lei = null);

record SocieteUpdate(string? Nom, decimal? ValeurNominale, string? Pays, string? SiegeSocial, string? Siren, string? Lei);

// Une ligne (= un Type) de la ventilation du nombre d'actions d'une société
// à une date d'effet donnée (voir HistoriqueTotalSociete).
record LigneActionsParType(string? Type, decimal Quantite);

// Projection brute d'une ligne de dbo.HistoriqueTotalActionsType, avec
// l'id de son parent — utilisée uniquement pour regrouper les lignes par
// ligne d'historique dans HistoriqueTotauxService.ChargerHistoriqueTotaux.
record LigneActionsParTypeAvecParent(Guid HistoriqueTotalSocieteId, string? Type, decimal Quantite);

// Le total émis par une société à une date d'effet donnée — voir
// dbo.HistoriqueTotauxSociete. Le nombre total d'actions n'est pas une
// colonne : c'est la somme de ActionsParType (voir dbo.HistoriqueTotalActionsType),
// jamais stockée directement (même principe que PlusValue sur Transactions).
// Seuls les droits de vote théorique/exerçable restent un nombre global.
record HistoriqueTotalSociete(
    Guid Id, Guid SocieteId, string DateEffet,
    decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable,
    IReadOnlyList<LigneActionsParType> ActionsParType);

record HistoriqueTotalSocieteInput(
    Guid SocieteId, string? DateEffet,
    decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable,
    List<LigneActionsParType>? ActionsParType);

// Projection (sans le détail par Type) d'une ligne de dbo.HistoriqueTotauxSociete,
// utilisée pour construire HistoriqueTotalSociete dans HistoriqueTotauxService.ChargerHistoriqueTotaux.
record HistoriqueTotalSocieteSansDetail(
    Guid Id, Guid SocieteId, string DateEffet, decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable);

// Projection du total en vigueur à une date donnée (voir TransactionsService.ValiderBornesParticipation) :
// Id sert à retrouver la somme des lignes HistoriqueTotalActionsType correspondantes.
record TotauxSociete(Guid Id, decimal? NombreTotalDroitVoteTheorique, decimal? NombreTotalDroitVoteExercable);

// Une catégorie de titre (A, B, C...) — voir dbo.Types. Sert uniquement de
// suggestions sur les champs Categorie (Transactions/Actions), qui restent
// du texte libre.
record TypeTitre(Guid Id, string Nom);

record TypeTitreInput(string? Nom);

// Regroupement nommé des titres détenus par un actionnaire, dédié à une
// seule Société émettrice ET une seule Catégorie — voir dbo.Comptes.
// DetenteurId/DetenteurNomExterne : même convention que pour
// Transactions/Actions (l'un des deux, jamais les deux).
record Compte(Guid Id, Guid? DetenteurId, string? DetenteurNomExterne, Guid? SocieteEmettriceId, string? Type, string Nom);

record CompteInput(Guid? DetenteurId, string? DetenteurNomExterne, Guid? SocieteEmettriceId, string? Type, string? Nom);

// Une transaction entre deux parties concernant une société cible — les
// mouvements d'actions eux-mêmes sont dans Lignes (une transaction peut
// porter sur plusieurs Catégories à la fois, voir dbo.TransactionLignes) ;
// seuls les droits de vote théorique/exerçable restent des nombres globaux,
// non ventilés par Catégorie.
record Transaction(
    Guid Id,
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreDroitVoteTheorique,
    decimal? NombreDroitVoteExercable,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    IReadOnlyList<LigneTransaction> Lignes);

record TransactionInput(
    Guid? AcheteurId,
    string? AcheteurNomExterne,
    Guid CibleId,
    string Date,
    decimal? NombreDroitVoteTheorique,
    decimal? NombreDroitVoteExercable,
    Guid? VendeurId,
    string? VendeurNomExterne,
    decimal? PrixAction,
    List<LigneTransactionInput>? Lignes);

// Un mouvement d'actions d'une Catégorie donnée au sein d'une transaction —
// voir dbo.TransactionLignes. PlusValue n'est jamais stockée : recalculée à
// chaque lecture, par ligne (voir PlusValueService.CalculerPlusValues).
record LigneTransaction(Guid Id, string? Categorie, decimal NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId, decimal? PlusValue);

record LigneTransactionInput(string? Categorie, decimal? NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId);

// Projection brute d'une ligne de dbo.TransactionLignes, avec l'id de son
// parent — utilisée uniquement pour regrouper les lignes par transaction
// dans TransactionsService.ChargerTransactions.
record LigneTransactionAvecParent(Guid Id, Guid TransactionId, string? Categorie, decimal NombreActions, Guid? CompteAcheteurId, Guid? CompteVendeurId);

// Projection (sans les lignes) d'une transaction, utilisée pour construire
// Transaction dans TransactionsService.ChargerTransactions.
record TransactionSansLignes(
    Guid Id, Guid? AcheteurId, string? AcheteurNomExterne, Guid CibleId, string Date,
    decimal? NombreDroitVoteTheorique, decimal? NombreDroitVoteExercable,
    Guid? VendeurId, string? VendeurNomExterne, decimal? PrixAction);

// Projection minimale d'une transaction pour TransactionsService.ValiderBornesParticipation :
// seules les colonnes qui contribuent aux totaux par actionnaire (NombreActions
// est la somme des lignes de cette transaction, voir la requête appelante).
record LigneParticipation(
    Guid? AcheteurId, Guid? VendeurId, decimal? NombreActions, decimal? NombreDroitVoteTheorique, decimal? NombreDroitVoteExercable);

// Projection d'un lot existant, pour la consommation FIFO dans TitresLotsService.ConsommerLots.
record Lot(Guid Id, decimal Quantite, decimal? PrixInitial);

// Lot en mémoire (jamais écrit en base), pour rejouer le FIFO lors du
// calcul de PlusValue à la lecture — voir PlusValueService.
class LotMemoire
{
    public decimal Quantite;
    public decimal? PrixInitial;
}

// Projection minimale d'une ligne de transaction pour PlusValueService.CalculerPlusValues
// (jointe à sa transaction parente pour les champs partagés).
record LigneTransactionPourPlusValue(
    Guid LigneId, Guid? AcheteurId, string? AcheteurNomExterne, Guid CibleId, decimal NombreActions,
    string? Categorie, Guid? VendeurId, string? VendeurNomExterne,
    Guid? CompteAcheteurId, Guid? CompteVendeurId, decimal? PrixAction);

// Projection d'une ligne (un lot) de dbo.Actions.
record Titre(
    Guid Id,
    Guid SocieteEmettriceId,
    string? Categorie,
    Guid? SocieteDetentriceId,
    string? DetenteurNomExterne,
    Guid? CompteId,
    decimal Quantite,
    decimal? PrixInitial,
    decimal? PrixAcquisition,
    string? DateAcquisition,
    Guid? TransactionOrigineId);

record SessionInfo(string Email, string Role);

record LoginInput(string? Email, string? MotDePasse);

// Utilisé uniquement pour la vérification du mot de passe au login : jamais
// renvoyé tel quel au client (le login ne renvoie que email/role/token).
record UtilisateurAuth(Guid Id, string Email, string MotDePasse, string Role);

// MotDePasse est ici volontairement inclus dans ce qui est renvoyé au
// client (liste et création) : c'est le seul moyen, en attendant le SSO,
// qu'un administrateur puisse le relire pour le communiquer.
record Utilisateur(Guid Id, string Email, string MotDePasse, string Role, DateTime CreeLe);

record UtilisateurInput(string? Email, string? Role);
