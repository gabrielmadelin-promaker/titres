/** Les 3 environnements applicatifs, chacun sa propre base de données (même serveur SQL) — voir Services/Environnements.cs côté serveur. */
export const ENVIRONNEMENTS = ["TITRA_DEV", "TITRA_RECETTE", "TITRA_PROD"] as const;
export type Environnement = (typeof ENVIRONNEMENTS)[number];

function estEnvironnementValide(valeur: string): valeur is Environnement {
  return (ENVIRONNEMENTS as readonly string[]).includes(valeur);
}

const CLE_ENVIRONNEMENT = "titres_environnement";

/** Environnement choisi avant la connexion, ou null si aucun (pas encore choisi, ou stockage indisponible). */
export function lireEnvironnement(): Environnement | null {
  try {
    const valeur = localStorage.getItem(CLE_ENVIRONNEMENT);
    return valeur && estEnvironnementValide(valeur) ? valeur : null;
  } catch {
    return null;
  }
}

/** Mémorise l'environnement choisi (survit à un rechargement de page). */
export function ecrireEnvironnement(environnement: Environnement): void {
  try {
    localStorage.setItem(CLE_ENVIRONNEMENT, environnement);
  } catch {
    // Stockage indisponible (navigation privée, quota…) : le choix ne
    // survivra pas à un rechargement, mais l'appli reste utilisable pour
    // la session en cours.
  }
}

/** Oublie l'environnement choisi (pour en choisir un autre). */
export function effacerEnvironnement(): void {
  try {
    localStorage.removeItem(CLE_ENVIRONNEMENT);
  } catch {
    // ignore
  }
}
