// Devises proposées pour la Valeur nominale d'une société et le Prix d'une
// transaction — limité aux 10 devises les plus échangées au monde ; le reste
// de l'application n'a pas besoin d'une liste exhaustive (ISO 4217 en compte
// plus de 150).
static class Devises
{
    public static readonly string[] Codes = { "EUR", "USD", "GBP", "JPY", "CHF", "CNY", "CAD", "AUD", "HKD", "SGD" };

    public const string ParDefaut = "EUR";

    // Normalise une devise saisie (EUR si absente) et vérifie qu'elle fait partie des devises acceptées.
    public static (string? Erreur, string Devise) Normaliser(string? brut)
    {
        var devise = string.IsNullOrWhiteSpace(brut) ? ParDefaut : brut.Trim().ToUpperInvariant();
        return Array.IndexOf(Codes, devise) >= 0
            ? (null, devise)
            : ($"Devise inconnue : « {devise} ». Devises acceptées : {string.Join(", ", Codes)}.", ParDefaut);
    }
}
