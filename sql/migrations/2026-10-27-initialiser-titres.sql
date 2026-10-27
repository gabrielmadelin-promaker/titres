-- Script d'initialisation de la base de titres (dbo.Actions,
-- dbo.DroitsVoteTheorique, dbo.DroitsVoteExercable) à partir de
-- l'historique des transactions déjà en base — version PAR LOT (une ligne
-- par lot acquis ensemble, avec un nombre Quantite), à exécuter après
-- 2026-10-27-titres-par-lot.sql.
--
-- Principe : pour chaque transaction, dans l'ordre chronologique, le camp
-- qui perd des titres (vente, ou le vendeur d'une cession interne au
-- groupe) consomme ses lots existants du plus ancien au plus récent
-- (FIFO par date d'acquisition) — un lot entièrement consommé est
-- supprimé, un lot partiellement consommé voit juste sa Quantite réduite
-- — puis le camp qui gagne reçoit UN SEUL nouveau lot (Quantite = la
-- quantité de la transaction), avec le prix d'origine moyen (pondéré) des
-- lots consommés reporté dessus s'il s'agit d'une cession interne. Même
-- logique que la synchronisation automatique de l'API (fonction
-- SynchroniserTitresMetrique/ConsommerLots/CreerLot dans
-- server/TitresApi/Program.cs), rejouée ici une transaction à la fois.
--
-- Recalcule aussi, pour CHAQUE transaction existante (pas seulement celles
-- créées/modifiées après ce script), sa colonne PlusValue — avec la même
-- règle FIFO que l'API (CalculerPlusValue) : nécessaire parce que
-- redéployer l'API ne recalcule jamais rétroactivement les transactions
-- déjà en base, seulement celles créées ou modifiées ensuite.
--
-- Par lot plutôt que par titre unitaire : une transaction (même avec une
-- quantité très élevée, y compris une valeur aberrante par erreur de
-- saisie) ne crée jamais plus d'UNE ligne par table — le nombre de lignes
-- est borné par le nombre de transactions, jamais par le nombre de
-- titres. Contrairement à la version précédente de ce script (une ligne
-- par titre), pas besoin de garde-fou sur la quantité : même plusieurs
-- milliards de titres sur une seule transaction restent une seule ligne.
--
-- Écrit sans SQL dynamique (une procédure stockée temporaire par table,
-- avec des paramètres typés classiques — pas de sp_executesql).
--
-- Script destructif et idempotent à la fois : il commence par VIDER les 3
-- tables, puis les reconstruit entièrement à partir de zéro — peut être
-- rejoué autant de fois que nécessaire (par exemple après une correction
-- de données sur une transaction), toujours avec un résultat cohérent.
-- Sans aucun effet sur la table Transactions elle-même.
--
-- À exécuter après 2026-10-27-titres-et-quantites.sql,
-- 2026-10-27-backfill-categorie-droits-vote.sql,
-- 2026-10-27-backfill-totaux-societes.sql et 2026-10-27-titres-par-lot.sql.
--
-- Limite héritée de la synchronisation automatique de l'API : si une
-- transaction est ensuite modifiée ou supprimée depuis l'application, elle
-- ne peut retirer que le lot qu'elle avait elle-même créé (via
-- TransactionOrigineId), pas restituer les lots qu'elle avait consommés
-- côté perdant — rejouer ce script entièrement reconstruit alors un état
-- cohérent si besoin.
--
-- ATTENTION : script non testé en conditions réelles (pas d'instance SQL
-- Server disponible pour le vérifier avant de vous le fournir). En cas
-- d'erreur en cours d'exécution, il suffit de relancer le script entier
-- depuis le début : il repart toujours de zéro (DELETE initial), pas
-- besoin de nettoyer quoi que ce soit à la main avant de rejouer.

USE CalculDesTitres;
GO

DELETE FROM dbo.Actions;
DELETE FROM dbo.DroitsVoteTheorique;
DELETE FROM dbo.DroitsVoteExercable;
GO

