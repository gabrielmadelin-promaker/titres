using Microsoft.Extensions.Configuration;

static class ConnexionBdd
{
    // Chaîne de connexion SQL Server de l'application ; lève une exception explicite si elle manque
    // (service Windows mal installé, appsettings.Production.json absent à côté de l'exécutable).
    public static string ChaineConnexionTitres(this IConfiguration configuration) =>
        configuration.GetConnectionString("CalculDesTitres")
        is { Length: > 0 } chaine
            ? chaine
            : throw new InvalidOperationException(
                "ConnectionStrings:CalculDesTitres manquante — créez appsettings.Production.json à côté de l'exécutable.");
}
