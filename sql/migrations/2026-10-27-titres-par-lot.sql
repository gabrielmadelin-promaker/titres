-- Bascule du suivi des titres d'une ligne par titre UNITAIRE vers une
-- ligne par LOT (regroupement de titres acquis ensemble : même société
-- émettrice, même catégorie, même détenteur, mêmes prix et date
-- d'acquisition), avec un nombre Quantite sur chaque ligne au lieu d'une
-- ligne par titre.
--
-- Raison : une transaction portant sur un grand nombre de titres (ou une
-- valeur aberrante par erreur de saisie) générait autant de lignes que de
-- titres, ce qui pouvait littéralement saturer le disque. En lot, le
-- nombre de lignes est proportionnel au nombre de transactions, pas au
-- nombre de titres — un lot de 2 milliards de titres tient toujours sur
-- UNE seule ligne.
--
-- À exécuter après 2026-10-27-titres-et-quantites.sql. Remplace l'usage
-- de 2026-10-27-initialiser-titres.sql (ancienne version, unitaire) par
-- la nouvelle version (même nom de fichier, mise à jour) qui génère
-- désormais des lots.

USE CalculDesTitres;
GO

-- Tables générées automatiquement, jamais saisies à la main : on les vide
-- par précaution avant d'ajouter une colonne NOT NULL, pour ne pas avoir
-- à choisir une valeur de repli arbitraire pour d'éventuelles lignes déjà
-- présentes (notamment celles issues d'une exécution précédente, unitaire,
-- du script d'initialisation).
DELETE FROM dbo.Actions;
DELETE FROM dbo.DroitsVoteTheorique;
DELETE FROM dbo.DroitsVoteExercable;
GO

ALTER TABLE dbo.Actions ADD Quantite DECIMAL(18,4) NOT NULL;
ALTER TABLE dbo.DroitsVoteTheorique ADD Quantite DECIMAL(18,4) NOT NULL;
ALTER TABLE dbo.DroitsVoteExercable ADD Quantite DECIMAL(18,4) NOT NULL;
GO
