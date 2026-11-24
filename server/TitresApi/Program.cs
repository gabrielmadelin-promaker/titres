using Dapper;
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

// Sans ça, sc.exe démarre bien le processus mais celui-ci ne répond jamais
// au gestionnaire de services Windows (protocole SCM) -> erreur 1053
// "The service did not respond...". Ne change rien quand l'app tourne
// autrement (dotnet run, console) : le hook ne s'active qu'en tant que service.
builder.Host.UseWindowsService();

// Chargé explicitement (indépendamment d'ASPNETCORE_ENVIRONMENT) : le
// service Windows n'a pas de variable d'environnement à configurer, il
// suffit que ce fichier existe à côté de l'exécutable pour surcharger la
// chaîne de connexion et les origines CORS.
builder.Configuration.AddJsonFile("appsettings.Production.json", optional: true, reloadOnChange: false);

// L'API n'est joignable que depuis le réseau interne (pare-feu), pas
// exposée sur internet : pas besoin de restreindre les origines CORS, ça
// n'a fait qu'ajouter un mode de panne (mismatch d'URL) sans bénéfice réel.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});
builder.Services.AddHttpContextAccessor();

var app = builder.Build();
app.UseCors();

RequeteCourante.Accessor = app.Services.GetRequiredService<IHttpContextAccessor>();

string ConnectionString() => app.Configuration.ChaineConnexionTitres(RequeteCourante.Environnement);

// Chaque requête API cible un environnement précis (TITRA_DEV/TITRA_RECETTE/
// TITRA_PROD, une base de données chacun — voir Environnements/ConnexionBdd),
// choisi par l'utilisateur avant de se connecter (voir SelecteurEnvironnement
// côté frontend) et envoyé dans l'en-tête X-Environnement à chaque appel —
// y compris le login lui-même, chaque environnement ayant ses propres
// dbo.Utilisateurs/dbo.Sessions. /api/health reste accessible sans cet
// en-tête (ping générique de supervision, sans vérification de connectivité
// base dans ce cas précis) ; OPTIONS et les routes hors /api n'en ont pas
// besoin non plus.
//
// Authentification temporaire, en attendant le SSO : toute l'application
// (hors health-check et login lui-même) exige en plus un jeton de session
// valide, vérifié à chaque requête. Pas de rôle vérifié ici : le rôle est
// pour l'instant seulement enregistré (voir écran "Utilisateurs"), pas
// encore utilisé pour restreindre quoi que ce soit.
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    if (context.Request.Method == "OPTIONS" || !path.StartsWithSegments("/api"))
    {
        await next();
        return;
    }

    var environnement = context.Request.Headers["X-Environnement"].ToString();
    var estHealthCheck = path.StartsWithSegments("/api/health");
    if (estHealthCheck && string.IsNullOrEmpty(environnement))
    {
        await next();
        return;
    }
    if (!Environnements.Valides.Contains(environnement))
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsync("En-tête X-Environnement manquant ou invalide.");
        return;
    }
    context.Items["Environnement"] = environnement;

    var estRoutePublique = estHealthCheck || path.StartsWithSegments("/api/auth/login");
    if (estRoutePublique)
    {
        await next();
        return;
    }

    var enTete = context.Request.Headers["Authorization"].ToString();
    if (!enTete.StartsWith("Bearer ") || !Guid.TryParse(enTete["Bearer ".Length..], out var jeton))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsync("Authentification requise.");
        return;
    }

    await using var conn = new SqlConnection(ConnectionString());
    var session = await conn.QuerySingleOrDefaultAsync<SessionInfo>(
        "SELECT u.Email, u.Role FROM dbo.Sessions s " +
        "JOIN dbo.Utilisateurs u ON u.Id = s.UtilisateurId " +
        "WHERE s.Token = @jeton AND s.ExpireLe > SYSUTCDATETIME()",
        new { jeton });
    if (session is null)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsync("Session invalide ou expirée.");
        return;
    }

    context.Items["Email"] = session.Email;
    context.Items["Role"] = session.Role;
    await next();
});

app.MapGet("/api/health", async (HttpContext context) =>
{
    if (context.Items["Environnement"] is not string)
        return Results.Ok(new { status = "ok" });

    try
    {
        await using var conn = new SqlConnection(ConnectionString());
        await conn.ExecuteScalarAsync("SELECT 1");
        return Results.Ok(new { status = "ok" });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Connexion SQL Server impossible : {ex.Message}", statusCode: 503);
    }
});

app.MapSocietesEndpoints();
app.MapHistoriqueTotauxEndpoints();
app.MapTypesEndpoints();
app.MapComptesEndpoints();
app.MapTransactionsEndpoints();
app.MapTitresEndpoints();
app.MapAuthEndpoints();
app.MapUtilisateursEndpoints();
app.MapCoursEndpoints();

app.Run();
