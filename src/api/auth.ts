const CLE_TOKEN = "titres_token";

/** Jeton de session courant, ou null si absent (déconnecté, stockage indisponible). */
export function lireToken(): string | null {
  try {
    return localStorage.getItem(CLE_TOKEN);
  } catch {
    return null;
  }
}

/** Mémorise le jeton de session (survit à un rechargement de page). */
export function ecrireToken(token: string): void {
  try {
    localStorage.setItem(CLE_TOKEN, token);
  } catch {
    // Stockage indisponible (navigation privée, quota…) : la session ne
    // survivra pas à un rechargement, mais l'appli reste utilisable pour
    // la session en cours.
  }
}

/** Oublie le jeton de session (déconnexion). */
export function effacerToken(): void {
  try {
    localStorage.removeItem(CLE_TOKEN);
  } catch {
    // ignore
  }
}

/** Jeton absent ou rejeté par l'API (session invalide ou expirée). */
export class SessionExpireeError extends Error {
  constructor() {
    super("Votre session a expiré, reconnectez-vous.");
  }
}
