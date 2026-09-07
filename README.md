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

L'application est 100% côté client : les données sont conservées dans le
`localStorage` du navigateur, il n'y a pas de backend.

## Développement

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production (tsc + vite build) -> dossier dist/
npm run lint      # oxlint
```

## Déploiement sur IIS (depuis VS Code)

Le serveur IIS n'a besoin **ni de Node.js ni de npm** : le build est fait par
une GitHub Action, le serveur ne fait que `git pull`.

- `.github/workflows/deploy-iis.yml` build l'application à chaque push
  (`npm ci && npm run build`) et pousse le contenu de `dist/` — y compris
  `web.config` — sur la branche **`iis-dist`**, qui ne contient que ce build.
- Sur le serveur, le dossier physique du site IIS **est** un clone git de
  cette branche. Mettre à jour le site = `git pull` dedans (bouton
  « Synchroniser les modifications » dans VS Code, ou `git pull` en
  terminal) — rien d'autre à installer.

### 1. Créer le site IIS (une seule fois)

Sur le serveur, dans une console PowerShell **« Exécuter en tant
qu'administrateur »** :

```powershell
.\deploy\setup-iis-site.ps1
```

Crée le pool d'applications `CalculDesTitres` en **"No Managed Code"** (site
100&nbsp;% statique) et le site IIS sur le port `8090`, pointant vers
`C:\inetpub\wwwroot\CalculDesTitres`. Peut aussi se lancer depuis VS Code :
palette de commandes → *Tasks: Run Task* → **Créer le site IIS**. Paramètres
personnalisables : `-SiteName`, `-PhysicalPath`, `-Port`.

Prérequis serveur : rôle IIS avec la fonctionnalité "Outils de gestion IIS ->
Scripts et outils de gestion IIS" (module PowerShell `WebAdministration`).

### 2. Cloner la branche `iis-dist` dans ce dossier

Dans VS Code, sur le serveur : *Git: Clone*, URL du dépôt, en choisissant la
branche `iis-dist`, avec `C:\inetpub\wwwroot\CalculDesTitres` comme
destination — ou en terminal :

```powershell
git clone --branch iis-dist --single-branch https://github.com/gabrielmadelin-promaker/titres.git C:\inetpub\wwwroot\CalculDesTitres
```

Le site est en ligne : http://localhost:8090/.

### 3. Mettre à jour le site

À chaque nouvelle version poussée sur la branche de développement (la
GitHub Action republie automatiquement `iis-dist`) : ouvrez le dossier du
site dans VS Code et cliquez sur **Synchroniser les modifications** dans le
panneau Source Control (ou `git pull` en terminal). Pas de build, pas de
redémarrage IIS nécessaire.
