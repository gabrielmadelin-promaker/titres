import type { WheelEvent } from "react";

/**
 * Un simple survol à la molette ne doit jamais changer la valeur d'un champ
 * (bug navigateur connu sur les inputs date/number focusés) : à poser en
 * onWheel sur ces champs pour leur faire perdre le focus avant que le
 * navigateur n'applique son incrément/décrément.
 */
export function ignorerMolette(e: WheelEvent<HTMLInputElement>): void {
  e.currentTarget.blur();
}
