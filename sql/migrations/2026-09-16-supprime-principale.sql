-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- Retire Societes.Principale : ce champ, réservé à une intervention directe
-- en base (aucun écran ne permettait de le passer à 1), n'était en pratique
-- jamais utilisé. L'organigramme (organigramme.ts) ne s'appuie plus dessus.

USE CalculDesTitres;
GO

-- La colonne a un DEFAULT (0) non nommé explicitement dans schema.sql : SQL
-- Server lui a donc attribué un nom généré automatiquement (variable d'une
-- installation à l'autre), qu'il faut retrouver et supprimer avant de
-- pouvoir supprimer la colonne elle-même (DROP COLUMN échoue sinon).
DECLARE @NomContrainte NVARCHAR(200);
SELECT @NomContrainte = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Societes') AND c.name = 'Principale';

IF @NomContrainte IS NOT NULL
    EXEC('ALTER TABLE dbo.Societes DROP CONSTRAINT ' + @NomContrainte);
GO

ALTER TABLE dbo.Societes DROP COLUMN Principale;
GO
