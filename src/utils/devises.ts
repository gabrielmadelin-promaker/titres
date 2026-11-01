// Devises proposées pour la Valeur nominale d'une société et le Prix d'une
// transaction — limité aux 10 devises les plus échangées au monde ; le reste
// de l'application n'a pas besoin d'une liste exhaustive (ISO 4217 en compte
// plus de 150). Doit rester alignée avec Services/Devises.cs côté backend.
export const DEVISES = [
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — Dollar américain" },
  { code: "GBP", label: "GBP — Livre sterling" },
  { code: "JPY", label: "JPY — Yen japonais" },
  { code: "CHF", label: "CHF — Franc suisse" },
  { code: "CNY", label: "CNY — Yuan chinois" },
  { code: "CAD", label: "CAD — Dollar canadien" },
  { code: "AUD", label: "AUD — Dollar australien" },
  { code: "HKD", label: "HKD — Dollar de Hong Kong" },
  { code: "SGD", label: "SGD — Dollar de Singapour" },
] as const;

export const DEVISE_PAR_DEFAUT = "EUR";
