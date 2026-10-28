-- Retire les tables de lots DroitsVoteTheorique et DroitsVoteExercable :
-- aucun calcul de l'application n'en dépend (seule dbo.Actions sert au
-- calcul FIFO de la plus-value) — le suivi "qui détient combien de droits
-- de vote" reste disponible via les quantités saisies sur les transactions
-- (NombreDroitVoteTheorique/NombreDroitVoteExercable), sans avoir besoin
-- d'un historique de lots dédié.
--
-- ATTENTION — script destructif : les données existantes de ces deux
-- tables sont perdues. À exécuter seulement après avoir déployé le nouveau
-- code de l'API (qui ne lit/écrit plus ces tables).

USE CalculDesTitres;
GO

DROP TABLE IF EXISTS dbo.DroitsVoteTheorique;
DROP TABLE IF EXISTS dbo.DroitsVoteExercable;
GO
