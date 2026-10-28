-- Introduit deux nouvelles notions transverses :
--   - Type : la catégorie d'un titre (A, B, C...), déjà saisie comme texte
--     libre (Transactions.Categorie / Actions.Categorie), gagne une table de
--     référence (gérée : ajout possible depuis l'application), utilisée en
--     SUGGESTIONS sur ces champs — qui restent du texte libre, pas une
--     liste fermée (décision actée : garder la souplesse actuelle).
--   - Compte : regroupement nommé des titres détenus par un actionnaire
--     (société suivie ou tiers externe), toujours dédié à un seul Type
--     (ex. "Compte A1" pour les titres de Type A d'un actionnaire donné).
--     Choisi sur chaque transaction (acheteur et/ou vendeur) ; les lots
--     générés automatiquement dans Actions portent ensuite ce Compte.
--
-- Introduit aussi la ventilation du nombre total d'actions d'une société
-- PAR TYPE (ex. 10 de Type A + 20 de Type B + 30 de Type C = 60), en plus
-- de la date d'effet déjà en place (dbo.HistoriqueTotauxSociete) — décision
-- actée : uniquement pour le nombre d'actions, pas pour les droits de vote
-- théorique/exerçable, qui restent un nombre global par date.
--
-- À exécuter avant le déploiement du nouveau code (API + front) qui
-- s'appuie sur ces tables.

USE CalculDesTitres;
GO

CREATE TABLE dbo.Types (
    Id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Types PRIMARY KEY DEFAULT NEWID(),
    Nom NVARCHAR(10)     NOT NULL,
    CONSTRAINT UQ_Types_Nom UNIQUE (Nom)
);
GO

-- Pas de clé étrangère vers Societes (DetenteurId) : un détenteur supprimé
-- ne doit pas bloquer la suppression ni faire disparaître ses comptes en
-- cascade — même convention que pour Transactions/Actions plus haut.
CREATE TABLE dbo.Comptes (
    Id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Comptes PRIMARY KEY DEFAULT NEWID(),
    DetenteurId         UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne NVARCHAR(300)    NULL,
    Type                NVARCHAR(10)     NULL,
    Nom                 NVARCHAR(200)    NOT NULL,
    CONSTRAINT CK_Comptes_Detenteur CHECK (
        (DetenteurId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (DetenteurId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_Comptes_DetenteurId ON dbo.Comptes (DetenteurId);
GO

-- Lignes de détail par Type d'une ligne de dbo.HistoriqueTotauxSociete : la
-- somme de ces lignes remplace NombreTotalActions (retirée plus bas), pour
-- ne jamais stocker une valeur dérivable (même principe que PlusValue sur
-- Transactions). Supprimées en cascade avec leur ligne d'historique.
CREATE TABLE dbo.HistoriqueTotalActionsType (
    Id                       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotalActionsType PRIMARY KEY DEFAULT NEWID(),
    HistoriqueTotalSocieteId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_HistoriqueTotalActionsType_Historique
                                 REFERENCES dbo.HistoriqueTotauxSociete (Id) ON DELETE CASCADE,
    Type                     NVARCHAR(10)     NULL,
    Quantite                 DECIMAL(18,4)    NOT NULL,
    CONSTRAINT UQ_HistoriqueTotalActionsType UNIQUE (HistoriqueTotalSocieteId, Type)
);
GO
CREATE INDEX IX_HistoriqueTotalActionsType_Historique ON dbo.HistoriqueTotalActionsType (HistoriqueTotalSocieteId);
GO

-- Migre les totaux d'actions déjà saisis (un seul nombre, sans détail par
-- Type connu) en une unique ligne de détail à Type NULL ("non ventilé") par
-- ligne d'historique concernée, pour ne rien perdre des données existantes.
-- Une fois cette table en place, NombreTotalActions n'est plus utile.
INSERT INTO dbo.HistoriqueTotalActionsType (HistoriqueTotalSocieteId, Type, Quantite)
SELECT Id, NULL, NombreTotalActions
FROM dbo.HistoriqueTotauxSociete
WHERE NombreTotalActions IS NOT NULL;
GO

ALTER TABLE dbo.HistoriqueTotauxSociete DROP COLUMN NombreTotalActions;
GO

-- Compte choisi côté acheteur / vendeur sur chaque transaction. Pas de FK
-- (même raison que CompteId sur Actions plus bas) : un compte supprimé ne
-- doit pas bloquer la suppression de transactions déjà rattachées.
ALTER TABLE dbo.Transactions ADD
    CompteAcheteurId UNIQUEIDENTIFIER NULL,
    CompteVendeurId  UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE dbo.Actions ADD CompteId UNIQUEIDENTIFIER NULL;
GO
CREATE INDEX IX_Actions_CompteId ON dbo.Actions (CompteId);
GO
