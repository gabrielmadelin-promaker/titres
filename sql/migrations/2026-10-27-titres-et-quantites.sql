-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- Refonte : les transactions ne saisissent plus de pourcentage (Capital,
-- Droit de vote théorique/exerçable) — seulement des quantités (nombre
-- d'actions, nombre de droits de vote théorique/exerçable). Les
-- pourcentages affichés dans l'application sont désormais calculés
-- automatiquement à partir de ces quantités rapportées au nombre total émis
-- par la société cible (nouveaux champs sur Societes). Les transactions déjà
-- en base, qui n'ont pas forcément de quantité renseignée, gardent leur
-- pourcentage existant comme repli d'affichage : aucune donnée existante
-- n'est modifiée ni supprimée par cette migration.
--
-- Introduit aussi le suivi du cycle de vie des titres (trois nouvelles
-- tables, une par notion) : qui détient précisément quel titre, de quelle
-- catégorie, à quel prix il a été acquis. Alimentées automatiquement par
-- l'API à chaque création/modification/suppression de transaction (jamais
-- saisies à la main).

USE CalculDesTitres;
GO

ALTER TABLE dbo.Societes ADD
    NombreTotalActions            DECIMAL(18,4) NULL,
    NombreTotalDroitVoteTheorique DECIMAL(18,4) NULL,
    NombreTotalDroitVoteExercable DECIMAL(18,4) NULL;
GO

ALTER TABLE dbo.Transactions ADD
    NombreDroitVoteTheorique DECIMAL(18,4) NULL,
    NombreDroitVoteExercable DECIMAL(18,4) NULL,
    Categorie                NVARCHAR(10)  NULL;
GO

-- Capital était jusqu'ici obligatoire et non nul (c'était le seul champ
-- toujours saisi) ; il devient un pourcentage de repli optionnel, plus
-- jamais écrit par l'application.
ALTER TABLE dbo.Transactions DROP CONSTRAINT CK_Transactions_Capital;
GO
ALTER TABLE dbo.Transactions ALTER COLUMN Capital DECIMAL(6,2) NULL;
GO

CREATE TABLE dbo.Actions (
    Id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Actions PRIMARY KEY DEFAULT NEWID(),
    SocieteEmettriceId   UNIQUEIDENTIFIER NOT NULL,
    Categorie            NVARCHAR(10)     NULL,
    SocieteDetentriceId  UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne  NVARCHAR(300)    NULL,
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
GO

CREATE TABLE dbo.DroitsVoteTheorique (
    Id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DroitsVoteTheorique PRIMARY KEY DEFAULT NEWID(),
    SocieteEmettriceId   UNIQUEIDENTIFIER NOT NULL,
    Categorie            NVARCHAR(10)     NULL,
    SocieteDetentriceId  UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne  NVARCHAR(300)    NULL,
    PrixInitial          DECIMAL(18,4)    NULL,
    PrixAcquisition      DECIMAL(18,4)    NULL,
    DateAcquisition      DATE             NULL,
    TransactionOrigineId UNIQUEIDENTIFIER NULL,
    CONSTRAINT CK_DroitsVoteTheorique_Detenteur CHECK (
        (SocieteDetentriceId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (SocieteDetentriceId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_DroitsVoteTheorique_SocieteEmettriceId ON dbo.DroitsVoteTheorique (SocieteEmettriceId);
CREATE INDEX IX_DroitsVoteTheorique_SocieteDetentriceId ON dbo.DroitsVoteTheorique (SocieteDetentriceId);
CREATE INDEX IX_DroitsVoteTheorique_TransactionOrigineId ON dbo.DroitsVoteTheorique (TransactionOrigineId);
GO

CREATE TABLE dbo.DroitsVoteExercable (
    Id                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_DroitsVoteExercable PRIMARY KEY DEFAULT NEWID(),
    SocieteEmettriceId   UNIQUEIDENTIFIER NOT NULL,
    Categorie            NVARCHAR(10)     NULL,
    SocieteDetentriceId  UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne  NVARCHAR(300)    NULL,
    PrixInitial          DECIMAL(18,4)    NULL,
    PrixAcquisition      DECIMAL(18,4)    NULL,
    DateAcquisition      DATE             NULL,
    TransactionOrigineId UNIQUEIDENTIFIER NULL,
    CONSTRAINT CK_DroitsVoteExercable_Detenteur CHECK (
        (SocieteDetentriceId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (SocieteDetentriceId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_DroitsVoteExercable_SocieteEmettriceId ON dbo.DroitsVoteExercable (SocieteEmettriceId);
CREATE INDEX IX_DroitsVoteExercable_SocieteDetentriceId ON dbo.DroitsVoteExercable (SocieteDetentriceId);
CREATE INDEX IX_DroitsVoteExercable_TransactionOrigineId ON dbo.DroitsVoteExercable (TransactionOrigineId);
GO
