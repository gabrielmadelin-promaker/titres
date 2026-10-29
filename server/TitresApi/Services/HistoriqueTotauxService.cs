using Dapper;
using Microsoft.Data.SqlClient;

// Chargement de l'historique des totaux émis par société (dbo.HistoriqueTotauxSociete
// + dbo.HistoriqueTotalActionsType) — les opérations HTTP elles-mêmes sont
// dans Endpoints/HistoriqueTotauxEndpoints.cs.
static class HistoriqueTotauxService
{
    // Le nombre total d'actions n'est pas une colonne de HistoriqueTotauxSociete :
    // c'est la somme de ses lignes de détail par Type (HistoriqueTotalActionsType,
    // jamais stockée directement — voir le record HistoriqueTotalSociete). Les
    // deux tables sont donc toujours lues/écrites ensemble, comme un seul objet
    // du point de vue de l'API (POST/PUT prennent la liste complète des lignes
    // de détail et la remplacent intégralement, en une transaction SQL).
    public static async Task<List<HistoriqueTotalSociete>> ChargerHistoriqueTotaux(SqlConnection conn)
    {
        var parents = (await conn.QueryAsync<HistoriqueTotalSocieteSansDetail>(
            "SELECT Id, SocieteId, CONVERT(varchar(10), DateEffet, 23) AS DateEffet, " +
            "NombreTotalDroitVoteTheorique, NombreTotalDroitVoteExercable " +
            "FROM dbo.HistoriqueTotauxSociete ORDER BY DateEffet")).ToList();
        var lignes = await conn.QueryAsync<LigneActionsParTypeAvecParent>(
            "SELECT HistoriqueTotalSocieteId, Type, Quantite FROM dbo.HistoriqueTotalActionsType");
        var lignesParParent = lignes
            .GroupBy(l => l.HistoriqueTotalSocieteId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<LigneActionsParType>)g.Select(l => new LigneActionsParType(l.Type, l.Quantite)).ToList());

        return parents
            .Select(p => new HistoriqueTotalSociete(
                p.Id, p.SocieteId, p.DateEffet, p.NombreTotalDroitVoteTheorique, p.NombreTotalDroitVoteExercable,
                lignesParParent.GetValueOrDefault(p.Id, Array.Empty<LigneActionsParType>())))
            .ToList();
    }
}
