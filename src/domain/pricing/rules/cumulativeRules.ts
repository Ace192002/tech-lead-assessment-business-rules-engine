/**
 * Famille 4 — remise de volume par catégorie, et annulation éventuelle du
 * palier conditionnel 500 €.
 *
 * Le seuil porte sur les **unités**, pas sur le nombre de références distinctes :
 * 5 paquets de café et 10 tablettes de chocolat font 15 unités Alimentaire, donc
 * une catégorie qualifiante, même si cela ne représente que deux références.
 *
 * Une ligne appartenant à plusieurs catégories qualifiantes n'est remisée
 * qu'une seule fois : la remise porte sur la ligne, pas sur chaque catégorie.
 *
 * Si la remise fait retomber le total sous 500 €, le palier conditionnel −5 %
 * n'aurait jamais dû s'appliquer : on demande son annulation au moteur, qui
 * abandonne le passage et rejoue tout depuis l'état brut. Aucune inversion
 * mathématique n'est effectuée ici.
 */

import type { PricingContext, PricingLine, PricingRule, PricingState } from '../types';
import { CONDITIONAL_TIER_500_RULE_ID, CONDITIONAL_TIER_500_THRESHOLD } from './conditionalRules';
import { scaleLines } from './lineOperations';

export const CUMULATIVE_VOLUME_RULE_ID = 'cumulative-volume-discount';

export const CUMULATIVE_CATEGORY_QUANTITY_THRESHOLD = 3;
export const CUMULATIVE_DISCOUNT_RATE = 0.1;

/** Quantités cumulées par catégorie ; une ligne alimente chacune des siennes. */
function quantityByCategory(lines: readonly PricingLine[]): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const line of lines) {
    for (const category of line.categories) {
      quantities.set(category, (quantities.get(category) ?? 0) + line.quantity);
    }
  }

  return quantities;
}

function totalOf(state: PricingState): number {
  return (
    state.lines.reduce((sum, line) => sum + line.amount, 0) +
    state.adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0)
  );
}

export const cumulativeVolumeDiscountRule: PricingRule<PricingContext> = {
  id: CUMULATIVE_VOLUME_RULE_ID,
  label: `Plus de ${CUMULATIVE_CATEGORY_QUANTITY_THRESHOLD} unités d'une même catégorie : −10 %`,
  family: 'cumulative',
  priority: 410,
  evaluate: (_context, state, appliedRuleIds) => {
    const quantities = quantityByCategory(state.lines);
    const qualifying = [...quantities.entries()]
      .filter(([, quantity]) => quantity > CUMULATIVE_CATEGORY_QUANTITY_THRESHOLD)
      .map(([category]) => category);

    if (qualifying.length === 0) {
      return {
        outcome: 'skipped',
        reason: `aucune catégorie au-delà de ${CUMULATIVE_CATEGORY_QUANTITY_THRESHOLD} unités`,
      };
    }

    const qualifyingSet = new Set(qualifying);
    const isEligible = (line: PricingLine): boolean =>
      line.categories.some((category) => qualifyingSet.has(category));

    const discounted = scaleLines(state, 1 - CUMULATIVE_DISCOUNT_RATE, isEligible);
    const reason =
      `catégories qualifiantes : ${qualifying.map((category) => `${category} (${quantities.get(category)} u.)`).join(', ')}`;

    const total = totalOf(discounted);
    const tier500WasApplied = appliedRuleIds.has(CONDITIONAL_TIER_500_RULE_ID);

    if (total < CONDITIONAL_TIER_500_THRESHOLD && tier500WasApplied) {
      return {
        outcome: 'applied',
        state: discounted,
        reason: `${reason} — total ramené à ${total.toFixed(2)} €`,
        cancellations: [
          {
            ruleId: CONDITIONAL_TIER_500_RULE_ID,
            outcome: 'cancelled',
            reason: `total redescendu à ${total.toFixed(2)} € après remise de volume, sous le seuil de ${CONDITIONAL_TIER_500_THRESHOLD} €`,
          },
        ],
      };
    }

    return { outcome: 'applied', state: discounted, reason };
  },
};
