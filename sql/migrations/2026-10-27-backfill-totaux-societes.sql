-- Backfill ponctuel (optionnel, à exécuter une seule fois) : complète les
-- totaux de droits de vote théorique/exerçable des sociétés qui ont un
-- nombre total d'actions renseigné mais pas (encore) de total de droits de
-- vote, en supposant 1 action = 1 droit de vote théorique = 1 droit de
-- vote exerçable (cas le plus courant). Hypothèse simplificatrice : à
-- corriger manuellement, société par société, pour celles qui ont des
-- actions à droit de vote double, suspendu, etc.
--
-- Sans effet sur une société dont le nombre total d'actions n'est pas
-- (encore) renseigné : rien à en déduire dans ce cas.
--
-- Script idempotent : ne touche que les colonnes encore NULL, peut être
-- rejoué sans écraser une valeur déjà renseignée.

USE CalculDesTitres;
GO

UPDATE dbo.Societes
SET NombreTotalDroitVoteTheorique = NombreTotalActions
WHERE NombreTotalDroitVoteTheorique IS NULL AND NombreTotalActions IS NOT NULL;
GO

UPDATE dbo.Societes
SET NombreTotalDroitVoteExercable = NombreTotalActions
WHERE NombreTotalDroitVoteExercable IS NULL AND NombreTotalActions IS NOT NULL;
GO
