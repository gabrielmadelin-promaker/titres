# Calcul des titres

Application de suivi de la valorisation de sociétés et des transactions
d'actions entre elles.

## Fonctionnalités

- **Sociétés** : liste des sociétés avec leur valorisation. La valorisation
  affichée est automatiquement celle de la transaction la plus récente dont
  la société est la cible ; à défaut, la valorisation initiale saisie
  manuellement.
- **Transactions** : historique des achats d'actions — une société achète un
  pourcentage du capital d'une autre société, à une date donnée et à une
  valorisation donnée.

Les données sont conservées dans le `localStorage` du navigateur.

## Développement

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production (tsc + vite build)
npm run lint      # oxlint
```
