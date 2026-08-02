/**
 * Chargement du dataset : parsing, normalisation, indexation, intégrité
 * référentielle.
 *
 * Les JSON sont importés **statiquement** (`resolveJsonModule`) : le même code
 * fonctionne sous Vite, Vitest et tsx, sans `fs` ni `fetch`. Les fichiers de
 * `data/` restent strictement en lecture seule.
 *
 * Politique d'échec, volontairement asymétrique :
 * - structure invalide → `InvalidDataError` (on ne peut rien en faire) ;
 * - identifiant dupliqué → `DuplicateIdError` (résolution ambiguë) ;
 * - référence inconnue → `DataIssue` de sévérité `error`, la donnée est
 *   **conservée** et le chargement aboutit. C'est au calcul métier concerné de
 *   décider : rapport partiel pour l'historique, erreur pour le pricing.
 */

import customersJson from '../../../data/customers.json';
import ordersJson from '../../../data/orders.json';
import productsJson from '../../../data/products.json';
import { DuplicateIdError } from '../../domain/errors';
import type { Customer, Dataset, Order, Product } from '../../domain/model';
import type { DataIssue, DataIssueEntity } from './dataIssues';
import { createDataIssue } from './dataIssues';
import { normalizeCustomers, normalizeOrders, normalizeProducts } from './normalizeData';
import { parseCustomersFile, parseOrdersFile, parseProductsFile } from './schemas';

export interface DataIndexes {
  readonly customersById: ReadonlyMap<string, Customer>;
  readonly productsById: ReadonlyMap<string, Product>;
  readonly ordersById: ReadonlyMap<string, Order>;
}

export interface LoadedData {
  readonly dataset: Dataset;
  readonly indexes: DataIndexes;
  readonly issues: readonly DataIssue[];
}

/**
 * Indexe par identifiant en refusant les doublons : choisir « le premier
 * gagne » ou « le dernier gagne » masquerait une ambiguïté de données.
 */
export function indexById<T extends { readonly id: string }>(
  items: readonly T[],
  entity: DataIssueEntity,
): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    if (index.has(item.id)) {
      throw new DuplicateIdError(entity, item.id);
    }
    index.set(item.id, item);
  }
  return index;
}

/**
 * Signale les commandes pointant vers un client ou un produit absent des
 * référentiels. L'anomalie est portée par la commande : c'est elle qui devient
 * partiellement inexploitable.
 */
export function checkReferentialIntegrity(
  orders: readonly Order[],
  customersById: ReadonlyMap<string, Customer>,
  productsById: ReadonlyMap<string, Product>,
): readonly DataIssue[] {
  const issues: DataIssue[] = [];

  for (const order of orders) {
    if (!customersById.has(order.customerId)) {
      issues.push(
        createDataIssue({
          code: 'UNKNOWN_CUSTOMER_REFERENCE',
          entity: 'order',
          entityId: order.id,
          field: 'customerId',
          message: `Commande rattachée à un client inexistant ("${order.customerId}").`,
          rawValue: order.customerId,
        }),
      );
    }

    order.items.forEach((item, position) => {
      if (!productsById.has(item.productId)) {
        issues.push(
          createDataIssue({
            code: 'UNKNOWN_PRODUCT_REFERENCE',
            entity: 'order',
            entityId: order.id,
            field: `items[${position}].productId`,
            message: `Ligne de commande rattachée à un produit inexistant ("${item.productId}").`,
            rawValue: item.productId,
          }),
        );
      }
    });
  }

  return issues;
}

export interface RawDataFiles {
  readonly customers: unknown;
  readonly products: unknown;
  readonly orders: unknown;
}

/**
 * Pipeline complet, sans effet de bord ni accès au système de fichiers : les
 * tests peuvent l'appeler avec n'importe quel jeu de données.
 */
export function buildDataset(files: RawDataFiles): LoadedData {
  const customers = normalizeCustomers(parseCustomersFile(files.customers));
  const products = normalizeProducts(parseProductsFile(files.products));
  const orders = normalizeOrders(parseOrdersFile(files.orders));

  const customersById = indexById(customers.values, 'customer');
  const productsById = indexById(products.values, 'product');
  const ordersById = indexById(orders.values, 'order');

  const referentialIssues = checkReferentialIntegrity(orders.values, customersById, productsById);

  return {
    dataset: {
      customers: customers.values,
      products: products.values,
      orders: orders.values,
    },
    indexes: { customersById, productsById, ordersById },
    issues: [...customers.issues, ...products.issues, ...orders.issues, ...referentialIssues],
  };
}

let cache: LoadedData | null = null;

/**
 * Dataset fourni avec le test technique. Mémoïsé : les JSON sont validés une
 * seule fois, quel que soit le nombre de rendus React ou d'appels CLI.
 */
export function loadData(): LoadedData {
  cache ??= buildDataset({
    customers: customersJson,
    products: productsJson,
    orders: ordersJson,
  });
  return cache;
}
