import type { Societe, Transaction } from "../types";
import { lireToken, SessionExpireeError } from "./auth";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8091/api`;

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

export function connecter(email: string, motDePasse: string): Promise<ReponseConnexion> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, motDePasse }) });
}

export function deconnecter(): Promise<void> {
  return request("/auth/logout", { method: "POST" });
}

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

export function fetchUtilisateurs(): Promise<Utilisateur[]> {
  return request("/utilisateurs");
}

export function creerUtilisateur(email: string, role: string): Promise<Utilisateur> {
  return request("/utilisateurs", { method: "POST", body: JSON.stringify({ email, role }) });
}

export function supprimerUtilisateur(id: string): Promise<void> {
  return request(`/utilisateurs/${id}`, { method: "DELETE" });
}

export function fetchSocietes(): Promise<Societe[]> {
  return request("/societes");
}

export function creerSociete(societe: Omit<Societe, "id">): Promise<Societe> {
  return request("/societes", { method: "POST", body: JSON.stringify(societe) });
}

export function supprimerSociete(id: string): Promise<void> {
  return request(`/societes/${id}`, { method: "DELETE" });
}

export function modifierSociete(id: string, champs: Omit<Societe, "id">): Promise<void> {
  return request(`/societes/${id}`, { method: "PUT", body: JSON.stringify(champs) });
}

export function fetchTransactions(): Promise<Transaction[]> {
  return request("/transactions");
}

export function creerTransaction(transaction: Omit<Transaction, "id">): Promise<Transaction> {
  return request("/transactions", { method: "POST", body: JSON.stringify(transaction) });
}

export function modifierTransaction(id: string, champs: Omit<Transaction, "id">): Promise<Transaction> {
  return request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(champs) });
}

export function supprimerTransaction(id: string): Promise<void> {
  return request(`/transactions/${id}`, { method: "DELETE" });
}
