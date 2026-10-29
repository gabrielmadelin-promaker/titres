// Rôles utilisateur de l'application — seul "DSI" est vérifié (écran
// Utilisateurs) ; "Direction des titres" est pour l'instant juste enregistré.
export const ROLE_DSI = "DSI";
export const ROLE_DIRECTION_DES_TITRES = "Direction des titres";

export const ROLES = [ROLE_DSI, ROLE_DIRECTION_DES_TITRES] as const;
