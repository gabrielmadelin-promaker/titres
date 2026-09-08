import { formatDate, formatNombre } from "./format";
import { BOX_H, BOX_W, GAP_GROUPE, type Organigramme } from "./organigramme";
import type { AreteAffichee } from "./aretes";

// 96 px = 1 pouce dans notre repère de calcul (voir organigramme.ts).
const PX_PAR_POUCE = 96;
// Taille de diapositive maximale acceptée par PowerPoint.
const POUCE_MAX = 52;

const ENCRE = "14396B"; // même bleu marine que --org-ink (thème clair)
const ENCRE_CLAIR = "5B7FA6";
const BLANC = "FFFFFF";

/**
 * Reconstruit l'organigramme dans un fichier PowerPoint natif — des formes
 * et des traits éditables (pas une image), pour que le fichier puisse être
 * repris et ajusté directement dans PowerPoint. La mise en page (positions,
 * routage des flèches) est celle déjà calculée pour l'écran ; on la
 * convertit simplement en pouces.
 */
export async function exporterOrganigrammePptx(
  organigramme: Organigramme,
  aretes: AreteAffichee[],
  date: string,
): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  const echelle = Math.min(1, (POUCE_MAX * PX_PAR_POUCE) / Math.max(organigramme.largeur, organigramme.hauteur, 1));
  const enPouces = (px: number) => (px / PX_PAR_POUCE) * echelle;

  const largeurSlide = Math.max(4, enPouces(organigramme.largeur) + 0.6);
  const hauteurSlide = Math.max(3, enPouces(organigramme.hauteur) + 1.1);
  pptx.defineLayout({ name: "ORGANIGRAMME", width: largeurSlide, height: hauteurSlide });
  pptx.layout = "ORGANIGRAMME";

  const slide = pptx.addSlide();
  slide.background = { color: BLANC };

  slide.addText(`Structure actionnariale au ${formatDate(date)}`, {
    x: 0.3,
    y: 0.12,
    w: largeurSlide - 0.6,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: ENCRE,
    fontFace: "Calibri",
  });

  const decalageY = 0.55;
  const dx = (px: number) => 0.3 + enPouces(px);
  const dy = (px: number) => decalageY + enPouces(px);

  // --- Flèches : chaque tracé est reconstitué segment par segment (des
  // vrais traits PowerPoint, pas une image), avec une flèche uniquement sur
  // le tout dernier segment. ---
  for (const arete of aretes) {
    const pts = arete.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dernier = i === pts.length - 2;
      slide.addShape("line", {
        x: dx(Math.min(a.x, b.x)),
        y: dy(Math.min(a.y, b.y)),
        w: enPouces(Math.abs(b.x - a.x)) || 0.001,
        h: enPouces(Math.abs(b.y - a.y)) || 0.001,
        flipH: b.x < a.x,
        flipV: b.y < a.y,
        line: {
          color: arete.retour ? ENCRE_CLAIR : ENCRE,
          width: 1,
          dashType: arete.retour ? "dash" : "solid",
          endArrowType: dernier ? "triangle" : "none",
        },
      });
    }

    const largeurLabel = enPouces(arete.labelWidth);
    slide.addText(arete.label, {
      x: dx(arete.labelMx) - largeurLabel / 2,
      y: dy(arete.labelY) - 0.1,
      w: largeurLabel,
      h: 0.2,
      fontSize: 8,
      bold: true,
      color: ENCRE,
      align: "center",
      valign: "middle",
      fill: { color: BLANC },
      fontFace: "Calibri",
    });
  }

  // --- Boîtes des sociétés ---
  const groupeParCible = new Map(organigramme.groupes.map((g) => [g.cibleId, g]));
  for (const n of organigramme.noeuds) {
    slide.addText(n.nom, {
      x: dx(n.x),
      y: dy(n.y),
      w: enPouces(BOX_W),
      h: enPouces(BOX_H),
      fontSize: 9,
      bold: true,
      color: ENCRE,
      align: "center",
      valign: "middle",
      fill: { color: BLANC },
      line: { color: ENCRE, width: 1 },
      fontFace: "Calibri",
      shrinkText: true,
    });

    const groupe = groupeParCible.get(n.id);
    if (groupe) {
      const texte = groupe.entrees.map((e) => ({
        text: `${formatNombre(e.pourcentage)}  ${e.nom}\n`,
        options: { fontSize: 7, color: ENCRE, fontFace: "Calibri" },
      }));
      slide.addText(texte, {
        x: dx(n.x + BOX_W + GAP_GROUPE),
        y: dy(n.y),
        w: enPouces(n.largeurGroupe),
        h: enPouces(BOX_H),
        valign: "middle",
        margin: [0, 0, 0, 4],
        line: { color: ENCRE, width: 0.75, dashType: "solid" },
      });
    }
  }

  await pptx.writeFile({ fileName: `organigramme-${date}.pptx` });
}
