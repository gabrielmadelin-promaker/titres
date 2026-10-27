-- Convertit, pour les transactions anciennes saisies avant l'introduction
-- des quantités (NombreActions, NombreDroitVoteTheorique,
-- NombreDroitVoteExercable), leur pourcentage historique (Capital,
-- DroitVoteTheorique, DroitVoteExercable) en quantité équivalente :
--     NombreActions = Capital * (total de la société cible À LA DATE DE LA TRANSACTION) / 100
-- (et pareil pour les deux droits de vote) — le total applicable est celui
-- de dbo.HistoriqueTotauxSociete, ligne la plus récente dont DateEffet <=
-- [Date] de la transaction (voir 2026-10-27-historique-totaux-societe.sql,
-- À EXÉCUTER AVANT CELUI-CI). Si aucune ligne ne couvre cette date (ou que
-- le total y est NULL), impossible de convertir : la transaction reste
-- inchangée, voir le résumé affiché en fin de script.
--
-- But : permettre de retirer définitivement le repli, côté frontend, sur
-- l'ancien pourcentage stocké pour calculer les % affichés (Capital/DV
-- théorique/DV exerçable) — après ce script, TOUTES les transactions dont
-- la conversion était possible ont une quantité, donc le % peut être
-- calculé uniformément (quantité / total en vigueur à la date de la
-- transaction) comme pour les transactions saisies depuis l'introduction
-- des quantités. Les colonnes Capital/DroitVoteTheorique/DroitVoteExercable
-- ne sont ensuite plus jamais lues par l'application (voir
-- 2026-10-27-retirer-colonnes-pourcentage-legacy.sql pour les retirer
-- définitivement, une fois ce script vérifié et le nouveau code déployé).
--
-- Idempotent : chaque UPDATE est gardé par la quantité correspondante
-- IS NULL, donc ne touche jamais une transaction qui a déjà une quantité
-- (saisie directement, ou déjà convertie par une exécution précédente de
-- ce script) — rejouable sans risque.
--
-- À exécuter après 2026-10-27-historique-totaux-societe.sql, et AVANT de
-- ré-exécuter 2026-10-27-initialiser-titres.sql (pour que les transactions
-- désormais quantifiées génèrent bien leurs lots dans Actions/
-- DroitsVoteTheorique/DroitsVoteExercable).

USE CalculDesTitres;
GO

-- Le total applicable à une transaction (fonction inline, réutilisée pour
-- les 3 notions) : ligne la plus récente de l'historique dont DateEffet <=
-- la date de la transaction.
UPDATE t
SET t.NombreActions = t.Capital * h.NombreTotalActions / 100
FROM dbo.Transactions t
CROSS APPLY (
    SELECT TOP 1 NombreTotalActions
    FROM dbo.HistoriqueTotauxSociete
    WHERE SocieteId = t.CibleId AND DateEffet <= t.[Date]
    ORDER BY DateEffet DESC
) h
WHERE t.NombreActions IS NULL
  AND t.Capital IS NOT NULL
  AND h.NombreTotalActions IS NOT NULL;

UPDATE t
SET t.NombreDroitVoteTheorique = t.DroitVoteTheorique * h.NombreTotalDroitVoteTheorique / 100
FROM dbo.Transactions t
CROSS APPLY (
    SELECT TOP 1 NombreTotalDroitVoteTheorique
    FROM dbo.HistoriqueTotauxSociete
    WHERE SocieteId = t.CibleId AND DateEffet <= t.[Date]
    ORDER BY DateEffet DESC
) h
WHERE t.NombreDroitVoteTheorique IS NULL
  AND t.DroitVoteTheorique IS NOT NULL
  AND h.NombreTotalDroitVoteTheorique IS NOT NULL;

UPDATE t
SET t.NombreDroitVoteExercable = t.DroitVoteExercable * h.NombreTotalDroitVoteExercable / 100
FROM dbo.Transactions t
CROSS APPLY (
    SELECT TOP 1 NombreTotalDroitVoteExercable
    FROM dbo.HistoriqueTotauxSociete
    WHERE SocieteId = t.CibleId AND DateEffet <= t.[Date]
    ORDER BY DateEffet DESC
) h
WHERE t.NombreDroitVoteExercable IS NULL
  AND t.DroitVoteExercable IS NOT NULL
  AND h.NombreTotalDroitVoteExercable IS NOT NULL;
GO

-- Résumé : transactions encore non converties (% renseigné, quantité
-- toujours NULL) faute de total connu à leur date — pour ces lignes, le %
-- affiché dans l'application restera vide jusqu'à ce qu'une ligne
-- d'historique couvrant leur date soit ajoutée (décision actée : pas de
-- repli alternatif).
SELECT t.Id, t.CibleId, s.Nom AS SocieteCible, t.[Date], t.Capital, t.DroitVoteTheorique, t.DroitVoteExercable
FROM dbo.Transactions t
JOIN dbo.Societes s ON s.Id = t.CibleId
WHERE (t.NombreActions IS NULL AND t.Capital IS NOT NULL)
   OR (t.NombreDroitVoteTheorique IS NULL AND t.DroitVoteTheorique IS NOT NULL)
   OR (t.NombreDroitVoteExercable IS NULL AND t.DroitVoteExercable IS NOT NULL);
GO
