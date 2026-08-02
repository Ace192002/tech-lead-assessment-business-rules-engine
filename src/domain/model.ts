/**
 * Modèles métier normalisés.
 *
 * Ce module est volontairement dépourvu de toute dépendance : ni React, ni
 * Zod, ni Node.js. Il décrit les entités telles que la logique métier les
 * manipule, une fois les données brutes validées et normalisées par la couche
 * infrastructure.
 *
 * Conventions :
 * - nommage camelCase (les JSON sources sont en snake_case) ;
 * - les dates sont des `Date` déjà parsées, plus des chaînes ;
 * - les prix sont des `number`, jamais des chaînes ;
 * - tout est en lecture seule : aucune règle métier ne doit muter le dataset.
 */

export const CUSTOMER_TYPES = ['Standard', 'Premium', 'VIP', 'Unknown'] as const;

/**
 * `Unknown` n'est pas une valeur présente dans les données sources : c'est la
 * valeur de repli explicite pour un type absent, vide ou non reconnu.
 */
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly type: CustomerType;
  readonly registrationDate: Date;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly categories: readonly string[];
}

export interface OrderItem {
  /**
   * Peut désigner un produit absent du catalogue : la référence inconnue est
   * conservée telle quelle et signalée par un `DataIssue`, jamais supprimée.
   */
  readonly productId: string;
  readonly quantity: number;
}

export interface Order {
  readonly id: string;
  /** Peut désigner un client absent du référentiel (cf. `OrderItem.productId`). */
  readonly customerId: string;
  readonly orderDate: Date;
  readonly status: string;
  readonly expressDelivery: boolean;
  readonly items: readonly OrderItem[];
}

export interface Dataset {
  readonly customers: readonly Customer[];
  readonly products: readonly Product[];
  readonly orders: readonly Order[];
}
