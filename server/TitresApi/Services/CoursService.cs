using System.Net.Http.Json;
using System.Text.Json.Serialization;

// Cours de clôture de la veille des Sociétés cotées, via l'endpoint "chart"
// non officiel de Yahoo Finance — gratuit et sans clé API, contrairement à
// EODHD dont même le palier gratuit (20 appels/jour) est impraticable pour
// une liste de sociétés rafraîchie à chaque affichage. CodeMnemonique doit
// être au format attendu par Yahoo Finance (symbole + suffixe de marché,
// ex. "MC.PA" pour Euronext Paris, "ASML.AS" pour Amsterdam, "SAP.DE" pour
// l'Allemagne — pas de suffixe pour les valeurs US, ex. "AAPL"). Cet
// endpoint n'est pas documenté officiellement par Yahoo et peut changer ou
// être bloqué sans préavis — à surveiller si les cours cessent de remonter.
static class CoursService
{
    static readonly HttpClient Http = CreerHttpClient();

    static HttpClient CreerHttpClient()
    {
        var http = new HttpClient();
        // Sans User-Agent de navigateur, Yahoo répond parfois 403 — aucune
        // authentification réelle n'est en jeu, juste éviter d'avoir l'air
        // d'un script par défaut.
        http.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        return http;
    }

    // Cache en mémoire par code : la clôture de la veille ne change qu'une
    // fois par jour (à la fermeture du marché) — évite de rappeler l'API à
    // chaque rendu du tableau des Sociétés. Expire à minuit UTC suivant
    // (perdu au redémarrage du service — sans conséquence, un nouvel appel
    // suffit à le reconstituer).
    static readonly Dictionary<string, (CoursCloture Valeur, DateTime Expiration)> Cache = new();
    static readonly object Verrou = new();

    public static async Task<CoursCloture> ObtenirClotureVeille(string codeMnemonique)
    {
        lock (Verrou)
        {
            if (Cache.TryGetValue(codeMnemonique, out var entree) && entree.Expiration > DateTime.UtcNow)
                return entree.Valeur;
        }

        var resultat = await InterrogerYahoo(codeMnemonique);

        lock (Verrou)
        {
            Cache[codeMnemonique] = (resultat, DateTime.UtcNow.Date.AddDays(1));
        }
        return resultat;
    }

    static async Task<CoursCloture> InterrogerYahoo(string codeMnemonique)
    {
        try
        {
            var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(codeMnemonique)}?interval=1d&range=1d";
            var reponse = await Http.GetFromJsonAsync<ReponseYahoo>(url);

            var erreur = reponse?.Chart?.Error?.Description;
            if (erreur is not null)
                return new CoursCloture(codeMnemonique, null, null, $"Yahoo Finance : {erreur}");

            var meta = reponse?.Chart?.Result?.FirstOrDefault()?.Meta;
            if (meta?.ChartPreviousClose is not decimal cloture)
                return new CoursCloture(codeMnemonique, null, null, "Aucune clôture renvoyée par Yahoo Finance (code mnémonique inconnu ?).");

            // Horodatage de la dernière cotation connue, pas précisément
            // celui de chartPreviousClose (Yahoo ne le fournit pas
            // explicitement) — à titre indicatif seulement.
            var date = meta.RegularMarketTime is long epoque
                ? DateTimeOffset.FromUnixTimeSeconds(epoque).UtcDateTime.ToString("yyyy-MM-dd")
                : null;
            return new CoursCloture(codeMnemonique, cloture, date, null);
        }
        catch (Exception e)
        {
            return new CoursCloture(codeMnemonique, null, null, $"Erreur Yahoo Finance : {e.Message}");
        }
    }

    record ReponseYahoo([property: JsonPropertyName("chart")] ChartYahoo? Chart);

    record ChartYahoo(
        [property: JsonPropertyName("result")] List<ResultatYahoo>? Result,
        [property: JsonPropertyName("error")] ErreurYahoo? Error);

    record ResultatYahoo([property: JsonPropertyName("meta")] MetaYahoo? Meta);

    record MetaYahoo(
        [property: JsonPropertyName("chartPreviousClose")] decimal? ChartPreviousClose,
        [property: JsonPropertyName("regularMarketTime")] long? RegularMarketTime);

    record ErreurYahoo([property: JsonPropertyName("description")] string? Description);
}
