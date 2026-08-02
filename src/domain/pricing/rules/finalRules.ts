/**
 * Famille 5 — règles finales, seuls ajustements fixes au niveau de la commande.
 *
 * Ni la livraison express ni les frais de traitement ne sont répartis sur les
 * lignes : ce ne sont pas des prix produit. Ils vivent dans `adjustments`.
 *
 * L'ordre compte : les frais de traitement s'évaluent **après** l'ajout des
 * 15 € de livraison, comme dans l'énoncé. Une commande à 40 € passée en express
 * atteint 55 € et échappe donc aux frais.
 */

import { getPricingStateTotal } from '../engine';
import type { PricingContext, PricingRule } from '../types';

export const EXPRESS_DELIVERY_RULE_ID = 'final-express-delivery';
export const PROCESSING_FEE_RULE_ID = 'final-processing-fee';

export const EXPRESS_DELIVERY_FEE = 15;
export const PROCESSING_FEE = 5;
export const PROCESSING_FEE_THRESHOLD = 50;

export const expressDeliveryRule: PricingRule<PricingContext> = {
  id: EXPRESS_DELIVERY_RULE_ID,
  label: `Livraison express +${EXPRESS_DELIVERY_FEE} €`,
  family: 'final',
  priority: 510,
  evaluate: (context, state) => {
    if (!context.order.expressDelivery) {
      return { outcome: 'skipped', reason: 'livraison standard' };
    }

    return {
      outcome: 'applied',
      state: {
        ...state,
        adjustments: [
          ...state.adjustments,
          {
            ruleId: EXPRESS_DELIVERY_RULE_ID,
            label: 'Livraison express',
            amount: EXPRESS_DELIVERY_FEE,
          },
        ],
      },
      reason: 'livraison express demandée',
    };
  },
};

export const processingFeeRule: PricingRule<PricingContext> = {
  id: PROCESSING_FEE_RULE_ID,
  label: `Frais de traitement +${PROCESSING_FEE} € sous ${PROCESSING_FEE_THRESHOLD} €`,
  family: 'final',
  priority: 520,
  evaluate: (_context, state) => {
    const total = getPricingStateTotal(state);

    if (total >= PROCESSING_FEE_THRESHOLD) {
      return {
        outcome: 'skipped',
        reason: `total ${total.toFixed(2)} € ≥ ${PROCESSING_FEE_THRESHOLD} €`,
      };
    }

    return {
      outcome: 'applied',
      state: {
        ...state,
        adjustments: [
          ...state.adjustments,
          { ruleId: PROCESSING_FEE_RULE_ID, label: 'Frais de traitement', amount: PROCESSING_FEE },
        ],
      },
      reason: `total ${total.toFixed(2)} € < ${PROCESSING_FEE_THRESHOLD} €`,
    };
  },
};
