-- La Valeur nominale n'est plus un champ unique sur la société : elle
-- devient propre à chaque Catégorie, historisée par date d'effet comme les
-- quantités (dbo.HistoriqueTotalActionsType) — une société n'a en revanche
-- qu'une seule Devise par date d'effet, portée par la ligne parente
-- (dbo.HistoriqueTotauxSociete), pour éviter un sélecteur de devise par
-- Catégorie alors qu'une société n'émet pas ses classes d'actions dans des
-- devises différentes en pratique.
ALTER TABLE dbo.HistoriqueTotalActionsType ADD
    ValeurNominale DECIMAL(18,4) NULL;
GO

ALTER TABLE dbo.HistoriqueTotauxSociete ADD
    Devise NVARCHAR(3) NOT NULL CONSTRAINT DF_HistoriqueTotauxSociete_Devise DEFAULT 'EUR';
GO

-- Reprise au mieux des valeurs existantes : copie la Valeur nominale/Devise
-- de chaque société sur toutes ses lignes de Totaux déjà saisies. Une
-- société sans ligne de Totaux perd sa valeur (rien où la mettre) — à
-- ressaisir une fois via l'écran Totaux si besoin.
UPDATE hpt
SET hpt.ValeurNominale = s.ValeurNominale
FROM dbo.HistoriqueTotalActionsType hpt
JOIN dbo.HistoriqueTotauxSociete h ON h.Id = hpt.HistoriqueTotalSocieteId
JOIN dbo.Societes s ON s.Id = h.SocieteId
WHERE s.ValeurNominale IS NOT NULL;
GO

UPDATE h
SET h.Devise = s.Devise
FROM dbo.HistoriqueTotauxSociete h
JOIN dbo.Societes s ON s.Id = h.SocieteId
WHERE s.ValeurNominale IS NOT NULL;
GO

ALTER TABLE dbo.Societes DROP CONSTRAINT DF_Societes_Devise;
GO
ALTER TABLE dbo.Societes DROP COLUMN ValeurNominale, Devise;
GO
