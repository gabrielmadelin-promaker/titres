-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- Authentification temporaire (en attendant le SSO) : email + mot de passe
-- à 10 caractères généré par l'API et stocké EN CLAIR (volontairement, le
-- temps du SSO — un administrateur le relit depuis l'écran "Utilisateurs"
-- pour le communiquer). Un rôle (DSI / Direction des titres) est enregistré
-- mais ne restreint encore aucune action.
--
-- Sessions : un jeton opaque (GUID) par connexion, valable 30 jours,
-- vérifié par l'API à chaque appel (hors /api/health et /api/auth/login).

USE CalculDesTitres;
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

-- ---------------------------------------------------------------------
-- Amorçage : toute l'application est désormais derrière la connexion, donc
-- il faut un premier compte pour pouvoir se connecter et en créer d'autres
-- depuis l'écran "Utilisateurs". Remplacez l'email ci-dessous PUIS
-- décommentez ce bloc avant de l'exécuter (une seule fois).
-- ---------------------------------------------------------------------
/*
DECLARE @Caracteres NVARCHAR(62) = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
DECLARE @MotDePasse NVARCHAR(10) = '';
DECLARE @i INT = 0;
WHILE @i < 10
BEGIN
    SET @MotDePasse = @MotDePasse + SUBSTRING(@Caracteres, CAST(RAND(CHECKSUM(NEWID())) * LEN(@Caracteres) + 1 AS INT), 1);
    SET @i += 1;
END;

INSERT INTO dbo.Utilisateurs (Email, MotDePasse, Role)
VALUES ('remplacez-moi@bollore.com', @MotDePasse, 'DSI');

SELECT Email, MotDePasse, Role FROM dbo.Utilisateurs WHERE Email = 'remplacez-moi@bollore.com';
*/
GO
