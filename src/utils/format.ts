const percentFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 4,
});

const montantFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Pourcentage arrondi (ex. participation au capital), avec le signe %. */
export function formatPourcentage(value: number): string {
  return `${percentFormatter.format(value)} %`;
}

/** Nombre décimal quelconque (ex. nombre d'actions, valeur nominale), jusqu'à 4 décimales. */
export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

/** Montant en euros (ex. prix d'action, plus-value). */
export function formatMontant(value: number): string {
  return montantFormatter.format(value);
}

/** Date ISO (yyyy-mm-dd) affichée au format français jj/mm/aaaa ; "—" si vide. */
export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFormatter.format(d);
}
