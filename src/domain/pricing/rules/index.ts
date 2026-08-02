/**
 * Registre ordonné des règles de pricing.
 *
 * L'ordre déclaré ici suit les cinq familles de l'énoncé ; c'est néanmoins la
 * **priorité** de chaque règle qui fait foi pour le moteur. L'énoncé annonce que
 * ces règles changent régulièrement : ajouter une promotion saisonnière revient
 * à écrire une règle et à l'insérer ici avec la priorité voulue, sans toucher au
 * moteur.
 *
 *   110–130  base         remises client et première commande du mois
 *   210–220  conditional  paliers 1000 € puis 500 € (cf. conditionalRules.ts)
 *   310–320  category     taxes Électronique puis Alimentaire
 *   410      cumulative   remise de volume, et annulation du palier 500 €
 *   510–520  final        livraison express puis frais de traitement
 */

import type { PricingContext, PricingRule } from '../types';
import { firstOrderOfMonthRule, premiumDiscountRule, vipDiscountRule } from './baseRules';
import { electronicsTaxRule, foodTaxRule } from './categoryRules';
import { conditionalTier1000Rule, conditionalTier500Rule } from './conditionalRules';
import { cumulativeVolumeDiscountRule } from './cumulativeRules';
import { expressDeliveryRule, processingFeeRule } from './finalRules';

export const PRICING_RULES: readonly PricingRule<PricingContext>[] = [
  premiumDiscountRule,
  vipDiscountRule,
  firstOrderOfMonthRule,
  conditionalTier1000Rule,
  conditionalTier500Rule,
  electronicsTaxRule,
  foodTaxRule,
  cumulativeVolumeDiscountRule,
  expressDeliveryRule,
  processingFeeRule,
];

export * from './baseRules';
export * from './categoryRules';
export * from './conditionalRules';
export * from './cumulativeRules';
export * from './finalRules';
