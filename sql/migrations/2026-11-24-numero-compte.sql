-- Ajoute un numéro de compte dédié (texte libre court, personnalisable à la
-- création), distinct du Nom affiché qui reste une colonne à part — le Nom
-- des comptes déjà existants n'est volontairement pas modifié par cette
-- migration (voir le commentaire de ComptesService.ResoudreCompte pour le
-- nouveau format "Détenteur - Société émettrice - Catégorie - Numéro"
-- désormais utilisé pour les comptes créés automatiquement à partir de
-- maintenant).
ALTER TABLE dbo.Comptes ADD Numero NVARCHAR(8) NULL;
