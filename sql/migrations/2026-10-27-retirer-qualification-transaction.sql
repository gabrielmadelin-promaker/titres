-- Retire la colonne Qualification (Simple/Fusion/TUPE) de dbo.Transactions
-- — champ sans usage dans les calculs de l'application, retiré sur demande.
--
-- Supprime d'abord sa contrainte CHECK et son DEFAULT, nommés explicitement
-- à la création de la table (CK_Transactions_Qualification et
-- DF_Transactions_Qualification), avant de retirer la colonne elle-même.
--
-- Script destructif : les valeurs existantes sont perdues. Rejouable sans
-- effet si la colonne a déjà été retirée (IF EXISTS sur chaque étape).

USE CalculDesTitres;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Transactions_Qualification')
    ALTER TABLE dbo.Transactions DROP CONSTRAINT CK_Transactions_Qualification;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Transactions_Qualification')
    ALTER TABLE dbo.Transactions DROP CONSTRAINT DF_Transactions_Qualification;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Transactions') AND name = 'Qualification')
    ALTER TABLE dbo.Transactions DROP COLUMN Qualification;
GO
