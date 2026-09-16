const CLE_TOKEN = "titres_token";

export function lireToken(): string | null {
  try {
    return localStorage.getItem(CLE_TOKEN);
  } catch {
    return null;
  }
}

export function ecrireToken(token: string): void {
  try {
    localStorage.setItem(CLE_TOKEN, token);
  } catch {
    // Stockage indisponible (navigation privée, quota…) : la session ne
    // survivra pas à un rechargement, mais l'appli reste utilisable pour
    // la session en cours.
  }
}

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
