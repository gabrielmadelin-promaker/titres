-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- Autorise les transactions négatives (ventes) : la contrainte n'acceptait
-- jusqu'ici que 0 < Pourcentage <= 100.

USE CalculDesTitres;
GO

ALTER TABLE dbo.Transactions DROP CONSTRAINT CK_Transactions_Pourcentage;
GO

-- Positif = achat, négatif = vente (cession d'une partie de la participation détenue).
ALTER TABLE dbo.Transactions ADD CONSTRAINT CK_Transactions_Pourcentage
    CHECK (Pourcentage <> 0 AND Pourcentage BETWEEN -100 AND 100);
GO
