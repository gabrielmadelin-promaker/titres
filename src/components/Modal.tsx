import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Fenêtre temporaire générique utilisée pour les formulaires d'ajout
 * (Société, Transaction, Catégorie, Compte) : se ferme sur Échap, clic sur
 * l'overlay, ou le bouton ×. Montée dans un portail (document.body) pour ne
 * jamais être rognée par un conteneur parent à overflow réduit.
 */
export function Modal({ title, open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function surEchap(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
