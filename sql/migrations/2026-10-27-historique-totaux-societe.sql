-- Introduit l'historique des totaux émis par société (nombre total
-- d'actions / de droits de vote théorique / de droits de vote exerçable),
-- pour remplacer l'unique valeur actuelle stockée sur Societes.
--
-- But : une augmentation ou réduction de capital ultérieure (ouverture de
-- capital, par exemple) change le total à partir d'une certaine date, mais
-- ne doit JAMAIS changer le pourcentage calculé pour une transaction
-- passée — cette transaction doit rester rapportée au total qui était en
-- vigueur à SA date, pas au total d'aujourd'hui. D'où une ligne par
-- changement de total, avec une date d'effet, plutôt qu'une colonne unique
-- sur Societes.
--
-- Étape 1/2 : crée la table et y recopie la valeur actuelle de chaque
-- société comme une ligne "depuis toujours" (DateEffet au 1er janvier 1900,
-- antérieure à toute transaction réelle) — pour ne rien changer au résultat
-- des % déjà affichés. Les colonnes Societes.NombreTotalActions/
-- NombreTotalDroitVoteTheorique/NombreTotalDroitVoteExercable ne sont PAS
-- supprimées par ce script (voir 2026-10-27-retirer-colonnes-pourcentage-legacy.sql,
-- à exécuter seulement une fois le nouveau code de l'API déployé et ce
-- script-ci vérifié).
--
-- Idempotent : protégé par IF NOT EXISTS, ne duplique pas la ligne baseline
-- si le script est rejoué.

USE CalculDesTitres;
GO

CREATE TABLE dbo.HistoriqueTotauxSociete (
    Id                             UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_HistoriqueTotauxSociete PRIMARY KEY DEFAULT NEWID(),
    SocieteId                      UNIQUEIDENTIFIER NOT NULL,
    DateEffet                      DATE             NOT NULL,
    NombreTotalActions             DECIMAL(18,4)    NULL,
    NombreTotalDroitVoteTheorique  DECIMAL(18,4)    NULL,
    NombreTotalDroitVoteExercable  DECIMAL(18,4)    NULL,
    CONSTRAINT UQ_HistoriqueTotauxSociete_SocieteDate UNIQUE (SocieteId, DateEffet)
);
GO
CREATE INDEX IX_HistoriqueTotauxSociete_SocieteId ON dbo.HistoriqueTotauxSociete (SocieteId);
GO

-- Étape 2/2 : une ligne baseline par société ayant au moins un total
-- renseigné, avec les valeurs actuelles.
INSERT INTO dbo.HistoriqueTotauxSociete (SocieteId, DateEffet, NombreTotalActions, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable)
SELECT Id, '1900-01-01', NombreTotalActions, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable
FROM dbo.Societes s
WHERE (NombreTotalActions IS NOT NULL OR NombreTotalDroitVoteTheorique IS NOT NULL OR NombreTotalDroitVoteExercable IS NOT NULL)
  AND NOT EXISTS (
      SELECT 1 FROM dbo.HistoriqueTotauxSociete h WHERE h.SocieteId = s.Id AND h.DateEffet = '1900-01-01'
  );
GO

-- Résumé.
SELECT s.Nom, h.DateEffet, h.NombreTotalActions, h.NombreTotalDroitVoteTheorique, h.NombreTotalDroitVoteExercable
FROM dbo.HistoriqueTotauxSociete h
JOIN dbo.Societes s ON s.Id = h.SocieteId
ORDER BY s.Nom, h.DateEffet;
GO
