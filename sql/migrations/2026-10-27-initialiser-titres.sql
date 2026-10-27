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
-- Server disponible pour le vérifier avant de vous le fournir) — malgré
-- une relecture attentive, mieux vaut l'essayer d'abord sur une copie de
-- la base plutôt que directement en production si c'est possible chez
-- vous. En cas d'erreur en cours d'exécution (boîte de dialogue SSMS),
-- il suffit de relancer le script entier depuis le début : il repart
-- toujours de zéro (DELETE initial), pas besoin de nettoyer quoi que ce
-- soit à la main avant de rejouer.

USE CalculDesTitres;
GO

DELETE FROM dbo.Actions;
DELETE FROM dbo.DroitsVoteTheorique;
DELETE FROM dbo.DroitsVoteExercable;
GO

-- Procédure temporaire locale (portée à cette seule session/connexion,
-- disparaît automatiquement à la fin) : synchronise UNE des 3 tables pour
-- UNE transaction, exactement comme SynchroniserTitresMetrique côté API.
-- @Table est toujours l'un des 3 noms littéraux utilisés plus bas (jamais
-- une saisie utilisateur) ; QUOTENAME() est utilisé par précaution.
CREATE PROCEDURE #SynchroniserTitresMetrique
    @Table NVARCHAR(50),
    @CibleId UNIQUEIDENTIFIER,
    @Categorie NVARCHAR(10),
    @AcheteurId UNIQUEIDENTIFIER,
    @AcheteurNomExterne NVARCHAR(300),
    @QuantiteSignee DECIMAL(18,4),
    @VendeurId UNIQUEIDENTIFIER,
    @VendeurNomExterne NVARCHAR(300),
    @PrixAction DECIMAL(18,4),
    @Date DATE,
    @TransactionId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    IF @QuantiteSignee IS NULL OR @QuantiteSignee = 0 RETURN;
    -- Acheteur == vendeur : rien à faire (cas déjà écarté à la saisie, par précaution).
    IF @VendeurId IS NOT NULL AND @AcheteurId IS NOT NULL AND @VendeurId = @AcheteurId RETURN;

    DECLARE @VendeurRenseigne BIT = CASE WHEN @VendeurId IS NOT NULL OR @VendeurNomExterne IS NOT NULL THEN 1 ELSE 0 END;
    DECLARE @PrixReporte DECIMAL(18,4) = NULL;
    DECLARE @Qte INT;
    DECLARE @Sql NVARCHAR(MAX);

    DECLARE @ParamsSuppression NVARCHAR(MAX) = N'
        @Qte INT, @CibleId UNIQUEIDENTIFIER, @DetenteurId UNIQUEIDENTIFIER,
        @DetenteurNomExterne NVARCHAR(300), @Categorie NVARCHAR(10), @PrixReporte DECIMAL(18,4) OUTPUT';
    DECLARE @ParamsCreation NVARCHAR(MAX) = N'
        @Qte INT, @CibleId UNIQUEIDENTIFIER, @Categorie NVARCHAR(10), @DetenteurId UNIQUEIDENTIFIER,
        @DetenteurNomExterne NVARCHAR(300), @PrixInitial DECIMAL(18,4), @PrixAction DECIMAL(18,4),
        @Date DATE, @TransactionId UNIQUEIDENTIFIER';

    IF @QuantiteSignee < 0
    BEGIN
        -- Vente : l'acheteur de la transaction est le camp qui PERD des titres.
        SET @Qte = CONVERT(INT, -@QuantiteSignee);

        SET @Sql = N'
            DECLARE @Supprimes TABLE (PrixInitial DECIMAL(18,4) NULL);
            DELETE FROM dbo.' + QUOTENAME(@Table) + N'
            OUTPUT deleted.PrixInitial INTO @Supprimes
            WHERE Id IN (
                SELECT TOP (@Qte) Id FROM dbo.' + QUOTENAME(@Table) + N'
                WHERE SocieteEmettriceId = @CibleId
                  AND ((@DetenteurId IS NOT NULL AND SocieteDetentriceId = @DetenteurId) OR (@DetenteurId IS NULL AND DetenteurNomExterne = @DetenteurNomExterne))
                  AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                ORDER BY DateAcquisition ASC, Id ASC
            );
            SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;';
        EXEC sp_executesql @Sql, @ParamsSuppression,
            @Qte = @Qte, @CibleId = @CibleId, @DetenteurId = @AcheteurId, @DetenteurNomExterne = @AcheteurNomExterne,
            @Categorie = @Categorie, @PrixReporte = @PrixReporte OUTPUT;

        IF @VendeurRenseigne = 1
        BEGIN
            SET @Sql = N'
                INSERT INTO dbo.' + QUOTENAME(@Table) + N' (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
                SELECT NEWID(), @CibleId, @Categorie, @DetenteurId, @DetenteurNomExterne, @PrixInitial, @PrixAction, @Date, @TransactionId
                FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;';
            EXEC sp_executesql @Sql, @ParamsCreation,
                @Qte = @Qte, @CibleId = @CibleId, @Categorie = @Categorie, @DetenteurId = @VendeurId,
                @DetenteurNomExterne = @VendeurNomExterne, @PrixInitial = ISNULL(@PrixReporte, @PrixAction),
                @PrixAction = @PrixAction, @Date = @Date, @TransactionId = @TransactionId;
        END
    END
    ELSE
    BEGIN
        -- Achat : l'acheteur GAGNE des titres ; si un vendeur suivi est renseigné, il les perd d'abord.
        SET @Qte = CONVERT(INT, @QuantiteSignee);

        IF @VendeurRenseigne = 1
        BEGIN
            SET @Sql = N'
                DECLARE @Supprimes TABLE (PrixInitial DECIMAL(18,4) NULL);
                DELETE FROM dbo.' + QUOTENAME(@Table) + N'
                OUTPUT deleted.PrixInitial INTO @Supprimes
                WHERE Id IN (
                    SELECT TOP (@Qte) Id FROM dbo.' + QUOTENAME(@Table) + N'
                    WHERE SocieteEmettriceId = @CibleId
                      AND ((@DetenteurId IS NOT NULL AND SocieteDetentriceId = @DetenteurId) OR (@DetenteurId IS NULL AND DetenteurNomExterne = @DetenteurNomExterne))
                      AND ((@Categorie IS NULL AND Categorie IS NULL) OR Categorie = @Categorie)
                    ORDER BY DateAcquisition ASC, Id ASC
                );
                SELECT @PrixReporte = AVG(PrixInitial) FROM @Supprimes;';
            EXEC sp_executesql @Sql, @ParamsSuppression,
                @Qte = @Qte, @CibleId = @CibleId, @DetenteurId = @VendeurId, @DetenteurNomExterne = @VendeurNomExterne,
                @Categorie = @Categorie, @PrixReporte = @PrixReporte OUTPUT;
        END

        SET @Sql = N'
            INSERT INTO dbo.' + QUOTENAME(@Table) + N' (Id, SocieteEmettriceId, Categorie, SocieteDetentriceId, DetenteurNomExterne, PrixInitial, PrixAcquisition, DateAcquisition, TransactionOrigineId)
            SELECT NEWID(), @CibleId, @Categorie, @DetenteurId, @DetenteurNomExterne, @PrixInitial, @PrixAction, @Date, @TransactionId
            FROM (SELECT TOP (@Qte) 1 AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b) AS Nombres;';
        EXEC sp_executesql @Sql, @ParamsCreation,
            @Qte = @Qte, @CibleId = @CibleId, @Categorie = @Categorie, @DetenteurId = @AcheteurId,
            @DetenteurNomExterne = @AcheteurNomExterne, @PrixInitial = ISNULL(@PrixReporte, @PrixAction),
            @PrixAction = @PrixAction, @Date = @Date, @TransactionId = @TransactionId;
    END
END
GO

-- Parcourt toutes les transactions, dans l'ordre chronologique, et
-- applique la procédure ci-dessus pour les 3 notions à chaque fois.
DECLARE @TransactionId UNIQUEIDENTIFIER, @AcheteurId UNIQUEIDENTIFIER, @AcheteurNomExterne NVARCHAR(300),
        @CibleId UNIQUEIDENTIFIER, @Date DATE, @NombreActions DECIMAL(18,4), @NombreDroitVoteTheorique DECIMAL(18,4),
        @NombreDroitVoteExercable DECIMAL(18,4), @Categorie NVARCHAR(10), @VendeurId UNIQUEIDENTIFIER,
        @VendeurNomExterne NVARCHAR(300), @PrixAction DECIMAL(18,4);

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
    EXEC #SynchroniserTitresMetrique 'Actions', @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne,
        @NombreActions, @VendeurId, @VendeurNomExterne, @PrixAction, @Date, @TransactionId;
    EXEC #SynchroniserTitresMetrique 'DroitsVoteTheorique', @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne,
        @NombreDroitVoteTheorique, @VendeurId, @VendeurNomExterne, @PrixAction, @Date, @TransactionId;
    EXEC #SynchroniserTitresMetrique 'DroitsVoteExercable', @CibleId, @Categorie, @AcheteurId, @AcheteurNomExterne,
        @NombreDroitVoteExercable, @VendeurId, @VendeurNomExterne, @PrixAction, @Date, @TransactionId;

    FETCH NEXT FROM curseurTransactions INTO @TransactionId, @AcheteurId, @AcheteurNomExterne, @CibleId, @Date,
        @NombreActions, @NombreDroitVoteTheorique, @NombreDroitVoteExercable, @Categorie, @VendeurId, @VendeurNomExterne, @PrixAction;
END

CLOSE curseurTransactions;
DEALLOCATE curseurTransactions;
GO

DROP PROCEDURE #SynchroniserTitresMetrique;
GO

-- Résumé du résultat.
SELECT 'Actions' AS Table_, COUNT(*) AS NombreLignes FROM dbo.Actions
UNION ALL
SELECT 'DroitsVoteTheorique', COUNT(*) FROM dbo.DroitsVoteTheorique
UNION ALL
SELECT 'DroitsVoteExercable', COUNT(*) FROM dbo.DroitsVoteExercable;
GO
