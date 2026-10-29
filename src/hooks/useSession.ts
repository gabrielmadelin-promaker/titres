import { useEffect, useState } from "react";
import * as api from "../api/client";
import type { UtilisateurConnecte } from "../api/client";
import { effacerToken, lireToken } from "../api/auth";

// Session d'authentification temporaire, en attendant le SSO : vérifie au
// montage si un jeton local existe et correspond toujours à une session
// valide côté serveur, puis expose la déconnexion (locale, ou complète
// auprès du serveur).
export function useSession() {
  const [utilisateurConnecte, setUtilisateurConnecte] = useState<UtilisateurConnecte | null>(null);
  const [verificationSession, setVerificationSession] = useState(true);

  useEffect(() => {
    const token = lireToken();
    if (!token) {
      setVerificationSession(false);
      return;
    }
    api
      .verifierSession()
      .then((u) => setUtilisateurConnecte(u))
      .catch(() => effacerToken())
      .finally(() => setVerificationSession(false));
  }, []);

  function seDeconnecterLocal() {
    effacerToken();
    setUtilisateurConnecte(null);
  }

  async function seDeconnecter() {
    try {
      await api.deconnecter();
    } catch {
      // Sans conséquence si la requête échoue (session déjà expirée, réseau
      // coupé...) : le jeton local est effacé de toute façon.
    }
    seDeconnecterLocal();
  }

  return { utilisateurConnecte, setUtilisateurConnecte, verificationSession, seDeconnecterLocal, seDeconnecter };
}
