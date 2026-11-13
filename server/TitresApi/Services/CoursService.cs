using System.Net.Http.Json;
using System.Text.Json.Serialization;

// Cours de clôture de la veille des Sociétés cotées, via l'API EODHD
// (https://eodhd.com), sur la base du CodeMnemonique de la Société — qui
// doit être au format attendu par EODHD (symbole + suffixe de marché, ex.
// "MC.PA" pour LVMH sur Euronext Paris, "AAPL.US" pour Apple sur le
// Nasdaq), pas simplement le ticker seul.
static class CoursService
{
    // Une seule instance partagée pour toute la durée de vie du service
    // (évite l'épuisement de sockets d'un HttpClient recréé à chaque appel).
    static readonly HttpClient Http = new();

    // Cache en mémoire par code : la clôture de la veille ne change qu'une
    // fois par jour (à la fermeture du marché) — évite de rappeler l'API à
    // chaque rendu du tableau des Sociétés, et reste sous les quotas
    // d'appels d'un abonnement EODHD standard. Expire à minuit UTC suivant
    // (perdu au redémarrage du service — sans conséquence, un nouvel appel
    // suffit à le reconstituer).
    static readonly Dictionary<string, (CoursCloture Valeur, DateTime Expiration)> Cache = new();
    static readonly object Verrou = new();

    public static string? ApiTokenEodhd(this IConfiguration configuration) =>
        configuration["Eodhd:ApiToken"] is { Length: > 0 } token ? token : null;

    /// Clôture de la dernière séance cotée avant aujourd'hui, pour un CodeMnemonique donné.
    public static async Task<CoursCloture> ObtenirClotureVeille(IConfiguration configuration, string codeMnemonique)
    {
        lock (Verrou)
        {
            if (Cache.TryGetValue(codeMnemonique, out var entree) && entree.Expiration > DateTime.UtcNow)
                return entree.Valeur;
        }

        var token = configuration.ApiTokenEodhd();
        var resultat = token is null
            ? new CoursCloture(codeMnemonique, null, null, "Token API EODHD non configuré (Eodhd:ApiToken dans appsettings.Production.json).")
            : await InterrogerEodhd(token, codeMnemonique);

        lock (Verrou)
        {
            Cache[codeMnemonique] = (resultat, DateTime.UtcNow.Date.AddDays(1));
        }
        return resultat;
    }

    static async Task<CoursCloture> InterrogerEodhd(string token, string codeMnemonique)
    {
        try
        {
            // period=d + order=d (plus récent d'abord), 10 lignes de marge pour
            // retomber sur la dernière séance cotée avant aujourd'hui même après
            // un week-end ou un jour férié.
            var url = $"https://eodhd.com/api/eod/{Uri.EscapeDataString(codeMnemonique)}" +
                $"?api_token={Uri.EscapeDataString(token)}&fmt=json&period=d&order=d&limit=10";
            var lignes = await Http.GetFromJsonAsync<List<LigneEod>>(url);
            var aujourdHui = DateOnly.FromDateTime(DateTime.UtcNow);
            var ligne = lignes?.FirstOrDefault(l => DateOnly.TryParse(l.Date, out var d) && d < aujourdHui);
            return ligne is null
                ? new CoursCloture(codeMnemonique, null, null, "Aucune clôture antérieure à aujourd'hui trouvée (code mnémonique inconnu d'EODHD ?).")
                : new CoursCloture(codeMnemonique, ligne.Close, ligne.Date, null);
        }
        catch (Exception e)
        {
            return new CoursCloture(codeMnemonique, null, null, $"Erreur EODHD : {e.Message}");
        }
    }

    record LigneEod(
        [property: JsonPropertyName("date")] string Date,
        [property: JsonPropertyName("close")] decimal Close);
}
