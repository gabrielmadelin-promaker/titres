-- Une transaction peut désormais porter plusieurs (Catégorie, Quantité) à
-- la fois (ex. un même échange qui porte sur des actions de catégorie A ET
-- de catégorie B) — chacune avec son propre Compte acheteur/vendeur, un
-- compte étant toujours dédié à une seule Catégorie. TransactionLignes
-- remplace donc NombreActions/Categorie/CompteAcheteurId/CompteVendeurId
-- sur Transactions, qui n'ont plus de sens au niveau de la transaction
-- elle-même (NombreDroitVoteTheorique/NombreDroitVoteExercable restent en
-- revanche des nombres globaux par transaction, non ventilés).
--
-- Un Compte devient aussi dédié à une seule Société émettrice en plus d'une
-- seule Catégorie : "actions de catégorie A de la société X" et "actions de
-- catégorie A de la société Y" sont deux comptes différents.
--
-- À exécuter avant le déploiement du nouveau code (API + front) qui
-- s'appuie sur ces changements.

USE CalculDesTitres;
GO

CREATE TABLE dbo.TransactionLignes (
    Id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TransactionLignes PRIMARY KEY DEFAULT NEWID(),
    TransactionId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_TransactionLignes_Transaction
                         REFERENCES dbo.Transactions (Id) ON DELETE CASCADE,
    Categorie        NVARCHAR(50)     NULL,
    NombreActions    DECIMAL(18,4)    NOT NULL,
    -- Pas de clé étrangère vers Comptes (un compte supprimé ne doit pas
    -- bloquer/casser en cascade) — même convention que partout ailleurs.
    CompteAcheteurId UNIQUEIDENTIFIER NULL,
    CompteVendeurId  UNIQUEIDENTIFIER NULL
);
GO
CREATE INDEX IX_TransactionLignes_TransactionId ON dbo.TransactionLignes (TransactionId);
GO

-- Migre chaque transaction existante (qui ne portait qu'une seule
-- catégorie) en une unique ligne, pour ne rien perdre des données actuelles.
INSERT INTO dbo.TransactionLignes (TransactionId, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId)
SELECT Id, Categorie, NombreActions, CompteAcheteurId, CompteVendeurId
FROM dbo.Transactions
WHERE NombreActions IS NOT NULL;
GO

ALTER TABLE dbo.Transactions DROP COLUMN NombreActions;
GO
ALTER TABLE dbo.Transactions DROP COLUMN Categorie;
GO
ALTER TABLE dbo.Transactions DROP COLUMN CompteAcheteurId;
GO
ALTER TABLE dbo.Transactions DROP COLUMN CompteVendeurId;
GO
-- PlusValue n'a jamais été ni lue ni écrite par l'API (toujours recalculée
-- à la volée, voir CalculerPlusValues côté backend) : colonne obsolète.
ALTER TABLE dbo.Transactions DROP COLUMN PlusValue;
GO

ALTER TABLE dbo.Comptes ADD SocieteEmettriceId UNIQUEIDENTIFIER NULL;
GO
CREATE INDEX IX_Comptes_SocieteEmettriceId ON dbo.Comptes (SocieteEmettriceId);
GO
