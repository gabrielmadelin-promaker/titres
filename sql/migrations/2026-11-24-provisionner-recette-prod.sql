-- Provisionne TITRA_RECETTE et TITRA_PROD à partir de TITRA_DEV déjà créée
-- (sql/schema.sql y a déjà été exécuté). Crée les deux bases avec le même
-- schéma, puis reprend UNIQUEMENT dbo.Utilisateurs et dbo.Types depuis
-- TITRA_DEV (pas Sociétés/Transactions/Comptes/Actions/Totaux/Sessions :
-- chaque environnement démarre vierge sur ces tables).
--
-- À exécuter sur le même serveur que TITRA_DEV (connexion "master"), avec
-- un compte sysadmin/dbcreator, via SSMS ou sqlcmd. Le login SQL
-- "titres_app" existe déjà au niveau du serveur (créé par schema.sql pour
-- TITRA_DEV) : ce script ne le recrée pas, il se contente de le mapper
-- dans les deux nouvelles bases.
--
-- Remplacez le mot de passe de création de login si besoin — ici inutile,
-- on réutilise le login existant.

USE master;
GO

-- =====================================================================
-- TITRA_RECETTE
-- =====================================================================

CREATE DATABASE TITRA_RECETTE;
GO

USE TITRA_RECETTE;
GO

CREATE TABLE dbo.Societes (
    Id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Societes PRIMARY KEY DEFAULT NEWID(),
    Nom            NVARCHAR(200)    NOT NULL,
    Isin           NVARCHAR(12)     NULL,
    CodeMnemonique NVARCHAR(20)     NULL,
    Pays           NVARCHAR(100)    NULL,
    SiegeSocial    NVARCHAR(300)    NULL,
    Siren          NVARCHAR(20)     NULL,
    Lei            NVARCHAR(20)     NULL
);
GO

CREATE TABLE dbo.HistoriqueTotauxSociete (
    Id                             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotauxSociete PRIMARY KEY DEFAULT NEWID(),
    SocieteId                      UNIQUEIDENTIFIER NOT NULL,
    DateEffet                      DATE             NOT NULL,
    NombreTotalDroitVoteTheorique  DECIMAL(18,4)    NULL,
    NombreTotalDroitVoteExercable  DECIMAL(18,4)    NULL,
    Devise                         NVARCHAR(3)      NOT NULL CONSTRAINT DF_HistoriqueTotauxSociete_Devise DEFAULT 'EUR',
    CONSTRAINT UQ_HistoriqueTotauxSociete_SocieteDate UNIQUE (SocieteId, DateEffet)
);
GO
CREATE INDEX IX_HistoriqueTotauxSociete_SocieteId ON dbo.HistoriqueTotauxSociete (SocieteId);
GO

CREATE TABLE dbo.Types (
    Id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Types PRIMARY KEY DEFAULT NEWID(),
    Nom               NVARCHAR(50)     NOT NULL,
    RentreDansCapital BIT              NOT NULL CONSTRAINT DF_Types_RentreDansCapital DEFAULT 1,
    CONSTRAINT UQ_Types_Nom UNIQUE (Nom)
);
GO

