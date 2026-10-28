-- Base et objets pour l'application "Calcul des titres".
-- A exécuter sur le serveur SQL Server (HFRBSEDBS027VM / 10.128.13.13),
-- avec un compte disposant des droits sysadmin / dbcreator, via SQL Server
-- Management Studio ou sqlcmd.
--
-- Remplacez le mot de passe avant d'exécuter, et reportez la même valeur
-- dans ConnectionStrings:CalculDesTitres de appsettings.Production.json
-- côté API (voir server/TitresApi/appsettings.Production.json.example).

CREATE DATABASE CalculDesTitres;
GO

USE CalculDesTitres;
GO

CREATE TABLE dbo.Societes (
    Id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Societes PRIMARY KEY DEFAULT NEWID(),
    Nom           NVARCHAR(200)    NOT NULL,
    ValeurNominale DECIMAL(18,4)   NULL,
    Pays          NVARCHAR(100)    NULL,
    SiegeSocial   NVARCHAR(300)    NULL,
    Siren         NVARCHAR(20)     NULL,
    Lei           NVARCHAR(20)     NULL
);
GO

-- Total émis par une société, dénominateur des pourcentages (Capital, DV
-- théorique, DV exerçable) calculés automatiquement à partir des quantités
-- des transactions — historisé par date d'effet, pour qu'une augmentation
-- ou réduction de capital ultérieure ne change jamais le % calculé pour une
-- transaction passée (qui doit rester rapporté au total en vigueur à SA
-- date, pas au total actuel). Le total applicable à une transaction est
-- celui de la ligne la plus récente dont DateEffet <= date de la
-- transaction ; tant qu'aucune ligne ne couvre cette date (ou que le champ
-- correspondant y est NULL), le pourcentage ne peut pas être calculé.
-- Le nombre total d'actions n'est pas stocké ici : voir
-- dbo.HistoriqueTotalActionsType plus bas, qui le ventile par Type — seuls
-- les droits de vote restent un nombre global par date.
CREATE TABLE dbo.HistoriqueTotauxSociete (
    Id                             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotauxSociete PRIMARY KEY DEFAULT NEWID(),
    SocieteId                      UNIQUEIDENTIFIER NOT NULL,
    DateEffet                      DATE             NOT NULL,
    NombreTotalDroitVoteTheorique  DECIMAL(18,4)    NULL,
    NombreTotalDroitVoteExercable  DECIMAL(18,4)    NULL,
    CONSTRAINT UQ_HistoriqueTotauxSociete_SocieteDate UNIQUE (SocieteId, DateEffet)
);
GO
CREATE INDEX IX_HistoriqueTotauxSociete_SocieteId ON dbo.HistoriqueTotauxSociete (SocieteId);
GO

-- La catégorie d'un titre (A, B, C...), déjà saisie comme texte libre sur
-- Transactions.Categorie / Actions.Categorie : cette table ne sert qu'à
-- nourrir des suggestions sur ces champs, qui restent du texte libre (pas
-- une liste fermée) — ajout possible depuis l'application.
CREATE TABLE dbo.Types (
    Id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Types PRIMARY KEY DEFAULT NEWID(),
    Nom NVARCHAR(50)     NOT NULL,
    CONSTRAINT UQ_Types_Nom UNIQUE (Nom)
);
GO

