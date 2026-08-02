/**
 * Opération commune aux règles en pourcentage.
 *
 * Les quatre familles concernées (base, conditionnelle, taxe, cumulative) ne
 * diffèrent que par leur facteur et par les lignes qu'elles touchent : un seul
 * helper évite de réécrire quatre fois la même transformation.
 */

import type { PricingLine, PricingState } from '../types';

/**
 * Multiplie le montant des lignes retenues, en renvoyant un nouvel état.
 * L'état reçu, ses lignes et ses catégories ne sont jamais mutés.
 */
export function scaleLines(
  state: PricingState,
  factor: number,
  matches: (line: PricingLine) => boolean = () => true,
): PricingState {
  return {
    ...state,
    lines: state.lines.map((line) =>
      matches(line) ? { ...line, amount: line.amount * factor } : line,
    ),
  };
}
