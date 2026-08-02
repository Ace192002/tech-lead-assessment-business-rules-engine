/**
 * Famille 2 — règles conditionnelles, évaluées sur le montant obtenu
 * immédiatement après les règles de base.
 *
 * ## Pourquoi le palier 1000 passe AVANT le palier 500
 *
 * Les deux seuils doivent être testés sur le **même** instantané : celui qui
 * suit les règles de base, avant taxe et avant remise cumulative. Le moteur
 * exécute les règles en priorité croissante, donc la première règle
 * conditionnelle rencontrée voit exactement cet instantané.
 *
 * Si le palier 500 passait d'abord, le palier 1000 verrait un montant déjà
 * réduit de 5 % et devrait le « dé-réduire » pour retrouver l'instantané — soit
 * précisément l'inversion mathématique que ce projet refuse.
 *
 * En plaçant le palier 1000 d'abord :
 * - au-dessus de 1000 €, il s'applique et demande le **remplacement** du palier
 *   500, que le moteur désactive avant de rejouer depuis l'état brut ;
 * - en dessous, il est ignoré sans toucher à l'état, si bien que le palier 500
 *   voit à son tour l'instantané intact.
 *
 * Aucune commande ne peut donc cumuler −5 % et −8 %.
 */

import type { PricingContext, PricingRule } from '../types';
import { scaleLines } from './lineOperations';

export const CONDITIONAL_TIER_500_RULE_ID = 'conditional-tier-500';
export const CONDITIONAL_TIER_1000_RULE_ID = 'conditional-tier-1000';

export const CONDITIONAL_TIER_500_THRESHOLD = 500;
export const CONDITIONAL_TIER_500_RATE = 0.05;
export const CONDITIONAL_TIER_1000_THRESHOLD = 1000;
export const CONDITIONAL_TIER_1000_RATE = 0.08;

function totalOf(lines: readonly { readonly amount: number }[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

export const conditionalTier1000Rule: PricingRule<PricingContext> = {
  id: CONDITIONAL_TIER_1000_RULE_ID,
  label: `Montant après remises de base > ${CONDITIONAL_TIER_1000_THRESHOLD} € : −8 %`,
  family: 'conditional',
  priority: 210,
  evaluate: (_context, state) => {
    // Aucun ajustement de commande n'existe encore à ce stade : le total des
    // lignes est l'instantané d'après règles de base.
    const afterBaseRules = totalOf(state.lines);

    if (afterBaseRules <= CONDITIONAL_TIER_1000_THRESHOLD) {
      return {
        outcome: 'skipped',
        reason: `montant après remises de base ${afterBaseRules.toFixed(2)} € ≤ ${CONDITIONAL_TIER_1000_THRESHOLD} €`,
      };
    }

    return {
      outcome: 'applied',
      state: scaleLines(state, 1 - CONDITIONAL_TIER_1000_RATE),
      reason: `montant après remises de base ${afterBaseRules.toFixed(2)} € > ${CONDITIONAL_TIER_1000_THRESHOLD} €`,
      cancellations: [
        {
          ruleId: CONDITIONAL_TIER_500_RULE_ID,
          outcome: 'replaced',
          reason: `remplacée par le palier ${CONDITIONAL_TIER_1000_THRESHOLD} € (−8 %)`,
        },
      ],
    };
  },
};

export const conditionalTier500Rule: PricingRule<PricingContext> = {
  id: CONDITIONAL_TIER_500_RULE_ID,
  label: `Montant après remises de base > ${CONDITIONAL_TIER_500_THRESHOLD} € : −5 %`,
  family: 'conditional',
  priority: 220,
  evaluate: (_context, state) => {
    const afterBaseRules = totalOf(state.lines);

    if (afterBaseRules <= CONDITIONAL_TIER_500_THRESHOLD) {
      return {
        outcome: 'skipped',
        reason: `montant après remises de base ${afterBaseRules.toFixed(2)} € ≤ ${CONDITIONAL_TIER_500_THRESHOLD} €`,
      };
    }

    return {
      outcome: 'applied',
      state: scaleLines(state, 1 - CONDITIONAL_TIER_500_RATE),
      reason: `montant après remises de base ${afterBaseRules.toFixed(2)} € > ${CONDITIONAL_TIER_500_THRESHOLD} €`,
    };
  },
};
