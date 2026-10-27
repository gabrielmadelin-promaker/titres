-- Script d'initialisation de la base de titres (dbo.Actions,
-- dbo.DroitsVoteTheorique, dbo.DroitsVoteExercable) à partir de
-- l'historique des transactions déjà en base.
--
-- Principe : pour chaque transaction, dans l'ordre chronologique, génère
-- une ligne par titre UNITAIRE pour chacune des 3 notions — une
-- transaction de 1000 actions de catégorie A achetées par une société à
-- une autre crée 1000 lignes dans dbo.Actions (SocieteEmettriceId =
-- société cible, Categorie = 'A', SocieteDetentriceId = l'acheteur). Même
-- logique que la synchronisation automatique de l'API à chaque
-- création/modification/suppression de transaction (fonction
-- SynchroniserTitres dans server/TitresApi/Program.cs), rejouée ici une
-- transaction à la fois dans l'ordre chronologique : le camp qui perd des
-- titres (vente, ou le vendeur d'une cession interne au groupe) est
-- toujours traité avant le camp qui en gagne, pour pouvoir reporter le
-- prix d'origine des lignes retirées sur les lignes créées en
-- contrepartie (PrixInitial, distinct de PrixAcquisition qui est toujours
-- le prix de CETTE transaction).
--
-- Volontairement écrit sans SQL dynamique ni procédure stockée (une
-- première version utilisant sp_executesql + paramètre OUTPUT a échoué à
-- l'exécution — SQL dynamique non testable depuis cet environnement) :
-- la même logique est simplement répétée une fois par table (Actions,
-- DroitsVoteTheorique, DroitsVoteExercable), avec des instructions SQL
-- directes sur des noms de table/colonne écrits en dur. Plus long, mais
-- beaucoup plus sûr à faire fonctionner correctement sans pouvoir le
-- tester au préalable.
--
-- Script destructif et idempotent à la fois : il commence par VIDER les 3
-- tables, puis les reconstruit entièrement à partir de zéro — peut être
-- rejoué autant de fois que nécessaire (par exemple après une correction
-- de données sur une transaction), toujours avec un résultat cohérent.
-- Sans aucun effet sur la table Transactions elle-même.
--
-- À exécuter après 2026-10-27-titres-et-quantites.sql,
-- 2026-10-27-backfill-categorie-droits-vote.sql et
-- 2026-10-27-backfill-totaux-societes.sql.
--
-- Limite héritée de la synchronisation automatique de l'API : si une
-- transaction est ensuite modifiée ou supprimée depuis l'application, elle
-- ne peut retirer que les lignes qu'elle avait elle-même créées (via
-- TransactionOrigineId), pas restituer celles qu'elle avait consommées
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

DECLARE @TransactionId UNIQUEIDENTIFIER, @AcheteurId UNIQUEIDENTIFIER, @AcheteurNomExterne NVARCHAR(300),
        @CibleId UNIQUEIDENTIFIER, @Date DATE, @NombreActions DECIMAL(18,4), @NombreDroitVoteTheorique DECIMAL(18,4),
        @NombreDroitVoteExercable DECIMAL(18,4), @Categorie NVARCHAR(10), @VendeurId UNIQUEIDENTIFIER,
        @VendeurNomExterne NVARCHAR(300), @PrixAction DECIMAL(18,4);

DECLARE @VendeurRenseigne BIT, @AcheteurEgalVendeur BIT;
DECLARE @Qte INT, @PrixReporte DECIMAL(18,4);
DECLARE @Supprimes TABLE (PrixInitial DECIMAL(18,4) NULL);

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

    -- ========================= Actions =========================
    IF @AcheteurEgalVendeur = 0 AND @NombreActions IS NOT NULL AND @NombreActions <> 0
    BEGIN
        DELETE FROM @Supprimes;
        SET @PrixReporte = NULL;

        IF @NombreActions < 0
        BEGIN
            -- Vente : l'acheteur de la transaction est le camp qui PERD des titres.
            SET @Qte = CONVERT(INT, -@NombreActions);
            DELETE FROM dbo.Actions
            OUTPUT deleted.PrixInitial INTO @Supprimes
            WHERE Id IN (
                SELECT TOP (@Qte) Id FROM dbo.Actions
                WHERE SocieteEmettriceId = @CibleId
                  AND ((@AcheteurId IS NOT NULL AND SocieteDetentriceId = @AcheteurId) OR (@AcheteurId IS NULL AND DetenteurNomExterne = @AcheteurNomExterne))
                  AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                ORDER BY DateAcquisition ASC, Id ASC
            );
            SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;

            IF @VendeurRenseigne = 1
            BEGIN
                INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                SELECT NEWID(), @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId
                FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;
            END
        END
        ELSE
        BEGIN
            -- Achat : l'acheteur GAGNE des titres ; si un vendeur suivi est renseigné, il les perd d'abord.
            SET @Qte = CONVERT(INT, @NombreActions);
            IF @VendeurRenseigne = 1
            BEGIN
                DELETE FROM dbo.Actions
                OUTPUT deleted.PrixInitial INTO @Supprimes
                WHERE Id IN (
                    SELECT TOP (@Qte) Id FROM dbo.Actions
                    WHERE SocieteEmettriceId = @CibleId
                      AND ((@VendeurId IS NOT NULL AND SocieteDetentriceId = @VendeurId) OR (@VendeurId IS NULL AND DetenteurNomExterne = @VendeurNomExterne))
                      AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                    ORDER BY DateAcquisition ASC, Id ASC
                );
                SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;
            END

            INSERT INTO dbo.Actions (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            SELECT NEWID(), @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId
            FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;
        END
    END

    -- ==================== DroitsVoteTheorique ====================
    IF @AcheteurEgalVendeur = 0 AND @NombreDroitVoteTheorique IS NOT NULL AND @NombreDroitVoteTheorique <> 0
    BEGIN
        DELETE FROM @Supprimes;
        SET @PrixReporte = NULL;

        IF @NombreDroitVoteTheorique < 0
        BEGIN
            SET @Qte = CONVERT(INT, -@NombreDroitVoteTheorique);
            DELETE FROM dbo.DroitsVoteTheorique
            OUTPUT deleted.PrixInitial INTO @Supprimes
            WHERE Id IN (
                SELECT TOP (@Qte) Id FROM dbo.DroitsVoteTheorique
                WHERE SocieteEmettriceId = @CibleId
                  AND ((@AcheteurId IS NOT NULL AND SocieteDetentriceId = @AcheteurId) OR (@AcheteurId IS NULL AND DetenteurNomExterne = @AcheteurNomExterne))
                  AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                ORDER BY DateAcquisition ASC, Id ASC
            );
            SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;

            IF @VendeurRenseigne = 1
            BEGIN
                INSERT INTO dbo.DroitsVoteTheorique (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                SELECT NEWID(), @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId
                FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;
            END
        END
        ELSE
        BEGIN
            SET @Qte = CONVERT(INT, @NombreDroitVoteTheorique);
            IF @VendeurRenseigne = 1
            BEGIN
                DELETE FROM dbo.DroitsVoteTheorique
                OUTPUT deleted.PrixInitial INTO @Supprimes
                WHERE Id IN (
                    SELECT TOP (@Qte) Id FROM dbo.DroitsVoteTheorique
                    WHERE SocieteEmettriceId = @CibleId
                      AND ((@VendeurId IS NOT NULL AND SocieteDetentriceId = @VendeurId) OR (@VendeurId IS NULL AND DetenteurNomExterne = @VendeurNomExterne))
                      AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                    ORDER BY DateAcquisition ASC, Id ASC
                );
                SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;
            END

            INSERT INTO dbo.DroitsVoteTheorique (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            SELECT NEWID(), @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId
            FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;
        END
    END

    -- ==================== DroitsVoteExercable ====================
    IF @AcheteurEgalVendeur = 0 AND @NombreDroitVoteExercable IS NOT NULL AND @NombreDroitVoteExercable <> 0
    BEGIN
        DELETE FROM @Supprimes;
        SET @PrixReporte = NULL;

        IF @NombreDroitVoteExercable < 0
        BEGIN
            SET @Qte = CONVERT(INT, -@NombreDroitVoteExercable);
            DELETE FROM dbo.DroitsVoteExercable
            OUTPUT deleted.PrixInitial INTO @Supprimes
            WHERE Id IN (
                SELECT TOP (@Qte) Id FROM dbo.DroitsVoteExercable
                WHERE SocieteEmettriceId = @CibleId
                  AND ((@AcheteurId IS NOT NULL AND SocieteDetentriceId = @AcheteurId) OR (@AcheteurId IS NULL AND DetenteurNomExterne = @AcheteurNomExterne))
                  AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                ORDER BY DateAcquisition ASC, Id ASC
            );
            SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;

            IF @VendeurRenseigne = 1
            BEGIN
                INSERT INTO dbo.DroitsVoteExercable (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                SELECT NEWID(), @CibleId, @Categorie, @VendeurId, @VendeurNomExterne, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId
                FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;
            END
        END
        ELSE
        BEGIN
            SET @Qte = CONVERT(INT, @NombreDroitVoteExercable);
            IF @VendeurRenseigne = 1
            BEGIN
                DELETE FROM dbo.DroitsVoteExercable
                OUTPUT deleted.PrixInitial INTO @Supprimes
                WHERE Id IN (
                    SELECT TOP (@Qte) Id FROM dbo.DroitsVoteExercable
                    WHERE SocieteEmettriceId = @CibleId
                      AND ((@VendeurId IS NOT NULL AND SocieteDetentriceId = @VendeurId) OR (@VendeurId IS NULL AND DetenteurNomExterne = @VendeurNomExterne))
                      AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                    ORDER BY DateAcquisition ASC, Id ASC
                );
                SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;
            END

            INSERT INTO dbo.DroitsVoteExercable (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            SELECT NEWID(), @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne, ISNULL(@PrixReporte, @PrixAction), @PrixAction, @Date, @TransactionId
            FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;
        END
    END

    FETCH NEXT FROM curseurTransactions INTO @TransactionId, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date,
        @NombreActions, @NombreDroitVoteTheorique, @NombreDroitVoteExercable, @Categorie, @VendeurId, @VendeurNomExterne, @PrixAction;
END

CLOSE curseurTransactions;
DEALLOCATE curseurTransactions;
GO

-- Résumé du résultat.
SELECT 'Actions' AS Table_, COUNT(*) AS NombreLignes FROM dbo.Actions
UNION ALL
SELECT 'DroitsVoteTheorique', COUNT(*) FROM dbo.DroitsVoteTheorique
UNION ALL
SELECT 'DroitsVoteExercable', COUNT(*) FROM dbo.DroitsVoteExercable;
GO
