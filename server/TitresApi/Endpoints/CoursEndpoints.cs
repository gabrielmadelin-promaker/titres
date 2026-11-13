// Cours de clôture de la veille des Sociétés cotées (Yahoo Finance) — voir CoursService.
static class CoursEndpoints
{
    // Enregistre les routes /api/cours.
    public static void MapCoursEndpoints(this WebApplication app)
    {
        // Un seul appel groupé plutôt qu'un par Société : le tableau des
        // Sociétés affiche toutes les lignes à la fois, inutile de multiplier
        // les allers-retours HTTP (et les appels à Yahoo Finance, par ricochet).
        app.MapGet("/api/cours", async (string? codes) =>
        {
            var codesUniques = (codes ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct()
                .ToArray();
            var resultats = await Task.WhenAll(codesUniques.Select(CoursService.ObtenirClotureVeille));
            return Results.Ok(resultats);
        });
    }
}
