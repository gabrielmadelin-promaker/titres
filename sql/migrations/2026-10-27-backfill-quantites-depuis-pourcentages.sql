-- Convertit, pour les transactions anciennes saisies avant l'introduction
-- des quantités (NombreActions, NombreDroitVoteTheorique,
-- NombreDroitVoteExercable), leur pourcentage historique (Capital,
-- DroitVoteTheorique, DroitVoteExercable) en quantité équivalente :
--     NombreActions = Capital * NombreTotalActions / 100
-- (et pareil pour les deux droits de vote), à condition que la société
-- cible ait son total correspondant renseigné (sinon impossible de
-- convertir : le pourcentage n'a pas de dénominateur, cette transaction
-- reste inchangée, voir le résumé affiché en fin de script).
--
-- But : permettre de retirer définitivement le repli, côté frontend, sur
-- l'ancien pourcentage stocké pour calculer les % affichés (Capital/DV
-- théorique/DV exerçable) — après ce script, TOUTES les transactions dont
-- la conversion était possible ont une quantité, donc le % peut être
-- calculé uniformément (quantité / total de la société) comme pour les
-- transactions saisies depuis l'introduction des quantités. Les colonnes
-- Capital/DroitVoteTheorique/DroitVoteExercable ne sont ensuite plus jamais
-- lues par l'application (elles restent en base, inchangées, à titre
-- d'archive de la saisie d'origine).
--
-- Idempotent : chaque UPDATE est gardé par la quantité correspondante
-- IS NULL, donc ne touche jamais une transaction qui a déjà une quantité
-- (saisie directement, ou déjà convertie par une exécution précédente de
-- ce script) — rejouable sans risque.
--
-- À exécuter après 2026-10-27-backfill-totaux-societes.sql (pour que les
-- totaux de société soient déjà renseignés), et AVANT de ré-exécuter
-- 2026-10-27-initialiser-titres.sql (pour que les transactions désormais
-- quantifiées génèrent bien leurs lots dans Actions/DroitsVoteTheorique/
-- DroitsVoteExercable).

USE CalculDesTitres;
GO

UPDATE t
SET t.NombreActions = t.Capital * s.NombreTotalActions / 100
FROM dbo.Transactions t
JOIN dbo.Societes s ON s.Id = t.CibleId
WHERE t.NombreActions IS NULL
  AND t.Capital IS NOT NULL
  AND s.NombreTotalActions IS NOT NULL;

UPDATE t
SET t.NombreDroitVoteTheorique = t.DroitVoteTheorique * s.NombreTotalDroitVoteTheorique / 100
FROM dbo.Transactions t
JOIN dbo.Societes s ON s.Id = t.CibleId
WHERE t.NombreDroitVoteTheorique IS NULL
  AND t.DroitVoteTheorique IS NOT NULL
  AND s.NombreTotalDroitVoteTheorique IS NOT NULL;

UPDATE t
SET t.NombreDroitVoteExercable = t.DroitVoteExercable * s.NombreTotalDroitVoteExercable / 100
FROM dbo.Transactions t
JOIN dbo.Societes s ON s.Id = t.CibleId
WHERE t.NombreDroitVoteExercable IS NULL
  AND t.DroitVoteExercable IS NOT NULL
  AND s.NombreTotalDroitVoteExercable IS NOT NULL;
GO

-- Résumé : transactions encore non converties (% renseigné, quantité
-- toujours NULL) faute de total sur la société cible — pour ces lignes,
-- le % affiché dans l'application restera vide jusqu'à ce que le total de
-- la société soit renseigné (décision actée : pas de repli alternatif).
SELECT t.Id, t.CibleId, s.Nom AS SocieteCible, t.Capital, t.DroitVoteTheorique, t.DroitVoteExercable
FROM dbo.Transactions t
JOIN dbo.Societes s ON s.Id = t.CibleId
WHERE (t.NombreActions IS NULL AND t.Capital IS NOT NULL)
   OR (t.NombreDroitVoteTheorique IS NULL AND t.DroitVoteTheorique IS NOT NULL)
   OR (t.NombreDroitVoteExercable IS NULL AND t.DroitVoteExercable IS NOT NULL);
GO
