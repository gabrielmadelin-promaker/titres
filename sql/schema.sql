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
    -- Sociétés affichées comme boîtes dans l'arbre central de l'organigramme ;
    -- les autres n'apparaissent que groupées dans la liste des actionnaires
    -- minoritaires de la société qu'elles détiennent (voir organigramme.ts).
    Principale    BIT              NOT NULL DEFAULT 0,
    ValeurNominale DECIMAL(18,4)   NULL,
    Pays          NVARCHAR(100)    NULL,
    SiegeSocial   NVARCHAR(300)    NULL,
    Siren         NVARCHAR(20)     NULL,
    Lei           NVARCHAR(20)     NULL
);
GO

-- Pas de clé étrangère sur AcheteurId/CibleId/VendeurId : comme dans
-- l'application d'origine, une société supprimée peut laisser des
-- transactions "orphelines" (affichées côté appli comme "(supprimée)")
-- plutôt que de bloquer la suppression ou de la propager en cascade.
CREATE TABLE dbo.Transactions (
    Id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Transactions PRIMARY KEY DEFAULT NEWID(),
    -- Acheteur/vendeur : soit une société suivie (Id), soit un tiers hors
    -- groupe (NomExterne, saisie libre) — l'acheteur est toujours l'un des
    -- deux ; le vendeur peut aussi être totalement inconnu (les deux NULL).
    AcheteurId        UNIQUEIDENTIFIER NULL,
    AcheteurNomExterne NVARCHAR(300)   NULL,
    CibleId           UNIQUEIDENTIFIER NOT NULL,
    [Date]            DATE             NOT NULL,
    NombreActions     DECIMAL(18,4)    NULL,
    -- Positif = achat, négatif = vente (cession d'une partie de la participation détenue).
    Capital           DECIMAL(6,2)     NOT NULL CONSTRAINT CK_Transactions_Capital CHECK (Capital <> 0 AND Capital BETWEEN -100 AND 100),
    DroitVoteTheorique DECIMAL(6,2)    NULL CONSTRAINT CK_Transactions_DVTheorique CHECK (DroitVoteTheorique BETWEEN -100 AND 100),
    DroitVoteExercable DECIMAL(6,2)    NULL CONSTRAINT CK_Transactions_DVExercable CHECK (DroitVoteExercable BETWEEN -100 AND 100),
    VendeurId         UNIQUEIDENTIFIER NULL,
    VendeurNomExterne NVARCHAR(300)    NULL,
    PrixAction        DECIMAL(18,4)    NULL CONSTRAINT CK_Transactions_PrixAction CHECK (PrixAction >= 0),
    Qualification     NVARCHAR(20)     NOT NULL CONSTRAINT DF_Transactions_Qualification DEFAULT 'Simple'
                        CONSTRAINT CK_Transactions_Qualification CHECK (Qualification IN ('Simple', 'Fusion', 'TUPE')),
    CONSTRAINT CK_Transactions_Acheteur CHECK ((AcheteurId IS NULL) <> (AcheteurNomExterne IS NULL)),
    CONSTRAINT CK_Transactions_Vendeur CHECK (NOT (VendeurId IS NOT NULL AND VendeurNomExterne IS NOT NULL))
);
GO

CREATE INDEX IX_Transactions_AcheteurId ON dbo.Transactions (AcheteurId);
CREATE INDEX IX_Transactions_CibleId ON dbo.Transactions (CibleId);
GO

-- Compte applicatif dédié (authentification SQL, pas d'accès Windows/AD).
CREATE LOGIN titres_app WITH PASSWORD = 'CHANGE_ME_STRONG_PASSWORD!';
GO

CREATE USER titres_app FOR LOGIN titres_app;
GO

ALTER ROLE db_datareader ADD MEMBER titres_app;
ALTER ROLE db_datawriter ADD MEMBER titres_app;
GO
