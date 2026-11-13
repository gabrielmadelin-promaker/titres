-- Identifiants de place de la société : code ISIN (identifiant international
-- du titre) et code mnémonique (ticker affiché sur le marché).
ALTER TABLE dbo.Societes ADD
    Isin           NVARCHAR(12) NULL,
    CodeMnemonique NVARCHAR(20) NULL;
GO
