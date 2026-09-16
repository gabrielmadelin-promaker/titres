-- Migration pour une base CalculDesTitres déjà créée (sql/schema.sql exécuté
-- une première fois). À exécuter une seule fois, avec le même compte admin
-- que pour schema.sql.
--
-- Ajoute Transactions.PlusValue, calculée par l'API à chaque création ou
-- modification d'une transaction (jamais saisie) : si NombreActions est
-- négatif (une vente), -NombreActions × (PrixAction de cette transaction −
-- PrixAction de la transaction la plus ancienne enregistrée pour la même
-- société cible) ; sinon 0. Nulle si le prix manque sur l'une des deux
-- transactions concernées.
--
-- Rétro-remplit aussi les transactions déjà en base avec la même formule.

USE CalculDesTitres;
GO

ALTER TABLE dbo.Transactions ADD PlusValue DECIMAL(18,4) NULL;
GO

UPDATE t
SET t.PlusValue = CASE
    WHEN t.NombreActions IS NULL OR t.NombreActions >= 0 THEN 0
    WHEN t.PrixAction IS NULL OR anc.PrixAction IS NULL THEN NULL
    ELSE -t.NombreActions * (t.PrixAction - anc.PrixAction)
END
FROM dbo.Transactions t
OUTER APPLY (
    SELECT TOP 1 t2.PrixAction
    FROM dbo.Transactions t2
    WHERE t2.CibleId = t.CibleId AND t2.Id <> t.Id
    ORDER BY t2.[Date] ASC, t2.Id ASC
) anc;
GO
