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

L'application se build en fichiers statiques (`dist/`), servis par IIS sans
aucun contenu dynamique. Le fichier `public/web.config` (recopié dans
`dist/` à chaque build) configure le document par défaut et le cache des
assets ; le pool d'applications IIS doit être en **"No Managed Code"**.

### Option 1 — tâche VS Code (recommandé)

1. Ouvrez le dossier du dépôt dans VS Code, sur le serveur IIS (ou via
   Remote - SSH / Remote Desktop si VS Code tourne ailleurs que le serveur).
2. `Terminal > Run Task... > Déployer sur IIS`, ou `Ctrl+Shift+B` puis
   choisissez la tâche.
3. Une console PowerShell **administrateur** s'ouvre et exécute
   `deploy/deploy-iis.ps1`, qui :
   - build l'application (`npm ci` + `npm run build`) ;
   - crée si besoin le pool d'applications et le site IIS
     `CalculDesTitres` (port `8090` par défaut) ;
   - publie le contenu de `dist/` dans `C:\inetpub\wwwroot\CalculDesTitres`.

Adaptez le nom du site, le chemin physique ou le port en modifiant les
paramètres de la tâche dans `.vscode/tasks.json`, ou en lançant le script à
la main (voir option 2).

### Option 2 — script PowerShell en ligne de commande

Depuis une console PowerShell **"Exécuter en tant qu'administrateur"** sur
le serveur IIS :

```powershell
.\deploy\deploy-iis.ps1 `
  -SiteName "CalculDesTitres" `
  -PhysicalPath "C:\inetpub\wwwroot\CalculDesTitres" `
  -Port 8090
```

Prérequis serveur : rôle IIS avec fonctionnalité "Outils de gestion IIS ->
Scripts et outils de gestion IIS" (module PowerShell `WebAdministration`),
et Node.js installé pour le build. Voir l'aide intégrée du script
(`Get-Help .\deploy\deploy-iis.ps1 -Full`) pour le détail des paramètres.

### Option 3 — build local puis copie manuelle

Si vous préférez builder ailleurs que sur le serveur :

1. `npm install && npm run build` (localement ou en CI).
2. Copiez le contenu de `dist/` (y compris `web.config`) vers le dossier
   physique du site IIS.
3. Dans IIS Manager : créez le site s'il n'existe pas, avec un pool
   d'applications en `.NET CLR Version` = "No Managed Code", pointant vers
   ce dossier.
