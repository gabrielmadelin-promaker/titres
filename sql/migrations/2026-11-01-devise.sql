-- Ajoute une devise à la Valeur nominale d'une société et au Prix de
-- l'action d'une transaction (jusqu'ici toujours implicitement en euros).
-- Les lignes existantes sont initialisées à EUR par le DEFAULT.

ALTER TABLE dbo.Societes ADD Devise NVARCHAR(3) NOT NULL CONSTRAINT DF_Societes_Devise DEFAULT 'EUR';

ALTER TABLE dbo.Transactions ADD Devise NVARCHAR(3) NOT NULL CONSTRAINT DF_Transactions_Devise DEFAULT 'EUR';