-- Procédures temporaires locales (portée à cette seule session/connexion,
-- disparaissent automatiquement à la fin ; aussi explicitement supprimées
-- plus bas) : consomme @Qte titres chez un détenteur, lot par lot, du plus
-- ancien au plus récent, et renvoie le prix d'origine moyen pondéré des
-- titres consommés. Une procédure par table (pas de SQL dynamique).

CREATE PROCEDURE #ConsommerLotsActions
    @CibleId UNIQUEIDENTIFIER, @Categorie NVARCHAR(10), @DetenteurId UNIQUEIDENTIFIER, @DetenteurNomExterne NVARCHAR(300),
    @Qte DECIMAL(18,4), @PrixReporte DECIMAL(18,4) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @PrixReporte = NULL;
    DECLARE @Restant DECIMAL(18,4) = @Qte;
    DECLARE @SommePrixPondere DECIMAL(38,4) = 0;
    DECLARE @SommeQuantiteConsommee DECIMAL(18,4) = 0;
    DECLARE @LotId UNIQUEIDENTIFIER, @LotQuantite DECIMAL(18,4), @LotPrixInitial DECIMAL(18,4), @Consomme DECIMAL(18,4);

    DECLARE curseurLots CURSOR LOCAL FAST_FORWARD FOR
        SELECT Id, Quantite, PrixInitial FROM dbo.Actions
        WHERE SocieteEmettriceId = @CibleId
          AND ((@DetenteurId IS NOT NULL AND SocieteDetentriceId = @DetenteurId) OR (@DetenteurId IS NULL AND DetenteurNomExterne = @DetenteurNomExterne))
          AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
        ORDER BY DateAcquisition ASC, Id ASC;

    OPEN curseurLots;
    FETCH NEXT FROM curseurLots INTO @LotId, @LotQuantite, @LotPrixInitial;
    WHILE @@FETCH_STATUS = 0 AND @Restant > 0
    BEGIN
        SET @Consomme = CASE WHEN @LotQuantite < @Restant THEN @LotQuantite ELSE @Restant END;
        IF @LotPrixInitial IS NOT NULL
        BEGIN
            SET @SommePrixPondere = @SommePrixPondere + @LotPrixInitial * @Consomme;
            SET @SommeQuantiteConsommee = @SommeQuantiteConsommee + @Consomme;
        END

        IF @Consomme >= @LotQuantite
            DELETE FROM dbo.Actions WHERE Id = @LotId;
        ELSE
            UPDATE dbo.Actions SET Quantite = Quantite - @Consomme WHERE Id = @LotId;

        SET @Restant = @Restant - @Consomme;
        FETCH NEXT FROM curseurLots INTO @LotId, @LotQuantite, @LotPrixInitial;
    END
    CLOSE curseurLots;
    DEALLOCATE curseurLots;

    IF @SommeQuantiteConsommee > 0
        SET @PrixReporte = @SommePrixPondere / @SommeQuantiteConsommee;
END
GO

