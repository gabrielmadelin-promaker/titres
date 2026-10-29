using Microsoft.Extensions.Configuration;

static class ConnexionBdd
{
    public static string ChaineConnexionTitres(this IConfiguration configuration) =>
        configuration.GetConnectionString("CalculDesTitres")
        is { Length: > 0 } chaine
            ? chaine
            : throw new InvalidOperationException(
                "ConnectionStrings:CalculDesTitres manquante — créez appsettings.Production.json à côté de l'exécutable.");
}
