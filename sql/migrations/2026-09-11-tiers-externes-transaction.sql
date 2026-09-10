-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- Permet à la société acheteuse ou vendeuse d'une transaction d'être hors
-- groupe (un tiers non suivi dans dbo.Societes) : AcheteurId/VendeurId
-- deviennent facultatifs, complétés par un nom libre (NomExterne) quand la
-- société n'est pas suivie.

USE CalculDesTitres;
GO

ALTER TABLE dbo.Transactions ALTER COLUMN AcheteurId UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE dbo.Transactions ADD AcheteurNomExterne NVARCHAR(300) NULL;
GO

ALTER TABLE dbo.Transactions ADD VendeurNomExterne NVARCHAR(300) NULL;
GO

-- Acheteur : toujours l'un des deux, jamais les deux.
ALTER TABLE dbo.Transactions ADD CONSTRAINT CK_Transactions_Acheteur
    CHECK ((AcheteurId IS NULL) <> (AcheteurNomExterne IS NULL));
GO

-- Vendeur : facultatif (les deux NULL = inconnu), mais pas les deux à la fois.
ALTER TABLE dbo.Transactions ADD CONSTRAINT CK_Transactions_Vendeur
    CHECK (NOT (VendeurId IS NOT NULL AND VendeurNomExterne IS NOT NULL));
GO
