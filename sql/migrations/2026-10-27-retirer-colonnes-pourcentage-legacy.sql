-- Retire définitivement les colonnes de pourcentage qui ne sont plus
-- jamais lues ni écrites par l'application :
--   - dbo.Societes.NombreTotalActions / NombreTotalDroitVoteTheorique /
--     NombreTotalDroitVoteExercable (remplacées par l'historique daté,
--     voir dbo.HistoriqueTotauxSociete et 2026-10-27-historique-totaux-societe.sql)
--   - dbo.Transactions.Capital / DroitVoteTheorique / DroitVoteExercable
--     (remplacées par un calcul dérivé des quantités, voir
--     2026-10-27-backfill-quantites-depuis-pourcentages.sql)
--
-- ATTENTION — script destructif, à exécuter seulement après avoir, DANS
-- CET ORDRE :
--   1. exécuté 2026-10-27-historique-totaux-societe.sql ;
--   2. exécuté (ou re-exécuté) 2026-10-27-backfill-quantites-depuis-pourcentages.sql
--      et vérifié que son résumé final ne liste plus de transaction à
--      convertir (ou accepté que les lignes encore listées perdent
--      définitivement leur % affiché, faute de total connu à leur date) ;
--   3. déployé le nouveau code de l'API (qui ne lit/écrit plus ces
--      colonnes) et du frontend.
-- Une fois ces colonnes supprimées, revenir en arrière demande de
-- restaurer une sauvegarde de la base — pas de bouton "annuler".

USE CalculDesTitres;
GO

ALTER TABLE dbo.Societes DROP COLUMN NombreTotalActions, NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable;
GO

ALTER TABLE dbo.Transactions DROP CONSTRAINT CK_Transactions_DVTheorique, CK_Transactions_DVExercable;
ALTER TABLE dbo.Transactions DROP COLUMN Capital, DroitVoteTheorique, DroitVoteExercable;
GO
