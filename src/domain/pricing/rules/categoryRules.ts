/**
 * Famille 3 — taxes par catégorie, appliquées **ligne par ligne** sur le montant
 * déjà réduit par les familles précédentes.
 *
 * L'énoncé impose, pour un produit multi-catégories, la taxe la plus élevée.
 * Deux règles distinctes gardent la trace lisible ; la règle Alimentaire exclut
 * donc explicitement les lignes déjà taxées à 20 %, faute de quoi un produit
 * Électronique **et** Alimentaire serait taxé deux fois.
 *
 * Les libellés de catégories sont ceux du dataset, accents compris.
 */

import type { PricingContext, PricingLine, PricingRule } from '../types';
import { scaleLines } from './lineOperations';

export const ELECTRONICS_TAX_RULE_ID = 'category-tax-electronics';
export const FOOD_TAX_RULE_ID = 'category-tax-food';

export const ELECTRONICS_CATEGORY = 'Électronique';
export const FOOD_CATEGORY = 'Alimentaire';

export const ELECTRONICS_TAX_RATE = 0.2;
export const FOOD_TAX_RATE = 0.055;

const isElectronics = (line: PricingLine): boolean =>
  line.categories.includes(ELECTRONICS_CATEGORY);

/** Alimentaire seulement si la ligne n'est pas déjà soumise au taux supérieur. */
const isFoodOnly = (line: PricingLine): boolean =>
  line.categories.includes(FOOD_CATEGORY) && !isElectronics(line);

function describe(lines: readonly PricingLine[], matches: (line: PricingLine) => boolean): string {
  return lines
    .filter(matches)
    .map((line) => line.productId)
    .join(', ');
}

export const electronicsTaxRule: PricingRule<PricingContext> = {
  id: ELECTRONICS_TAX_RULE_ID,
  label: `Taxe ${ELECTRONICS_CATEGORY} +20 %`,
  family: 'category',
  priority: 310,
  evaluate: (_context, state) => {
    const taxed = describe(state.lines, isElectronics);

    if (taxed === '') {
      return { outcome: 'skipped', reason: `aucun produit ${ELECTRONICS_CATEGORY}` };
    }

    return {
      outcome: 'applied',
      state: scaleLines(state, 1 + ELECTRONICS_TAX_RATE, isElectronics),
      reason: `produits taxés à 20 % : ${taxed}`,
    };
  },
};

export const foodTaxRule: PricingRule<PricingContext> = {
  id: FOOD_TAX_RULE_ID,
  label: `Taxe ${FOOD_CATEGORY} +5,5 %`,
  family: 'category',
  priority: 320,
  evaluate: (_context, state) => {
    const taxed = describe(state.lines, isFoodOnly);

    if (taxed === '') {
      return {
        outcome: 'skipped',
        reason: `aucun produit ${FOOD_CATEGORY} hors ${ELECTRONICS_CATEGORY}`,
      };
    }

    return {
      outcome: 'applied',
      state: scaleLines(state, 1 + FOOD_TAX_RATE, isFoodOnly),
      reason: `produits taxés à 5,5 % : ${taxed}`,
    };
  },
};
