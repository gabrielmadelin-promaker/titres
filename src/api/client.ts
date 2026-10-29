import type { Compte, HistoriqueTotalSociete, Societe, Titre, Transaction, TypeTitre } from "../types";
import { lireToken, SessionExpireeError } from "./auth";

// Chemin relatif à l'origine de la page plutôt qu'une URL construite avec un
// port en dur (`:8091`) : cette dernière empêchait tout passage en HTTPS
// (port 443) sans patcher le JS compilé à la main après chaque déploiement.
// Avec un chemin relatif, ça fonctionne aussi bien en LAN/VPN (ex.
// http://serveur:8090) qu'en HTTPS derrière un reverse-proxy (ex.
// https://titra.bollore.net) — à condition que chaque site IIS qui sert le
// frontend redirige /api vers l'API (URL Rewrite, ex. http://127.0.0.1:8091/api).
const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = lireToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });

  // Un 401 alors qu'on avait un jeton = session invalide/expirée (à
  // distinguer d'un 401 sans jeton, ex. mauvais mot de passe au login,
  // qui doit rester une erreur "normale" affichée dans le formulaire).
  if (res.status === 401 && token) throw new SessionExpireeError();

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Erreur ${res.status} sur ${path}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface UtilisateurConnecte {
  email: string;
  role: string;
}

export interface ReponseConnexion extends UtilisateurConnecte {
  token: string;
}

/** Authentifie l'utilisateur et ouvre une session (jeton à mémoriser côté appelant). */
export function connecter(email: string, motDePasse: string): Promise<ReponseConnexion> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, motDePasse }) });
}

/** Clôt la session courante côté serveur. */
export function deconnecter(): Promise<void> {
  return request("/auth/logout", { method: "POST" });
}

/** Vérifie que le jeton de session en cours est toujours valide. */
export function verifierSession(): Promise<UtilisateurConnecte> {
  return request("/auth/me");
}

export interface Utilisateur {
  id: string;
  email: string;
  motDePasse: string;
  role: string;
  creeLe: string;
}

/** Réservé au rôle DSI côté API. */
export function fetchUtilisateurs(): Promise<Utilisateur[]> {
  return request("/utilisateurs");
}

/** Crée un utilisateur (mot de passe temporaire généré côté serveur). */
export function creerUtilisateur(email: string, role: string): Promise<Utilisateur> {
  return request("/utilisateurs", { method: "POST", body: JSON.stringify({ email, role }) });
}

/** Supprime un utilisateur (refusé côté serveur s'il ne reste plus que lui). */
export function supprimerUtilisateur(id: string): Promise<void> {
  return request(`/utilisateurs/${id}`, { method: "DELETE" });
}

/** Récupère la liste des sociétés suivies. */
export function fetchSocietes(): Promise<Societe[]> {
  return request("/societes");
}

/** Crée une société. */
export function creerSociete(societe: Omit<Societe, "id">): Promise<Societe> {
  return request("/societes", { method: "POST", body: JSON.stringify(societe) });
}

/** Supprime une société (les transactions qui la référencent restent, orphelines). */
export function supprimerSociete(id: string): Promise<void> {
  return request(`/societes/${id}`, { method: "DELETE" });
}

/** Modifie une société. */
export function modifierSociete(id: string, champs: Omit<Societe, "id">): Promise<void> {
  return request(`/societes/${id}`, { method: "PUT", body: JSON.stringify(champs) });
}

/** Récupère l'historique des totaux émis par société. */
export function fetchHistoriqueTotaux(): Promise<HistoriqueTotalSociete[]> {
  return request("/historique-totaux-societe");
}

/** Ajoute une ligne de totaux (DV théorique/exerçable + ventilation par Catégorie) à une date d'effet. */
export function creerHistoriqueTotal(ligne: Omit<HistoriqueTotalSociete, "id">): Promise<HistoriqueTotalSociete> {
  return request("/historique-totaux-societe", { method: "POST", body: JSON.stringify(ligne) });
}

/** Modifie une ligne de totaux existante. */
export function modifierHistoriqueTotal(id: string, ligne: Omit<HistoriqueTotalSociete, "id">): Promise<void> {
  return request(`/historique-totaux-societe/${id}`, { method: "PUT", body: JSON.stringify(ligne) });
}

/** Supprime une ligne de totaux. */
export function supprimerHistoriqueTotal(id: string): Promise<void> {
  return request(`/historique-totaux-societe/${id}`, { method: "DELETE" });
}

/** Catégories de titres suggérées (ex. Action ordinaire) — texte libre, pas une liste fermée côté serveur. */
export function fetchTypes(): Promise<TypeTitre[]> {
  return request("/types");
}

/** Ajoute une catégorie suggérée. */
export function creerType(nom: string): Promise<TypeTitre> {
  return request("/types", { method: "POST", body: JSON.stringify({ nom }) });
}

/** Supprime une catégorie suggérée (sans effet sur les transactions/totaux qui la référencent déjà en texte libre). */
export function supprimerType(id: string): Promise<void> {
  return request(`/types/${id}`, { method: "DELETE" });
}

/** Comptes : jamais créés depuis le client, uniquement résolus côté serveur — pas de POST ici. */
export function fetchComptes(): Promise<Compte[]> {
  return request("/comptes");
}

/** Renomme ou réaffecte un compte existant. */
export function modifierCompte(id: string, compte: Omit<Compte, "id">): Promise<void> {
  return request(`/comptes/${id}`, { method: "PUT", body: JSON.stringify(compte) });
}

/** Supprime un compte. */
export function supprimerCompte(id: string): Promise<void> {
  return request(`/comptes/${id}`, { method: "DELETE" });
}

/** Récupère la liste des transactions, plus-value par ligne déjà calculée côté serveur. */
export function fetchTransactions(): Promise<Transaction[]> {
  return request("/transactions");
}

/** Crée une transaction (une ou plusieurs lignes par Catégorie), comptes et lots de titres synchronisés côté serveur. */
export function creerTransaction(transaction: Omit<Transaction, "id">): Promise<Transaction> {
  return request("/transactions", { method: "POST", body: JSON.stringify(transaction) });
}

/** Renvoie la transaction à jour : PlusValue fait autorité côté serveur, recalculée après écriture. */
export function modifierTransaction(id: string, champs: Omit<Transaction, "id">): Promise<Transaction> {
  return request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(champs) });
}

/** Supprime une transaction (retire aussi les lots de titres qu'elle avait créés). */
export function supprimerTransaction(id: string): Promise<void> {
  return request(`/transactions/${id}`, { method: "DELETE" });
}

// Lecture seule : cette table est alimentée automatiquement par l'API à
// chaque transaction, jamais saisie à la main — pas de POST/PUT/DELETE
// côté client.
export function fetchActions(): Promise<Titre[]> {
  return request("/titres/actions");
}
