-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.

USE CalculDesTitres;
GO

ALTER TABLE dbo.Societes ADD Principale BIT NOT NULL CONSTRAINT DF_Societes_Principale DEFAULT 0;
GO
