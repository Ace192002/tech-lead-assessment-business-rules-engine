/**
 * Famille 1 — règles de base, appliquées sur le prix brut.
 *
 * Les remises sont **multiplicatives et séquentielles** : Premium puis première
 * commande du mois donnent ×0,90 puis ×0,95, soit ×0,855 — et non une remise
 * additive de 15 %.
 */

import type { PricingContext, PricingRule } from '../types';
import { scaleLines } from './lineOperations';

export const PREMIUM_RULE_ID = 'base-premium';
export const VIP_RULE_ID = 'base-vip';
export const FIRST_ORDER_OF_MONTH_RULE_ID = 'base-first-order-of-month';

export const PREMIUM_DISCOUNT_RATE = 0.1;
export const VIP_DISCOUNT_RATE = 0.15;
export const FIRST_ORDER_OF_MONTH_DISCOUNT_RATE = 0.05;

export const premiumDiscountRule: PricingRule<PricingContext> = {
  id: PREMIUM_RULE_ID,
  label: 'Client Premium −10 %',
  family: 'base',
  priority: 110,
  evaluate: (context, state) => {
    if (context.customer.type !== 'Premium') {
      return {
        outcome: 'skipped',
        reason: `client de type « ${context.customer.type} », non Premium`,
      };
    }
    return {
      outcome: 'applied',
      state: scaleLines(state, 1 - PREMIUM_DISCOUNT_RATE),
      reason: 'client Premium',
    };
  },
};

export const vipDiscountRule: PricingRule<PricingContext> = {
  id: VIP_RULE_ID,
  label: 'Client VIP −15 %',
  family: 'base',
  priority: 120,
  evaluate: (context, state) => {
    if (context.customer.type !== 'VIP') {
      // Le modèle normalisé n'admet qu'un seul type client : l'exclusivité
      // Premium / VIP de l'énoncé est structurelle, pas conditionnelle.
      return {
        outcome: 'skipped',
        reason:
          context.customer.type === 'Premium'
            ? 'client Premium : la remise VIP est exclusive de la remise Premium'
            : `client de type « ${context.customer.type} », non VIP`,
      };
    }
    return {
      outcome: 'applied',
      state: scaleLines(state, 1 - VIP_DISCOUNT_RATE),
      reason: 'client VIP',
    };
  },
};

export const firstOrderOfMonthRule: PricingRule<PricingContext> = {
  id: FIRST_ORDER_OF_MONTH_RULE_ID,
  label: 'Première commande du mois −5 %',
  family: 'base',
  priority: 130,
  evaluate: (context, state) => {
    if (!context.isFirstOrderOfMonth) {
      return {
        outcome: 'skipped',
        reason: 'le client a déjà commandé plus tôt dans le mois',
      };
    }
    return {
      outcome: 'applied',
      state: scaleLines(state, 1 - FIRST_ORDER_OF_MONTH_DISCOUNT_RATE),
      reason: 'première commande du mois calendaire',
    };
  },
};
