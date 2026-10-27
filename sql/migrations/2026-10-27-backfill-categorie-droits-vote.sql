-- Backfill ponctuel des transactions déjà en base (optionnel, à exécuter
-- une seule fois, après 2026-10-27-titres-et-quantites.sql) :
--
-- 1. Attribue une catégorie aléatoire (A, B ou C) à chaque transaction qui
--    n'en a pas — la catégorie réelle n'étant pas connue pour les
--    transactions déjà saisies, ce tirage sert uniquement à peupler
--    l'onglet "Titres" avec des données variées plutôt que de laisser le
--    champ vide. À corriger manuellement par la suite si la vraie
--    catégorie est connue.
-- 2. Complète le nombre de droits de vote théorique/exerçable des
--    transactions qui ont un nombre d'actions mais pas encore de nombre de
--    droits de vote, en supposant 1 action = 1 droit de vote théorique = 1
--    droit de vote exerçable (cas le plus courant). Hypothèse
--    simplificatrice : à corriger manuellement, transaction par
--    transaction, pour les sociétés qui ont des actions à droit de vote
--    double, suspendu, etc.
--
-- Script idempotent : ne touche que les colonnes encore NULL, peut être
-- rejoué sans effet sur les lignes déjà renseignées (mais rejouer ne
-- regénère PAS une nouvelle catégorie aléatoire pour une ligne qui en a
-- déjà une).
--
-- N'affecte pas les tables Actions/DroitsVoteTheorique/DroitsVoteExercable
-- elles-mêmes : pour les (re)générer à partir de l'historique des
-- transactions (y compris les catégories et nombres complétés par ce
-- script), utilisez le bouton "Initialiser depuis les transactions" dans
-- l'onglet Titres, une fois ce script exécuté et le nouveau build de l'API
-- déployé.

USE CalculDesTitres;
GO

UPDATE dbo.Transactions
SET Categorie = CASE ABS(CHECKSUM(NEWID())) % 3
    WHEN 0 THEN 'A'
    WHEN 1 THEN 'B'
    ELSE 'C'
END
WHERE Categorie IS NULL;
GO

UPDATE dbo.Transactions
SET NombreDroitVoteTheorique = NombreActions
WHERE NombreDroitVoteTheorique IS NULL AND NombreActions IS NOT NULL;
GO

UPDATE dbo.Transactions
SET NombreDroitVoteExercable = NombreActions
WHERE NombreDroitVoteExercable IS NULL AND NombreActions IS NOT NULL;
GO
