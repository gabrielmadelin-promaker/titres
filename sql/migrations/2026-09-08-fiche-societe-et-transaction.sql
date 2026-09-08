-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- 1. Ajoute les nouveaux champs d'identité de la société (valeur nominale,
--    pays, siège social, SIREN, LEI).
-- 2. Renomme Transactions.Pourcentage en Capital (même signification,
--    nouveau nom pour cohabiter avec les nouvelles métriques) et ajoute le
--    nombre d'actions, les droits de vote théorique/exerçable, la société
--    vendeuse, le prix de l'action et la qualification de la transaction.

USE CalculDesTitres;
GO

ALTER TABLE dbo.Societes ADD
    ValeurNominale DECIMAL(18,4) NULL,
    Pays           NVARCHAR(100) NULL,
    SiegeSocial    NVARCHAR(300) NULL,
    Siren          NVARCHAR(20)  NULL,
    Lei            NVARCHAR(20)  NULL;
GO

-- Renomme la colonne en conservant les données existantes, puis la
-- contrainte CHECK associée (sp_rename ne renomme pas les contraintes).
ALTER TABLE dbo.Transactions DROP CONSTRAINT CK_Transactions_Pourcentage;
GO
EXEC sp_rename 'dbo.Transactions.Pourcentage', 'Capital', 'COLUMN';
GO
ALTER TABLE dbo.Transactions ADD CONSTRAINT CK_Transactions_Capital
    CHECK (Capital <> 0 AND Capital BETWEEN -100 AND 100);
GO

ALTER TABLE dbo.Transactions ADD
    NombreActions      DECIMAL(18,4)    NULL,
    DroitVoteTheorique DECIMAL(6,2)     NULL CONSTRAINT CK_Transactions_DVTheorique CHECK (DroitVoteTheorique BETWEEN -100 AND 100),
    DroitVoteExercable DECIMAL(6,2)     NULL CONSTRAINT CK_Transactions_DVExercable CHECK (DroitVoteExercable BETWEEN -100 AND 100),
    VendeurId          UNIQUEIDENTIFIER NULL,
    PrixAction         DECIMAL(18,4)    NULL CONSTRAINT CK_Transactions_PrixAction CHECK (PrixAction >= 0),
    Qualification      NVARCHAR(20)     NOT NULL CONSTRAINT DF_Transactions_Qualification DEFAULT 'Simple'
                         CONSTRAINT CK_Transactions_Qualification CHECK (Qualification IN ('Simple', 'Fusion', 'TUPE'));
GO
