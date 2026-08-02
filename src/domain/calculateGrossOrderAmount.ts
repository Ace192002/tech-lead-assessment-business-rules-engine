/**
 * Résolution d'une commande contre le catalogue produit.
 *
 * Placé directement dans `domain/` et non dans `domain/pricing/` : la Question 1
 * et la Question 2 en ont toutes deux besoin. Un import
 * `customer-history -> pricing` laisserait croire que l'historique dépend du
 * moteur de règles, alors que les deux questions sont indépendantes. Les deux
 * features pointent vers ce module neutre, jamais l'une vers l'autre.
 *
 * Montant **brut** exclusivement : aucune remise, aucune taxe, aucun frais de
 * livraison. Toutes les règles de pricing relèvent de la Question 2.
 */

import type { Order, Product } from './model';

export interface GrossOrderAmountResult {
  /** `null` dès qu'au moins un produit de la commande est inconnu. */
  readonly amount: number | null;
  /** Références manquantes, dédupliquées, dans l'ordre de première apparition. */
  readonly missingProductIds: readonly string[];
}

/**
 * Arrondi commercial à deux décimales, appliqué aux montants et aux
 * pourcentages exposés.
 *
 * `Number.EPSILON` compense la représentation binaire des flottants : sans lui,
 * `1.005 * 100` vaut `100.49999999999999` et s'arrondirait à `1.00`. Une
 * bibliothèque décimale serait disproportionnée pour ce test, mais les calculs
 * restent en pleine précision et l'arrondi n'intervient qu'à l'exposition.
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Montant brut = somme des `prix × quantité`.
 *
 * Un produit inconnu ne peut pas être ignoré silencieusement : il rendrait le
 * total *partiel* et donc faux, sans que rien ne le signale. La commande entière
 * devient donc non chiffrable (`amount: null`), et les références fautives sont
 * retournées pour que l'appelant puisse les rapprocher des `DataIssue` émis par
 * le chargement.
 */
export function calculateGrossOrderAmount(
  order: Order,
  productsById: ReadonlyMap<string, Product>,
): GrossOrderAmountResult {
  const missingProductIds: string[] = [];
  let total = 0;

  for (const item of order.items) {
    const product = productsById.get(item.productId);

    if (product === undefined) {
      if (!missingProductIds.includes(item.productId)) {
        missingProductIds.push(item.productId);
      }
      continue;
    }

    total += product.price * item.quantity;
  }

  return {
    amount: missingProductIds.length > 0 ? null : roundToTwoDecimals(total),
    missingProductIds,
  };
}

/**
 * Union sans doublon des catégories des produits **connus** de la commande.
 *
 * L'ordre suit la première apparition : items dans leur ordre d'origine, puis
 * catégories dans l'ordre déclaré par le produit. Un ordre stable rend
 * l'affichage et les tests déterministes.
 */
export function collectOrderCategories(
  order: Order,
  productsById: ReadonlyMap<string, Product>,
): string[] {
  const categories: string[] = [];

  for (const item of order.items) {
    const product = productsById.get(item.productId);
    if (product === undefined) {
      continue;
    }
    for (const category of product.categories) {
      if (!categories.includes(category)) {
        categories.push(category);
      }
    }
  }

  return categories;
}
