// Les 3 environnements applicatifs, chacun sa propre base de données (même
// serveur/identifiants SQL — voir ConnexionBdd.ChaineConnexionTitres) :
// choisi par l'utilisateur avant de se connecter (voir
// SelecteurEnvironnement côté frontend), envoyé dans l'en-tête
// X-Environnement à chaque appel API, y compris le login lui-même (chaque
// environnement a ses propres dbo.Utilisateurs/dbo.Sessions).
static class Environnements
{
    public static readonly HashSet<string> Valides = ["TITRA_DEV", "TITRA_RECETTE", "TITRA_PROD"];
}

// Accès à l'environnement de la requête HTTP en cours, depuis n'importe quel
// endpoint — évite d'ajouter HttpContext comme paramètre à chacun. Accessor
// est initialisé une seule fois au démarrage (voir Program.cs) ; le
// middleware qui valide l'en-tête X-Environnement stocke ensuite sa valeur
// dans HttpContext.Items à chaque requête, avant qu'aucun endpoint ne
// s'exécute.
static class RequeteCourante
{
    public static IHttpContextAccessor Accessor = null!;

    public static string Environnement =>
        Accessor.HttpContext?.Items["Environnement"] as string
        ?? throw new InvalidOperationException("Environnement non défini pour cette requête (en-tête X-Environnement manquant ou invalide).");
}