CREATE TABLE dbo.Comptes (
    Id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Comptes PRIMARY KEY DEFAULT NEWID(),
    DetenteurId         UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne NVARCHAR(300)    NULL,
    SocieteEmettriceId  UNIQUEIDENTIFIER NULL,
    Type                NVARCHAR(50)     NULL,
    Nom                 NVARCHAR(200)    NOT NULL,
    Numero              NVARCHAR(8)      NULL,
    CONSTRAINT CK_Comptes_Detenteur CHECK (
        (DetenteurId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (DetenteurId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_Comptes_DetenteurId ON dbo.Comptes (DetenteurId);
CREATE INDEX IX_Comptes_SocieteEmettriceId ON dbo.Comptes (SocieteEmettriceId);
GO

CREATE TABLE dbo.HistoriqueTotalActionsType (
    Id                       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotalActionsType PRIMARY KEY DEFAULT NEWID(),
    HistoriqueTotalSocieteId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_HistoriqueTotalActionsType_Historique
                                 REFERENCES dbo.HistoriqueTotauxSociete (Id) ON DELETE CASCADE,
    Type                     NVARCHAR(50)     NULL,
    Quantite                 DECIMAL(18,4)    NOT NULL,
    ValeurNominale           DECIMAL(18,4)    NULL,
    CONSTRAINT UQ_HistoriqueTotalActionsType UNIQUE (HistoriqueTotalSocieteId, Type)
);
GO
CREATE INDEX IX_HistoriqueTotalActionsType_Historique ON dbo.HistoriqueTotalActionsType (HistoriqueTotalSocieteId);
GO

CREATE TABLE dbo.Transactions (
    Id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Transactions PRIMARY KEY DEFAULT NEWID(),
    AcheteurId        UNIQUEIDENTIFIER NULL,
    AcheteurNomExterne NVARCHAR(300)   NULL,
    CibleId           UNIQUEIDENTIFIER NOT NULL,
    [Date]            DATE             NOT NULL,
    NombreDroitVoteTheorique DECIMAL(18,4) NULL,
    NombreDroitVoteExercable DECIMAL(18,4) NULL,
    VendeurId         UNIQUEIDENTIFIER NULL,
    VendeurNomExterne NVARCHAR(300)    NULL,
    PrixAction        DECIMAL(18,4)    NULL CONSTRAINT CK_Transactions_PrixAction CHECK (PrixAction >= 0),
    Devise            NVARCHAR(3)      NOT NULL CONSTRAINT DF_Transactions_Devise DEFAULT 'EUR',
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

CREATE TABLE dbo.TransactionLignes (
    Id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TransactionLignes PRIMARY KEY DEFAULT NEWID(),
    TransactionId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_TransactionLignes_Transaction
                         REFERENCES dbo.Transactions (Id) ON DELETE CASCADE,
    Categorie        NVARCHAR(50)     NULL,
    NombreActions    DECIMAL(18,4)    NOT NULL,
    CompteAcheteurId UNIQUEIDENTIFIER NULL,
    CompteVendeurId  UNIQUEIDENTIFIER NULL
);
GO
CREATE INDEX IX_TransactionLignes_TransactionId ON dbo.TransactionLignes (TransactionId);
GO

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

-- Login déjà créé au niveau du serveur par schema.sql (TITRA_DEV) : on se
-- contente de le mapper dans cette nouvelle base.
CREATE USER titres_app FOR LOGIN titres_app;
GO
ALTER ROLE db_datareader ADD MEMBER titres_app;
ALTER ROLE db_datawriter ADD MEMBER titres_app;
GO

-- Reprise des Utilisateurs et des Types (Catégories) depuis TITRA_DEV —
-- rien d'autre (Sociétés/Transactions/Comptes/Actions/Totaux/Sessions
-- restent vierges dans cet environnement).
INSERT INTO dbo.Utilisateurs (Id, Email, MotDePasse, Role, CreeLe)
SELECT Id, Email, MotDePasse, Role, CreeLe FROM TITRA_DEV.dbo.Utilisateurs;

INSERT INTO dbo.Types (Id, Nom, RentreDansCapital)
SELECT Id, Nom, RentreDansCapital FROM TITRA_DEV.dbo.Types;
GO

-- Vérification rapide
SELECT 'TITRA_RECETTE' AS Base, 'Utilisateurs' AS Table_, COUNT(*) AS Nb FROM dbo.Utilisateurs
UNION ALL
SELECT 'TITRA_RECETTE', 'Types', COUNT(*) FROM dbo.Types;
GO

-- =====================================================================
-- TITRA_PROD
-- =====================================================================

USE master;
GO

CREATE DATABASE TITRA_PROD;
GO

USE TITRA_PROD;
GO

CREATE TABLE dbo.Societes (
    Id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Societes PRIMARY KEY DEFAULT NEWID(),
    Nom            NVARCHAR(200)    NOT NULL,
    Isin           NVARCHAR(12)     NULL,
    CodeMnemonique NVARCHAR(20)     NULL,
    Pays           NVARCHAR(100)    NULL,
    SiegeSocial    NVARCHAR(300)    NULL,
    Siren          NVARCHAR(20)     NULL,
    Lei            NVARCHAR(20)     NULL
);
GO

CREATE TABLE dbo.HistoriqueTotauxSociete (
    Id                             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotauxSociete PRIMARY KEY DEFAULT NEWID(),
    SocieteId                      UNIQUEIDENTIFIER NOT NULL,
    DateEffet                      DATE             NOT NULL,
    NombreTotalDroitVoteTheorique  DECIMAL(18,4)    NULL,
    NombreTotalDroitVoteExercable  DECIMAL(18,4)    NULL,
    Devise                         NVARCHAR(3)      NOT NULL CONSTRAINT DF_HistoriqueTotauxSociete_Devise DEFAULT 'EUR',
    CONSTRAINT UQ_HistoriqueTotauxSociete_SocieteDate UNIQUE (SocieteId, DateEffet)
);
GO
CREATE INDEX IX_HistoriqueTotauxSociete_SocieteId ON dbo.HistoriqueTotauxSociete (SocieteId);
GO

CREATE TABLE dbo.Types (
    Id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Types PRIMARY KEY DEFAULT NEWID(),
    Nom               NVARCHAR(50)     NOT NULL,
    RentreDansCapital BIT              NOT NULL CONSTRAINT DF_Types_RentreDansCapital DEFAULT 1,
    CONSTRAINT UQ_Types_Nom UNIQUE (Nom)
);
GO

CREATE TABLE dbo.Comptes (
    Id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Comptes PRIMARY KEY DEFAULT NEWID(),
    DetenteurId         UNIQUEIDENTIFIER NULL,
    DetenteurNomExterne NVARCHAR(300)    NULL,
    SocieteEmettriceId  UNIQUEIDENTIFIER NULL,
    Type                NVARCHAR(50)     NULL,
    Nom                 NVARCHAR(200)    NOT NULL,
    Numero              NVARCHAR(8)      NULL,
    CONSTRAINT CK_Comptes_Detenteur CHECK (
        (DetenteurId IS NULL AND DetenteurNomExterne IS NOT NULL)
        OR (DetenteurId IS NOT NULL AND DetenteurNomExterne IS NULL)
    )
);
GO
CREATE INDEX IX_Comptes_DetenteurId ON dbo.Comptes (DetenteurId);
CREATE INDEX IX_Comptes_SocieteEmettriceId ON dbo.Comptes (SocieteEmettriceId);
GO

CREATE TABLE dbo.HistoriqueTotalActionsType (
    Id                       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotalActionsType PRIMARY KEY DEFAULT NEWID(),
    HistoriqueTotalSocieteId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_HistoriqueTotalActionsType_Historique
                                 REFERENCES dbo.HistoriqueTotauxSociete (Id) ON DELETE CASCADE,
    Type                     NVARCHAR(50)     NULL,
    Quantite                 DECIMAL(18,4)    NOT NULL,
    ValeurNominale           DECIMAL(18,4)    NULL,
    CONSTRAINT UQ_HistoriqueTotalActionsType UNIQUE (HistoriqueTotalSocieteId, Type)
);
GO
CREATE INDEX IX_HistoriqueTotalActionsType_Historique ON dbo.HistoriqueTotalActionsType (HistoriqueTotalSocieteId);
GO

CREATE TABLE dbo.Transactions (
    Id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Transactions PRIMARY KEY DEFAULT NEWID(),
    AcheteurId        UNIQUEIDENTIFIER NULL,
    AcheteurNomExterne NVARCHAR(300)   NULL,
    CibleId           UNIQUEIDENTIFIER NOT NULL,
    [Date]            DATE             NOT NULL,
    NombreDroitVoteTheorique DECIMAL(18,4) NULL,
    NombreDroitVoteExercable DECIMAL(18,4) NULL,
    VendeurId         UNIQUEIDENTIFIER NULL,
    VendeurNomExterne NVARCHAR(300)    NULL,
    PrixAction        DECIMAL(18,4)    NULL CONSTRAINT CK_Transactions_PrixAction CHECK (PrixAction >= 0),
    Devise            NVARCHAR(3)      NOT NULL CONSTRAINT DF_Transactions_Devise DEFAULT 'EUR',
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

CREATE TABLE dbo.TransactionLignes (
    Id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TransactionLignes PRIMARY KEY DEFAULT NEWID(),
    TransactionId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_TransactionLignes_Transaction
                         REFERENCES dbo.Transactions (Id) ON DELETE CASCADE,
    Categorie        NVARCHAR(50)     NULL,
    NombreActions    DECIMAL(18,4)    NOT NULL,
    CompteAcheteurId UNIQUEIDENTIFIER NULL,
    CompteVendeurId  UNIQUEIDENTIFIER NULL
);
GO
CREATE INDEX IX_TransactionLignes_TransactionId ON dbo.TransactionLignes (TransactionId);
GO

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

CREATE USER titres_app FOR LOGIN titres_app;
GO
ALTER ROLE db_datareader ADD MEMBER titres_app;
ALTER ROLE db_datawriter ADD MEMBER titres_app;
GO

INSERT INTO dbo.Utilisateurs (Id, Email, MotDePasse, Role, CreeLe)
SELECT Id, Email, MotDePasse, Role, CreeLe FROM TITRA_DEV.dbo.Utilisateurs;

INSERT INTO dbo.Types (Id, Nom, RentreDansCapital)
SELECT Id, Nom, RentreDansCapital FROM TITRA_DEV.dbo.Types;
GO

SELECT 'TITRA_PROD' AS Base, 'Utilisateurs' AS Table_, COUNT(*) AS Nb FROM dbo.Utilisateurs
UNION ALL
SELECT 'TITRA_PROD', 'Types', COUNT(*) FROM dbo.Types;
GO