-- Regroupement nommé des titres détenus par un actionnaire (société suivie
-- ou tiers externe), toujours dédié à une seule Société émettrice ET une
-- seule Catégorie (ex. "actions de catégorie A de la société X" est un
-- compte différent de "catégorie A de la société Y"). Choisi sur chaque
-- ligne de transaction (acheteur et/ou vendeur, voir TransactionLignes plus
-- bas) — ou généré automatiquement si aucun n'est choisi (voir le backend,
-- ValiderComptes/ResoudreComptes) ; les lots générés automatiquement dans
-- Actions portent ensuite ce Compte. Pas de clé étrangère vers Societes
-- (DetenteurId/SocieteEmettriceId) : une société supprimée ne doit pas
-- bloquer la suppression ni faire disparaître ses comptes en cascade —
-- même convention que pour Transactions/Actions plus bas.
CREATE TABLE dbo.Comptes (
    Id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Comptes PRIMARY KEY DEFAULT NEWID(),
    DetenteurId         UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne NVARCHAR(300)    NULL,
    SocieteEmettriceId  UNIQUEIDENTIFIER NULL,
    Type                NVARCHAR(50)     NULL,
    Nom                 NVARCHAR(200)    NOT NULL,
    CONSTRAINT CK_Comptes_Detenteur CHECK (
        (DetenteurId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (DetenteurId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_Comptes_DetenteurId ON dbo.Comptes (DetenteurId);
CREATE INDEX IX_Comptes_SocieteEmettriceId ON dbo.Comptes (SocieteEmettriceId);
GO

-- Ventilation par Type du nombre total d'actions d'une ligne de
-- HistoriqueTotauxSociete (ex. 10 de Type A + 20 de Type B + 30 de Type C
-- = 60) : la somme de ces lignes EST le nombre total d'actions à cette
-- date, jamais stockée ailleurs (même principe que PlusValue sur
-- Transactions — une valeur dérivable ne se stocke pas). Supprimées en
-- cascade avec leur ligne d'historique.
CREATE TABLE dbo.HistoriqueTotalActionsType (
    Id                       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotalActionsType PRIMARY KEY DEFAULT NEWID(),
    HistoriqueTotalSocieteId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_HistoriqueTotalActionsType_Historique
                                 REFERENCES dbo.HistoriqueTotauxSociete (Id) ON DELETE CASCADE,
    Type                     NVARCHAR(50)     NULL,
    Quantite                 DECIMAL(18,4)    NOT NULL,
    CONSTRAINT UQ_HistoriqueTotalActionsType UNIQUE (HistoriqueTotalSocieteId, Type)
);
GO
CREATE INDEX IX_HistoriqueTotalActionsType_Historique ON dbo.HistoriqueTotalActionsType (HistoriqueTotalSocieteId);
GO

-- Pas de clé étrangère sur AcheteurId/CibleId/VendeurId : comme dans
-- l'application d'origine, une société supprimée peut laisser des
-- transactions "orphelines" (affichées côté appli comme "(supprimée)")
-- plutôt que de bloquer la suppression ou de la propager en cascade.
-- NombreActions/Categorie/CompteAcheteurId/CompteVendeurId ne sont PAS des
-- colonnes ici : une transaction peut porter sur plusieurs Catégories à la
-- fois (voir TransactionLignes plus bas), chacune avec son propre Compte —
-- seuls les droits de vote théorique/exerçable restent des nombres globaux,
-- non ventilés par Catégorie (même principe que HistoriqueTotauxSociete).
CREATE TABLE dbo.Transactions (
    Id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Transactions PRIMARY KEY DEFAULT NEWID(),
    -- Acheteur/vendeur : soit une société suivie (Id), soit un tiers hors
    -- groupe (NomExterne, saisie libre) — l'acheteur est toujours l'un des
    -- deux ; le vendeur peut aussi être totalement inconnu (les deux NULL).
    AcheteurId        UNIQUEIDENTIFIER NULL,
    AcheteurNomExterne NVARCHAR(300)   NULL,
    CibleId           UNIQUEIDENTIFIER NOT NULL,
    [Date]            DATE             NOT NULL,
    -- Positif = achat, négatif = vente (cession d'une partie de la participation détenue).
    NombreDroitVoteTheorique DECIMAL(18,4) NULL,
    NombreDroitVoteExercable DECIMAL(18,4) NULL,
    VendeurId         UNIQUEIDENTIFIER NULL,
    VendeurNomExterne NVARCHAR(300)    NULL,
    PrixAction        DECIMAL(18,4)    NULL CONSTRAINT CK_Transactions_PrixAction CHECK (PrixAction >= 0),
    CONSTRAINT CK_Transactions_Acheteur CHECK (
        (AcheteurId IS NULL AND AcheteurNomExterne IS NOT NULL)
        OR (AcheteurId IS NOT NULL AND AcheteurNomExterne IS NULL)
    ),
    CONSTRAINT CK_Transactions_Vendeur CHECK (NOT (VendeurId IS NOT NULL AND VendeurNomExterne IS NOT NULL))
);
GO

CREATE INDEX IX_Transactions_AcheteurId ON dbo.Transactions (AcheteurId);
CREATE INDEX IX_Transactions_CibleId ON dbo.Transactions (CibleId);
GO

-- Une ligne = un mouvement d'actions d'une Catégorie donnée au sein d'une
-- transaction (positif = l'acheteur gagne, négatif = l'acheteur perd — même
-- convention que l'ancien Transactions.NombreActions). PlusValue n'est pas
-- une colonne : recalculée à la volée par ligne, comme pour les totaux par
-- Catégorie des sociétés (même principe que PlusValue sur l'ancien
-- Transactions — une valeur dérivable ne se stocke pas).
CREATE TABLE dbo.TransactionLignes (
    Id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TransactionLignes PRIMARY KEY DEFAULT NEWID(),
    TransactionId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_TransactionLignes_Transaction
                         REFERENCES dbo.Transactions (Id) ON DELETE CASCADE,
    Categorie        NVARCHAR(50)     NULL,
    NombreActions    DECIMAL(18,4)    NOT NULL,
    -- Compte (dbo.Comptes) de l'acheteur / du vendeur concerné par cette
    -- ligne, facultatif — pas de clé étrangère, même raison que pour
    -- Actions.CompteId plus bas.
    CompteAcheteurId UNIQUEIDENTIFIER NULL,
    CompteVendeurId  UNIQUEIDENTIFIER NULL
);
GO
CREATE INDEX IX_TransactionLignes_TransactionId ON dbo.TransactionLignes (TransactionId);
GO

-- Suivi du cycle de vie des titres : une ligne par LOT (regroupement de
-- titres acquis ensemble — même société émettrice, catégorie, détenteur,
-- compte, prix et date d'acquisition — avec un nombre Quantite), pas par
-- titre unitaire (un lot de plusieurs millions de titres tient sur une
-- seule ligne). Alimentée automatiquement par l'API à chaque création/
-- modification/suppression de transaction (TransactionOrigineId trace la
-- transaction à l'origine de la ligne, pour pouvoir l'annuler) — jamais
-- saisie à la main. Pas de clé étrangère vers Societes/Transactions/
-- Comptes (une société, une transaction ou un compte supprimé ne doit pas
-- bloquer/casser en cascade).
--
-- Seule la notion Actions a une table de lots : DroitsVoteTheorique et
-- DroitsVoteExercable n'en ont plus (retirées) — aucun calcul de
-- l'application n'en dépendait (seul le calcul FIFO de la plus-value a
-- besoin des lots, et uniquement sur les actions) ; le suivi des droits de
-- vote détenus reste disponible via les quantités saisies sur les
-- transactions (NombreDroitVoteTheorique/NombreDroitVoteExercable).
CREATE TABLE dbo.Actions (
    Id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Actions PRIMARY KEY DEFAULT NEWID(),
    SocieteEmettriceId   UNIQUEIDENTIFIER NOT NULL,
    Categorie            NVARCHAR(50)     NULL,
    SocieteDetentriceId  UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne  NVARCHAR(300)    NULL,
    CompteId             UNIQUEIDENTIFIER NULL,
    Quantite             DECIMAL(18,4)    NOT NULL,
    PrixInitial          DECIMAL(18,4)    NULL,
    PrixAcquisition      DECIMAL(18,4)    NULL,
    DateAcquisition      DATE             NULL,
    TransactionOrigineId UNIQUEIDENTIFIER NULL,
    CONSTRAINT CK_Actions_Detenteur CHECK (
        (SocieteDetentriceId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (SocieteDetentriceId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_Actions_SocieteEmettriceId ON dbo.Actions (SocieteEmettriceId);
CREATE INDEX IX_Actions_SocieteDetentriceId ON dbo.Actions (SocieteDetentriceId);
CREATE INDEX IX_Actions_TransactionOrigineId ON dbo.Actions (TransactionOrigineId);
CREATE INDEX IX_Actions_CompteId ON dbo.Actions (CompteId);
GO

-- Authentification temporaire (en attendant le SSO) : voir le commentaire
-- en tête de sql/migrations/2026-09-16-authentification.sql pour le détail
-- du choix (mot de passe en clair, etc.).
CREATE TABLE dbo.Utilisateurs (
    Id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Utilisateurs PRIMARY KEY DEFAULT NEWID(),
    Email      NVARCHAR(255)    NOT NULL,
    MotDePasse NVARCHAR(10)     NOT NULL,
    Role       NVARCHAR(50)     NOT NULL CONSTRAINT CK_Utilisateurs_Role CHECK (Role IN ('DSI', 'Direction des titres')),
    CreeLe     DATETIME2        NOT NULL CONSTRAINT DF_Utilisateurs_CreeLe DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Utilisateurs_Email UNIQUE (Email)
);
GO

CREATE TABLE dbo.Sessions (
    Token         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Sessions PRIMARY KEY DEFAULT NEWID(),
    UtilisateurId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Sessions_Utilisateur REFERENCES dbo.Utilisateurs (Id) ON DELETE CASCADE,
    CreeLe        DATETIME2        NOT NULL CONSTRAINT DF_Sessions_CreeLe DEFAULT SYSUTCDATETIME(),
    ExpireLe      DATETIME2        NOT NULL
);
GO

CREATE INDEX IX_Sessions_UtilisateurId ON dbo.Sessions (UtilisateurId);
GO

-- Compte applicatif dédié (authentification SQL, pas d'accès Windows/AD).
CREATE LOGIN titres_app WITH PASSWORD = 'CHANGE_ME_STRONG_PASSWORD!';
GO

CREATE USER titres_app FOR LOGIN titres_app;
GO

ALTER ROLE db_datareader ADD MEMBER titres_app;
ALTER ROLE db_datawriter ADD MEMBER titres_app;
GO

-- ---------------------------------------------------------------------
-- Premier compte applicatif : toute l'application est derrière la
-- connexion, il en faut un pour pouvoir se connecter et en créer d'autres
-- depuis l'écran "Utilisateurs". Remplacez l'email ci-dessous PUIS
-- décommentez ce bloc avant de l'exécuter.
-- ---------------------------------------------------------------------
/*
DECLARE @Caracteres NVARCHAR(62) = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
DECLARE @MotDePasse NVARCHAR(10) = '';
DECLARE @i INT = 0;
WHILE @i < 10
BEGIN
    SET @MotDePasse = @MotDePasse + SUBSTRING(@Caracteres, CAST(RAND(CHECKSUM(NEWID())) * LEN(@Caracteres) + 1 AS INT), 1);
    SET @i += 1;
END;

INSERT INTO dbo.Utilisateurs (Email, MotDePasse, Role)
VALUES ('remplacez-moi@bollore.com', @MotDePasse, 'DSI');

SELECT Email, MotDePasse, Role FROM dbo.Utilisateurs WHERE Email = 'remplacez-moi@bollore.com';
*/
GO
