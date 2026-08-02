/**
 * Types du rapport d'historique client (Question 1).
 *
 * Aucune dépendance à l'infrastructure : le domaine ignore l'existence de
 * `DataIssue`. Le rapport expose `amount: null`, `missingProductIds` et
 * `isPartial`, ce qui suffit à la CLI et à l'interface pour rapprocher ces
 * informations des anomalies produites par le chargement.
 */

import type { Customer, CustomerType, Order, Product } from '../model';
import type { DateWindow } from './periods';

export type RhythmKind = 'regular' | 'occasional';
export type PeriodGrouping = 'week' | 'month';

/**
 * Écart d'une commande à la moyenne du client.
 * `null` au niveau de la commande lorsqu'aucune comparaison n'a de sens.
 */
export interface OrderAnomaly {
  /** `|montant − moyenne| / moyenne × 100`, arrondi à 2 décimales. */
  readonly deviationPercent: number;
  /** Vrai uniquement si l'écart dépasse **strictement** le seuil. */
  readonly isAnomaly: boolean;
}

export interface HistoryOrder {
  readonly orderId: string;
  readonly orderDate: Date;
  readonly status: string;
  /** `null` si la commande contient au moins un produit inconnu. */
  readonly amount: number | null;
  /** Catégories des produits connus, dédupliquées, ordre stable. */
  readonly categories: readonly string[];
  readonly missingProductIds: readonly string[];
  /** `null` si le montant est incalculable ou si aucune moyenne n'est établie. */
  readonly anomaly: OrderAnomaly | null;
}

export interface HistoryPeriod {
  /** `2024-06` pour un mois, `2024-W24` pour une semaine ISO. */
  readonly key: string;
  readonly start: Date;
  readonly end: Date;
  /** Toutes les commandes de la période, y compris celles non chiffrables. */
  readonly orderCount: number;
  readonly pricedOrderCount: number;
  /** Somme des montants chiffrables ; `0` si aucun. */
  readonly totalAmount: number;
  /** `null` si aucune commande chiffrable. */
  readonly averageAmount: number | null;
  /** Vrai si au moins une commande de la période n'est pas chiffrable. */
  readonly isPartial: boolean;
  /** Évolution du `totalAmount` face à la période précédente ; `null` si non comparable. */
  readonly evolutionPercent: number | null;
  readonly orders: readonly HistoryOrder[];
}

export interface CustomerHistoryReport {
  readonly customer: {
    readonly id: string;
    readonly name: string;
    readonly type: CustomerType;
  };
  readonly window: DateWindow;
  readonly rhythm: {
    readonly kind: RhythmKind;
    readonly averageOrdersPerMonth: number;
    readonly grouping: PeriodGrouping;
  };
  /** Moyenne des commandes chiffrables de la fenêtre ; `null` si aucune. */
  readonly customerAverageAmount: number | null;
  readonly periods: readonly HistoryPeriod[];
}

export interface GenerateCustomerHistoryParams {
  readonly customerId: string;
  readonly customersById: ReadonlyMap<string, Customer>;
  readonly productsById: ReadonlyMap<string, Product>;
  readonly orders: readonly Order[];
  /**
   * Injectable pour les tests. Par défaut : date de commande la plus récente de
   * **tout** le dataset, jamais celle du seul client demandé.
   */
  readonly referenceDate?: Date;
  /** Seuil d'anomalie en pourcentage ; 50 par défaut. */
  readonly anomalyThresholdPercent?: number;
}
