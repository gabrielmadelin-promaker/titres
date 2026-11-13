-- Une Catégorie peut ne pas entrer dans le total d'actions (dénominateur du
-- % Capital) — ex. des titres sans droit au capital. Vraie (par défaut) pour
-- toutes les Catégories existantes : aucun changement de comportement tant
-- que l'utilisateur ne décoche pas explicitement une Catégorie.
ALTER TABLE dbo.Types ADD
    RentreDansCapital BIT NOT NULL CONSTRAINT DF_Types_RentreDansCapital DEFAULT 1;
GO
