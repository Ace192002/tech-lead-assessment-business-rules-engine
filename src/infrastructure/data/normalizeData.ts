/**
 * Normalisation explicite des données brutes vers les modèles métier.
 *
 * Chaque écart entre la donnée source et le modèle normalisé produit un
 * `DataIssue` : rien n'est corrigé silencieusement. C'est la contrepartie de
 * l'interdiction de modifier les JSON sources — toute la politique de données
 * vit ici, sous test.
 *
 * Ce module ne connaît pas les autres entités : l'intégrité référentielle
 * (client ou produit inexistant) est contrôlée dans `loadData.ts`, qui dispose
 * des index.
 */

import { InvalidDataError } from '../../domain/errors';
import type { Customer, CustomerType, Order, OrderItem, Product } from '../../domain/model';
import type { DataIssue } from './dataIssues';
import { createDataIssue } from './dataIssues';
import type { RawCustomer, RawOrder, RawProduct } from './schemas';

/**
 * Table de correspondance vers les valeurs canoniques du référentiel.
 * La comparaison se fait en minuscules, ce qui absorbe `"premium"` (C007).
 */
const CANONICAL_CUSTOMER_TYPE_BY_LOWERCASE: Readonly<Record<string, CustomerType>> = {
  standard: 'Standard',
  premium: 'Premium',
  vip: 'VIP',
};

export interface NormalizationResult<T> {
  readonly values: readonly T[];
  readonly issues: readonly DataIssue[];
}

function normalizeCustomerType(
  raw: RawCustomer,
): { type: CustomerType; issue: DataIssue | null } {
  const rawType = raw.type;

  if (rawType === undefined || rawType.trim() === '') {
    return {
      type: 'Unknown',
      issue: createDataIssue({
        code: 'CUSTOMER_TYPE_MISSING',
        entity: 'customer',
        entityId: raw.id,
        field: 'type',
        message:
          rawType === undefined
            ? `Type client absent : normalisé en "Unknown".`
            : `Type client vide : normalisé en "Unknown".`,
        rawValue: rawType,
      }),
    };
  }

  const canonical = CANONICAL_CUSTOMER_TYPE_BY_LOWERCASE[rawType.trim().toLowerCase()];

  if (canonical === undefined) {
    return {
      type: 'Unknown',
      issue: createDataIssue({
        code: 'CUSTOMER_TYPE_UNRECOGNIZED',
        entity: 'customer',
        entityId: raw.id,
        field: 'type',
        message: `Type client hors référentiel : normalisé en "Unknown".`,
        rawValue: rawType,
      }),
    };
  }

  if (canonical !== rawType) {
    return {
      type: canonical,
      issue: createDataIssue({
        code: 'CUSTOMER_TYPE_NORMALIZED',
        entity: 'customer',
        entityId: raw.id,
        field: 'type',
        message: `Type client normalisé en "${canonical}".`,
        rawValue: rawType,
      }),
    };
  }

  return { type: canonical, issue: null };
}

export function normalizeCustomers(rawCustomers: readonly RawCustomer[]): NormalizationResult<Customer> {
  const values: Customer[] = [];
  const issues: DataIssue[] = [];

  for (const raw of rawCustomers) {
    const { type, issue } = normalizeCustomerType(raw);
    if (issue !== null) {
      issues.push(issue);
    }
    values.push({
      id: raw.id,
      name: raw.name,
      email: raw.email,
      type,
      registrationDate: new Date(`${raw.registration_date}T00:00:00Z`),
    });
  }

  return { values, issues };
}

export function normalizeProducts(rawProducts: readonly RawProduct[]): NormalizationResult<Product> {
  const values: Product[] = [];
  const issues: DataIssue[] = [];

  for (const raw of rawProducts) {
    let price: number;

    if (typeof raw.price === 'number') {
      price = raw.price;
    } else {
      price = Number(raw.price);
      // Le schéma garantit déjà une chaîne numérique ; ce garde-fou protège
      // les appels directs à la normalisation, hors validation.
      if (!Number.isFinite(price)) {
        throw new InvalidDataError('products.json', [
          `${raw.id}.price : prix non convertible en nombre (${JSON.stringify(raw.price)})`,
        ]);
      }
      issues.push(
        createDataIssue({
          code: 'PRODUCT_PRICE_COERCED',
          entity: 'product',
          entityId: raw.id,
          field: 'price',
          message: `Prix stocké en chaîne : converti en nombre (${price}).`,
          rawValue: raw.price,
        }),
      );
    }

    values.push({
      id: raw.id,
      name: raw.name,
      price,
      categories: raw.categories,
    });
  }

  return { values, issues };
}

export function normalizeOrders(rawOrders: readonly RawOrder[]): NormalizationResult<Order> {
  const values: Order[] = [];
  const issues: DataIssue[] = [];

  for (const raw of rawOrders) {
    let expressDelivery: boolean;

    if (raw.express_delivery === undefined) {
      expressDelivery = false;
      issues.push(
        createDataIssue({
          code: 'ORDER_EXPRESS_DEFAULTED',
          entity: 'order',
          entityId: raw.order_id,
          field: 'expressDelivery',
          message: `Livraison express non renseignée : normalisée en false.`,
          rawValue: raw.express_delivery,
        }),
      );
    } else {
      expressDelivery = raw.express_delivery;
    }

    const items: OrderItem[] = raw.items.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
    }));

    values.push({
      id: raw.order_id,
      customerId: raw.customer_id,
      orderDate: new Date(raw.order_date),
      status: raw.status,
      expressDelivery,
      items,
    });
  }

  return { values, issues };
}
