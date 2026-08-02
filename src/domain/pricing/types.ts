/**
 * Types du moteur de règles de pricing (Question 2).
 *
 * L'état est **orienté lignes** : les taxes par catégorie et la remise de
 * volume s'appliquent produit par produit, pas sur un montant global. Le total
 * n'est jamais stocké — il est dérivé des lignes et des ajustements, ce qui rend
 * impossible toute divergence entre l'affichage et le contenu réel de l'état.
 */

import type { Customer, Order } from '../model';

export interface PricingLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly categories: readonly string[];
  /** Montant brut de la ligne, jamais modifié : sert de référence aux règles. */
  readonly baseAmount: number;
  /** Montant courant de la ligne, transformé par les règles en pourcentage. */
  readonly amount: number;
}

/** Montant fixe au niveau de la commande (livraison express, frais de traitement). */
export interface OrderAdjustment {
  readonly ruleId: string;
  readonly label: string;
  readonly amount: number;
}

export interface PricingState {
  readonly lines: readonly PricingLine[];
  readonly adjustments: readonly OrderAdjustment[];
}

export type RuleFamily = 'base' | 'conditional' | 'category' | 'cumulative' | 'final';

export type RuleOutcome = 'applied' | 'skipped' | 'cancelled' | 'replaced';

/** Désactivation d'une règle antérieure, demandée par une règle plus tardive. */
export interface RuleCancellation {
  readonly ruleId: string;
  /** `replaced` quand une règle en remplace une autre du même groupe exclusif. */
  readonly outcome: 'cancelled' | 'replaced';
  readonly reason: string;
}

export type RuleEvaluation =
  | {
      readonly outcome: 'skipped';
      readonly reason: string;
    }
  | {
      readonly outcome: 'applied';
      /** Nouvel état ; l'état reçu ne doit jamais être muté. */
      readonly state: PricingState;
      readonly reason?: string;
      readonly cancellations?: readonly RuleCancellation[];
    };

/**
 * Générique sur le contexte : le moteur ne connaît ni la commande, ni le client,
 * ni le catalogue. Seules les règles métier les manipuleront.
 */
export interface PricingRule<TContext> {
  readonly id: string;
  readonly label: string;
  readonly family: RuleFamily;
  /** Priorité croissante ; à égalité, l'ordre de déclaration est conservé. */
  readonly priority: number;
  /**
   * `appliedRuleIds` liste les règles déjà appliquées **dans le passage
   * courant**. Une règle qui veut en annuler une autre doit pouvoir vérifier
   * que celle-ci était réellement active : sans cette information, la remise
   * cumulative annulerait un palier conditionnel qui n'avait jamais été
   * appliqué, et la trace afficherait « annulée » au lieu de « ignorée ».
   * Les règles qui n'en ont pas besoin peuvent omettre le paramètre.
   *
   * Syntaxe propriété (et non méthode) à dessein : les paramètres de méthode
   * sont bivariants en TypeScript, ce qui permettrait à une implémentation de
   * re-déclarer `appliedRuleIds: Set<string>` et de muter l'état interne du
   * moteur. En propriété, `strictFunctionTypes` rend le paramètre contravariant
   * et rejette cette re-déclaration à la compilation.
   */
  readonly evaluate: (
    context: TContext,
    state: PricingState,
    appliedRuleIds: ReadonlySet<string>,
  ) => RuleEvaluation;
}

export interface RuleTraceEntry {
  readonly ruleId: string;
  readonly label: string;
  readonly family: RuleFamily;
  readonly priority: number;
  /**
   * Passage au cours duquel le sort de la règle a été décidé : le passage
   * stable pour `applied`/`skipped`, le passage de la désactivation pour
   * `cancelled`/`replaced`.
   */
  readonly iteration: number;
  readonly outcome: RuleOutcome;
  readonly amountBefore: number;
  readonly amountAfter: number;
  /** `amountAfter − amountBefore` ; toujours 0 pour une règle désactivée. */
  readonly impact: number;
  readonly reason?: string;
}

export interface RuleEngineResult {
  readonly state: PricingState;
  /** Trace du passage stable uniquement, dans l'ordre d'exécution réel. */
  readonly trace: readonly RuleTraceEntry[];
  readonly iterations: number;
  readonly disabledRuleIds: readonly string[];
}

// --- Contexte et sortie métier de calculateOrderPrice -------------------------

/**
 * Tout ce dont les règles de l'énoncé ont besoin, et rien de plus : ni
 * catalogue, ni index — les lignes portent déjà prix unitaire et catégories.
 */
export interface PricingContext {
  readonly order: Order;
  readonly customer: Customer;
  readonly isFirstOrderOfMonth: boolean;
}

export interface PricedOrderLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly categories: readonly string[];
  /** Montant brut : `unitPrice × quantity`. */
  readonly baseAmount: number;
  /** Montant après remises et taxes propres à la ligne, arrondi. */
  readonly finalAmount: number;
}

export interface OrderPricingResult {
  readonly orderId: string;
  readonly customerId: string;
  readonly basePrice: number;
  readonly finalPrice: number;
  readonly lines: readonly PricedOrderLine[];
  /** Montants fixes de commande : livraison express, frais de traitement. */
  readonly adjustments: readonly OrderAdjustment[];
  readonly trace: readonly RuleTraceEntry[];
  readonly iterations: number;
}
