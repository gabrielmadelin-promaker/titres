using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

static class ConnexionBdd
{
    // Chaîne de connexion SQL Server de l'application : le gabarit (serveur,
    // identifiant, mot de passe) vient d'appsettings.Production.json, commun
    // aux 3 environnements applicatifs (voir Environnements.Valides) — seul
    // le nom de la base change, substitué ici d'après l'environnement choisi
    // par l'utilisateur avant de se connecter (voir RequeteCourante) ; lève
    // une exception explicite si le gabarit manque (service Windows mal
    // installé, appsettings.Production.json absent à côté de l'exécutable)
    // ou si l'environnement n'est pas l'un des 3 reconnus.
    public static string ChaineConnexionTitres(this IConfiguration configuration, string environnement)
    {
        if (!Environnements.Valides.Contains(environnement))
            throw new InvalidOperationException($"Environnement inconnu : « {environnement} ».");

        var gabarit = configuration.GetConnectionString("CalculDesTitres")
            is { Length: > 0 } chaine
                ? chaine
                : throw new InvalidOperationException(
                    "ConnectionStrings:CalculDesTitres manquante — créez appsettings.Production.json à côté de l'exécutable.");

        var constructeur = new SqlConnectionStringBuilder(gabarit) { InitialCatalog = environnement };
        return constructeur.ConnectionString;
    }
}
