# Calcul des titres

Application de suivi des transactions d'actions entre sociétés et de la
structure actionnariale qui en découle.

## Fonctionnalités

- **Sociétés** : liste des sociétés.
- **Transactions** : historique des achats d'actions — une société achète un
  pourcentage du capital d'une autre société, à une date donnée.
- **Participations** : qui détient combien du capital de qui, transactions
  cumulées.
- **Visualisation** : organigramme façon document corporate de la structure
  actionnariale.

Architecture : un frontend statique (React/Vite, ce dépôt à la racine),
servi par IIS, qui appelle une API .NET (`server/TitresApi`) sur le port
`8091` ; l'API lit/écrit dans une base SQL Server (schéma dans
`sql/schema.sql`). Les données ne sont plus dans le `localStorage` du
navigateur — elles sont partagées entre tous les utilisateurs, en base.

## Développement

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production (tsc + vite build) -> dossier dist/
npm run lint      # oxlint
```

Pour développer avec l'API en local :

```bash
cd server/TitresApi
dotnet run       # écoute sur http://localhost:8091
```

Créez `server/TitresApi/appsettings.Development.json` (non commité) avec
une chaîne de connexion vers une base de dev — voir la structure de
`appsettings.Production.json.example`.

## Déploiement

Le serveur n'a besoin d'installer **ni Node.js, ni .NET, ni git** : tout est
buildé par `.github/workflows/deploy-iis.yml` à chaque push, en deux
branches ne contenant que du build prêt à l'emploi :

- **`iis-dist`** : le frontend statique (`dist/`, `web.config` inclus), servi
  par IIS sur le port `8090`.
- **`api-dist`** : l'API .NET publiée en exécutable autonome (runtime .NET
  inclus dedans), à lancer comme service Windows sur le port `8091`.

Marche à suivre détaillée (création de la base SQL, du site IIS, du service
Windows pour l'API, ouverture des ports pare-feu) : voir le runbook fourni
séparément. En résumé, sur le serveur :

1. Exécuter `sql/schema.sql` sur le serveur SQL Server (crée la base, les
   tables, le compte applicatif `titres_app`).
2. Télécharger et extraire le zip de la branche `iis-dist` dans le dossier
   du site IIS (port `8090`).
3. Télécharger et extraire le zip de la branche `api-dist` quelque part sur
   le serveur, créer `appsettings.Production.json` à côté de `TitresApi.exe`
   (voir `server/TitresApi/appsettings.Production.json.example`) avec la
   chaîne de connexion réelle, puis l'enregistrer comme service Windows
   (port `8091`).
4. Ouvrir les ports `8090` et `8091` dans le pare-feu Windows si besoin
   d'un accès depuis d'autres postes.

Pour une mise à jour : retélécharger les zips `iis-dist`/`api-dist` et
écraser les fichiers existants ; redémarrer le service Windows de l'API
après une mise à jour de `api-dist`.
