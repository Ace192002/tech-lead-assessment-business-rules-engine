/**
 * Calcul du prix d'une commande (Question 2).
 *
 * Ne dépend ni de `loadData`, ni de Zod, ni de React : uniquement des modèles
 * normalisés et du moteur générique.
 *
 * Contrairement à la Question 1, aucune référence inconnue n'est tolérée ici :
 * un prix partiel serait faux sans que rien ne le signale. Client ou produit
 * absent lève donc une erreur explicite.
 */

import { UnknownCustomerError, UnknownOrderError, UnknownProductError } from '../errors';
import type { Customer, Order, Product } from '../model';
import { roundToTwoDecimals } from '../rounding';
import { getPricingStateTotal, runPricingRules } from './engine';
import { PRICING_RULES } from './rules';
import type {
  OrderPricingResult,
  PricedOrderLine,
  PricingContext,
  PricingLine,
  PricingRule,
  PricingState,
  RuleTraceEntry,
} from './types';

export interface CalculateOrderPriceInput {
  readonly orderId: string;
  readonly orders: readonly Order[];
  readonly customersById: ReadonlyMap<string, Customer>;
  readonly productsById: ReadonlyMap<string, Product>;
  /** Registre alternatif, utile aux tests et aux futures promotions. */
  readonly rules?: readonly PricingRule<PricingContext>[];
}

/**
 * Première commande du client dans son mois calendaire **UTC**.
 *
 * Aucun statut n'est filtré : l'énoncé ne le demande pas. À date et heure
 * strictement identiques, l'identifiant de commande croissant départage, ce qui
 * rend le résultat déterministe.
 */
function isFirstOrderOfMonth(order: Order, orders: readonly Order[]): boolean {
  const year = order.orderDate.getUTCFullYear();
  const month = order.orderDate.getUTCMonth();

  for (const candidate of orders) {
    if (candidate.customerId !== order.customerId || candidate.id === order.id) {
      continue;
    }
    if (
      candidate.orderDate.getUTCFullYear() !== year ||
      candidate.orderDate.getUTCMonth() !== month
    ) {
      continue;
    }

    const delta = candidate.orderDate.getTime() - order.orderDate.getTime();
    if (delta < 0 || (delta === 0 && candidate.id < order.id)) {
      return false;
    }
  }

  return true;
}

function buildInitialState(order: Order, productsById: ReadonlyMap<string, Product>): PricingState {
  const lines: PricingLine[] = order.items.map((item) => {
    const product = productsById.get(item.productId);
    if (product === undefined) {
      throw new UnknownProductError(item.productId, order.id);
    }

    const baseAmount = product.price * item.quantity;
    return {
      productId: product.id,
      quantity: item.quantity,
      unitPrice: product.price,
      categories: product.categories,
      baseAmount,
      amount: baseAmount,
    };
  });

  return { lines, adjustments: [] };
}

/** L'arrondi n'intervient qu'ici : l'état interne reste en pleine précision. */
function toPricedLine(line: PricingLine): PricedOrderLine {
  return {
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    categories: line.categories,
    baseAmount: roundToTwoDecimals(line.baseAmount),
    finalAmount: roundToTwoDecimals(line.amount),
  };
}

function toRoundedTrace(entry: RuleTraceEntry): RuleTraceEntry {
  return {
    ...entry,
    amountBefore: roundToTwoDecimals(entry.amountBefore),
    amountAfter: roundToTwoDecimals(entry.amountAfter),
    impact: roundToTwoDecimals(entry.impact),
  };
}

export function calculateOrderPrice(input: CalculateOrderPriceInput): OrderPricingResult {
  const { orderId, orders, customersById, productsById, rules = PRICING_RULES } = input;

  const order = orders.find((candidate) => candidate.id === orderId);
  if (order === undefined) {
    throw new UnknownOrderError(orderId);
  }

  const customer = customersById.get(order.customerId);
  if (customer === undefined) {
    throw new UnknownCustomerError(order.customerId);
  }

  const initialState = buildInitialState(order, productsById);
  const context: PricingContext = {
    order,
    customer,
    isFirstOrderOfMonth: isFirstOrderOfMonth(order, orders),
  };

  const result = runPricingRules({ context, rules, initialState });

  const basePrice = initialState.lines.reduce((sum, line) => sum + line.baseAmount, 0);

  return {
    orderId: order.id,
    customerId: order.customerId,
    basePrice: roundToTwoDecimals(basePrice),
    finalPrice: roundToTwoDecimals(getPricingStateTotal(result.state)),
    lines: result.state.lines.map(toPricedLine),
    adjustments: result.state.adjustments,
    trace: result.trace.map(toRoundedTrace),
    iterations: result.iterations,
  };
}
