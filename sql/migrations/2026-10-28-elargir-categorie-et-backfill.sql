-- Les catégories de titres ont de vrais noms (ex. "Action ordinaire",
-- "Action de préférence"), pas seulement des codes courts (A/B/C) comme
-- envisagé initialement : élargit les colonnes prévues pour 10 caractères.
--
-- Donne aussi la catégorie "Action ordinaire" à toutes les transactions et
-- tous les lots d'Actions existants qui n'en avaient pas (créés avant que
-- cette notion n'existe) — à exécuter après le déploiement du nouveau code.

USE CalculDesTitres;
GO

ALTER TABLE dbo.Types ALTER COLUMN Nom NVARCHAR(50) NOT NULL;
GO
ALTER TABLE dbo.Comptes ALTER COLUMN Type NVARCHAR(50) NULL;
GO
ALTER TABLE dbo.Transactions ALTER COLUMN Categorie NVARCHAR(50) NULL;
GO
ALTER TABLE dbo.Actions ALTER COLUMN Categorie NVARCHAR(50) NULL;
GO
ALTER TABLE dbo.HistoriqueTotalActionsType ALTER COLUMN Type NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Types WHERE Nom = N'Action ordinaire')
    INSERT INTO dbo.Types (Nom) VALUES (N'Action ordinaire');
GO

UPDATE dbo.Transactions SET Categorie = N'Action ordinaire' WHERE Categorie IS NULL;
GO
UPDATE dbo.Actions SET Categorie = N'Action ordinaire' WHERE Categorie IS NULL;
GO

-- Garde-fou NOT EXISTS : évite de violer UQ_HistoriqueTotalActionsType
-- (HistoriqueTotalSocieteId, Type) dans le cas marginal où une ligne
-- "Action ordinaire" existerait déjà pour une société donnée (ventilation
-- déjà saisie à la main avec ce nom avant ce backfill).
UPDATE h
SET Type = N'Action ordinaire'
FROM dbo.HistoriqueTotalActionsType h
WHERE h.Type IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.HistoriqueTotalActionsType h2
      WHERE h2.HistoriqueTotalSocieteId = h.HistoriqueTotalSocieteId AND h2.Type = N'Action ordinaire'
  );
GO
