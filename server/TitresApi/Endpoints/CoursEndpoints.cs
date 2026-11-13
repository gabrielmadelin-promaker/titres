// Cours de clôture de la veille des Sociétés cotées (API EODHD) — voir CoursService.
static class CoursEndpoints
{
    // Enregistre les routes /api/cours.
    public static void MapCoursEndpoints(this WebApplication app)
    {
        // Un seul appel groupé plutôt qu'un par Société : le tableau des
        // Sociétés affiche toutes les lignes à la fois, inutile de multiplier
        // les allers-retours HTTP (et les appels EODHD, par ricochet).
        app.MapGet("/api/cours", async (string? codes) =>
        {
            var codesUniques = (codes ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct()
                .ToArray();
            var resultats = await Task.WhenAll(codesUniques.Select(c => CoursService.ObtenirClotureVeille(app.Configuration, c)));
            return Results.Ok(resultats);
        });
    }
}