CREATE PROCEDURE #ConsommerLotsDroitsVoteTheorique
    @CibleId UNIQUEIDENTIFIER, @Categorie NVARCHAR(10), @DetenteurId UNIQUEIDENTIFIER, @DetenteurNomExterne NVARCHAR(300),
    @Qte DECIMAL(18,4), @PrixReporte DECIMAL(18,4) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @PrixReporte = NULL;
    DECLARE @Restant DECIMAL(18,4) = @Qte;
    DECLARE @SommePrixPondere DECIMAL(38,4) = 0;
    DECLARE @SommeQuantiteConsommee DECIMAL(18,4) = 0;
    DECLARE @LotId UNIQUEIDENTIFIER, @LotQuantite DECIMAL(18,4), @LotPrixInitial DECIMAL(18,4), @Consomme DECIMAL(18,4);

    DECLARE curseurLots CURSOR LOCAL FAST_FORWARD FOR
        SELECT Id, Quantite, PrixInitial FROM dbo.DroitsVoteTheorique
        WHERE SocieteEmettriceId = @CibleId
          AND ((@DetenteurId IS NOT NULL AND SocieteDetentriceId = @DetenteurId) OR (@DetenteurId IS NULL AND DetenteurNomExterne = @DetenteurNomExterne))
          AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
        ORDER BY DateAcquisition ASC, Id ASC;

    OPEN curseurLots;
    FETCH NEXT FROM curseurLots INTO @LotId, @LotQuantite, @LotPrixInitial;
    WHILE @@FETCH_STATUS = 0 AND @Restant > 0
    BEGIN
        SET @Consomme = CASE WHEN @LotQuantite < @Restant THEN @LotQuantite ELSE @Restant END;
        IF @LotPrixInitial IS NOT NULL
        BEGIN
            SET @SommePrixPondere = @SommePrixPondere + @LotPrixInitial * @Consomme;
            SET @SommeQuantiteConsommee = @SommeQuantiteConsommee + @Consomme;
        END

        IF @Consomme >= @LotQuantite
            DELETE FROM dbo.DroitsVoteTheorique WHERE Id = @LotId;
        ELSE
            UPDATE dbo.DroitsVoteTheorique SET Quantite = Quantite - @Consomme WHERE Id = @LotId;

        SET @Restant = @Restant - @Consomme;
        FETCH NEXT FROM curseurLots INTO @LotId, @LotQuantite, @LotPrixInitial;
    END
    CLOSE curseurLots;
    DEALLOCATE curseurLots;

    IF @SommeQuantiteConsommee > 0
        SET @PrixReporte = @SommePrixPondere / @SommeQuantiteConsommee;
END
GO

CREATE PROCEDURE #ConsommerLotsDroitsVoteExercable
    @CibleId UNIQUEIDENTIFIER, @Categorie NVARCHAR(10), @DetenteurId UNIQUEIDENTIFIER, @DetenteurNomExterne NVARCHAR(300),
    @Qte DECIMAL(18,4), @PrixReporte DECIMAL(18,4) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @PrixReporte = NULL;
    DECLARE @Restant DECIMAL(18,4) = @Qte;
    DECLARE @SommePrixPondere DECIMAL(38,4) = 0;
    DECLARE @SommeQuantiteConsommee DECIMAL(18,4) = 0;
    DECLARE @LotId UNIQUEIDENTIFIER, @LotQuantite DECIMAL(18,4), @LotPrixInitial DECIMAL(18,4), @Consomme DECIMAL(18,4);

    DECLARE curseurLots CURSOR LOCAL FAST_FORWARD FOR
        SELECT Id, Quantite, PrixInitial FROM dbo.DroitsVoteExercable
        WHERE SocieteEmettriceId = @CibleId
          AND ((@DetenteurId IS NOT NULL AND SocieteDetentriceId = @DetenteurId) OR (@DetenteurId IS NULL AND DetenteurNomExterne = @DetenteurNomExterne))
          AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
        ORDER BY DateAcquisition ASC, Id ASC;

    OPEN curseurLots;
    FETCH NEXT FROM curseurLots INTO @LotId, @LotQuantite, @LotPrixInitial;
    WHILE @@FETCH_STATUS = 0 AND @Restant > 0
    BEGIN
        SET @Consomme = CASE WHEN @LotQuantite < @Restant THEN @LotQuantite ELSE @Restant END;
        IF @LotPrixInitial IS NOT NULL
        BEGIN
            SET @SommePrixPondere = @SommePrixPondere + @LotPrixInitial * @Consomme;
            SET @SommeQuantiteConsommee = @SommeQuantiteConsommee + @Consomme;
        END

        IF @Consomme >= @LotQuantite
            DELETE FROM dbo.DroitsVoteExercable WHERE Id = @LotId;
        ELSE
            UPDATE dbo.DroitsVoteExercable SET Quantite = Quantite - @Consomme WHERE Id = @LotId;

        SET @Restant = @Restant - @Consomme;
        FETCH NEXT FROM curseurLots INTO @LotId, @LotQuantite, @LotPrixInitial;
    END
    CLOSE curseurLots;
    DEALLOCATE curseurLots;

    IF @SommeQuantiteConsommee > 0
        SET @PrixReporte = @SommePrixPondere / @SommeQuantiteConsommee;
