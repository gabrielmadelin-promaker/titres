import type { Societe, Transaction } from "../types";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8091/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Erreur ${res.status} sur ${path}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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

export function modifierSocietePrincipale(id: string, principale: boolean): Promise<void> {
  return request(`/societes/${id}`, { method: "PUT", body: JSON.stringify({ principale }) });
}

export function fetchTransactions(): Promise<Transaction[]> {
  return request("/transactions");
}

export function creerTransaction(transaction: Omit<Transaction, "id">): Promise<Transaction> {
  return request("/transactions", { method: "POST", body: JSON.stringify(transaction) });
}

export function supprimerTransaction(id: string): Promise<void> {
  return request(`/transactions/${id}`, { method: "DELETE" });
}