END
GO

-- Parcourt toutes les transactions, dans l'ordre chronologique, et
-- applique la logique ci-dessus pour les 3 notions à chaque fois.
DECLARE @TransactionId UNIQUEIDENTIFIER, @AcheteurId UNIQUEIDENTIFIER, @AcheteurNomExterne NVARCHAR(300),
        @CibleId UNIQUEIDENTIFIER, @Date DATE, @NombreActions DECIMAL(18,4), @NombreDroitVoteTheorique DECIMAL(18,4),
        @NombreDroitVoteExercable DECIMAL(18,4), @Categorie NVARCHAR(10), @VendeurId UNIQUEIDENTIFIER,
        @VendeurNomExterne NVARCHAR(300), @PrixAction DECIMAL(18,4);

DECLARE @VendeurRenseigne BIT, @AcheteurEgalVendeur BIT;
DECLARE @Qte DECIMAL(18,4), @PrixReporte DECIMAL(18,4), @PlusValue DECIMAL(18,4);

DECLARE curseurTransactions CURSOR LOCAL FAST_FORWARD FOR
    SELECT Id, AcheteurId, AcheteurNomExterne, CibleId, [Date], NombreActions, NombreDroitVoteTheorique,
           NombreDroitVoteExercable, Categorie, VendeurId, VendeurNomExterne, PrixAction
    FROM dbo.Transactions
    ORDER BY [Date] ASC, Id ASC;

OPEN curseurTransactions;
FETCH NEXT FROM curseurTransactions INTO @TransactionId, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date,
    @NombreActions, @NombreDroitVoteTheorique, @NombreDroitVoteExercable, @Categorie, @VendeurId, @VendeurNomExterne, @PrixAction;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @VendeurRenseigne = CASE WHEN @VendeurId IS NOT NULL OR @VendeurNomExterne IS NOT NULL THEN 1 ELSE 0 END;
    -- Acheteur == vendeur : rien à faire pour cette transaction (cas déjà écarté à la saisie, par précaution).
    SET @AcheteurEgalVendeur = CASE WHEN @VendeurId IS NOT NULL AND @AcheteurId IS NOT NULL AND @VendeurId = @AcheteurId THEN 1 ELSE 0 END;
    -- PlusValue : recalculée pour TOUTE transaction existante (pas seulement
    -- celles créées/modifiées après ce script), avec la même règle FIFO que
    -- l'API : |NombreActions| x (PrixAction - prix d'origine moyen des
    -- titres Actions consommés par cette transaction) ; NULL si aucun titre
    -- n'a été consommé (achat externe pur, pas de prix d'origine connu).
    SET @PlusValue = NULL;

    -- ========================= Actions =========================
    IF @AcheteurEgalVendeur = 0 AND @NombreActions IS NOT NULL AND @NombreActions <> 0
    BEGIN
        IF @NombreActions < 0
        BEGIN
            -- Vente : l'acheteur de la transaction est le camp qui PERD des titres.
            SET @Qte = -@NombreActions;
            EXEC #ConsommerLotsActions @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, @Qte, @PrixReporte OUTPUT;
            IF @VendeurRenseigne = 1
            BEGIN
                INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                VALUES (NEWID(), @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, @Qte, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId);
            END
            IF @PrixReporte IS NOT NULL AND @PrixAction IS NOT NULL
                SET @PlusValue = @Qte * (@PrixAction - @PrixReporte);
        END
        ELSE
        BEGIN
            -- Achat : l'acheteur GAGNE des titres ; si un vendeur suivi est renseigné, il les perd d'abord.
            SET @Qte = @NombreActions;
            SET @PrixReporte = NULL;
            IF @VendeurRenseigne = 1
                EXEC #ConsommerLotsActions @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, @Qte, @PrixReporte OUTPUT;

            INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            VALUES (NEWID(), @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, @Qte, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId);

            IF @PrixReporte IS NOT NULL AND @PrixAction IS NOT NULL
                SET @PlusValue = @Qte * (@PrixAction - @PrixReporte);
        END
    END

    UPDATE dbo.Transactions SET PlusValue = @PlusValue WHERE Id = @TransactionId;

    -- ==================== DroitsVoteTheorique ====================
    IF @AcheteurEgalVendeur = 0 AND @NombreDroitVoteTheorique IS NOT NULL AND @NombreDroitVoteTheorique <> 0
    BEGIN
        IF @NombreDroitVoteTheorique < 0
        BEGIN
            SET @Qte = -@NombreDroitVoteTheorique;
            EXEC #ConsommerLotsDroitsVoteTheorique @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, @Qte, @PrixReporte OUTPUT;
            IF @VendeurRenseigne = 1
            BEGIN
                INSERT INTO dbo.DroitsVoteTheorique (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                VALUES (NEWID(), @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, @Qte, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId);
            END
        END
        ELSE
        BEGIN
            SET @Qte = @NombreDroitVoteTheorique;
            SET @PrixReporte = NULL;
            IF @VendeurRenseigne = 1
                EXEC #ConsommerLotsDroitsVoteTheorique @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, @Qte, @PrixReporte OUTPUT;

            INSERT INTO dbo.DroitsVoteTheorique (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            VALUES (NEWID(), @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, @Qte, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId);
        END
    END

    -- ==================== DroitsVoteExercable ====================
    IF @AcheteurEgalVendeur = 0 AND @NombreDroitVoteExercable IS NOT NULL AND @NombreDroitVoteExercable <> 0
    BEGIN
        IF @NombreDroitVoteExercable < 0
        BEGIN
            SET @Qte = -@NombreDroitVoteExercable;
            EXEC #ConsommerLotsDroitsVoteExercable @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, @Qte, @PrixReporte OUTPUT;
            IF @VendeurRenseigne = 1
            BEGIN
                INSERT INTO dbo.DroitsVoteExercable (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                VALUES (NEWID(), @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, @Qte, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId);
            END
        END
        ELSE
        BEGIN
            SET @Qte = @NombreDroitVoteExercable;
            SET @PrixReporte = NULL;
            IF @VendeurRenseigne = 1
                EXEC #ConsommerLotsDroitsVoteExercable @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, @Qte, @PrixReporte OUTPUT;

            INSERT INTO dbo.DroitsVoteExercable (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, Quantite, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            VALUES (NEWID(), @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, @Qte, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId);
        END
    END

    FETCH NEXT FROM curseurTransactions INTO @TransactionId, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date,
        @NombreActions, @NombreDroitVoteTheorique, @NombreDroitVoteExercable, @Categorie, @VendeurId, @VendeurNomExterne, @PrixAction;
END

CLOSE curseurTransactions;
DEALLOCATE curseurTransactions;
GO

DROP PROCEDURE #ConsommerLotsActions;
DROP PROCEDURE #ConsommerLotsDroitsVoteTheorique;
DROP PROCEDURE #ConsommerLotsDroitsVoteExercable;
GO

-- Résumé du résultat.
SELECT 'Actions' AS Table_, COUNT(*) AS NombreLots, SUM(Quantite) AS QuantiteTotale FROM dbo.Actions
UNION ALL
SELECT 'DroitsVoteTheorique', COUNT(*), SUM(Quantite) FROM dbo.DroitsVoteTheorique
UNION ALL
SELECT 'DroitsVoteExercable', COUNT(*), SUM(Quantite) FROM dbo.DroitsVoteExercable;
GO
