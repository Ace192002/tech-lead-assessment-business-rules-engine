/**
 * Rapport d'historique client par périodes dynamiques (Question 1).
 *
 * Frontières : ce module n'importe ni React, ni Zod, ni `loadData`, ni aucun
 * fichier d'infrastructure. Il reçoit exclusivement des modèles métier déjà
 * normalisés et retourne une structure de données pure — aucune logique de
 * présentation, aucun `console.log`.
 */

import { calculateGrossOrderAmount, collectOrderCategories, roundToTwoDecimals } from '../calculateGrossOrderAmount';
import { UnknownCustomerError } from '../errors';
import type { Order } from '../model';
import type { DateWindow } from './periods';
import {
  WINDOW_LENGTH_IN_MONTHS,
  createIsoWeeklyPeriods,
  createMonthlyPeriods,
  createSixMonthWindow,
  isDateInWindow,
} from './periods';
import type {
  CustomerHistoryReport,
  GenerateCustomerHistoryParams,
  HistoryOrder,
  HistoryPeriod,
  OrderAnomaly,
} from './types';

/** Au-delà de ce nombre de commandes par mois, le client est « régulier ». */
export const REGULAR_ORDERS_PER_MONTH_THRESHOLD = 2;

/** Seuil d'anomalie de l'énoncé : écart de plus de 50 % à la moyenne du client. */
export const DEFAULT_ANOMALY_THRESHOLD_PERCENT = 50;

/**
 * Date de commande la plus récente de **tout** le dataset.
 *
 * Volontairement globale : prendre la dernière commande du client demandé
 * donnerait à chacun sa propre fenêtre, et deux clients ne seraient plus
 * comparables.
 */
function resolveReferenceDate(orders: readonly Order[], provided: Date | undefined): Date {
  if (provided !== undefined) {
    return provided;
  }

  let mostRecent = Number.NEGATIVE_INFINITY;
  for (const order of orders) {
    const time = order.orderDate.getTime();
    if (time > mostRecent) {
      mostRecent = time;
    }
  }

  if (mostRecent === Number.NEGATIVE_INFINITY) {
    throw new RangeError(
      'Aucune commande dans le dataset : impossible de déduire une date de référence. ' +
        'Fournissez explicitement referenceDate.',
    );
  }

  return new Date(mostRecent);
}

/** Commandes du client dans la fenêtre, triées par date puis par identifiant. */
function selectCustomerOrders(
  orders: readonly Order[],
  customerId: string,
  window: DateWindow,
): Order[] {
  return orders
    .filter((order) => order.customerId === customerId && isDateInWindow(order.orderDate, window))
    .sort((left, right) => {
      const byDate = left.orderDate.getTime() - right.orderDate.getTime();
      return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
    });
}

/**
 * Moyenne des commandes chiffrables, calculée sur les montants **déjà arrondis**
 * qui figurent dans le rapport : la moyenne affichée est ainsi exactement
 * reproductible à la main à partir des commandes affichées.
 */
function computeAverageAmount(amounts: readonly number[]): number | null {
  if (amounts.length === 0) {
    return null;
  }
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return roundToTwoDecimals(total / amounts.length);
}

function computeAnomaly(
  amount: number,
  averageAmount: number | null,
  thresholdPercent: number,
): OrderAnomaly | null {
  // Sans moyenne, ou avec une moyenne nulle, l'écart relatif n'a pas de sens.
  if (averageAmount === null || averageAmount === 0) {
    return null;
  }

  const deviationPercent = roundToTwoDecimals(
    (Math.abs(amount - averageAmount) / averageAmount) * 100,
  );

  return { deviationPercent, isAnomaly: deviationPercent > thresholdPercent };
}

interface PeriodAggregate {
  readonly pricedOrderCount: number;
  readonly totalAmount: number;
  readonly averageAmount: number | null;
  readonly isPartial: boolean;
}

function aggregatePeriod(orders: readonly HistoryOrder[]): PeriodAggregate {
  const pricedAmounts = orders
    .map((order) => order.amount)
    .filter((amount): amount is number => amount !== null);

  const totalAmount = roundToTwoDecimals(pricedAmounts.reduce((sum, amount) => sum + amount, 0));

  return {
    pricedOrderCount: pricedAmounts.length,
    totalAmount,
    averageAmount:
      pricedAmounts.length === 0 ? null : roundToTwoDecimals(totalAmount / pricedAmounts.length),
    isPartial: pricedAmounts.length < orders.length,
  };
}

/**
 * Évolution du total face à la période précédente.
 *
 * `null` dès qu'une comparaison serait trompeuse : première période, total
 * précédent nul (division impossible), ou période partielle de part et d'autre
 * — comparer des totaux amputés d'une commande non chiffrable produirait une
 * variation qui ne reflète que la qualité des données.
 */
function computeEvolutionPercent(
  current: { totalAmount: number; isPartial: boolean },
  previous: { totalAmount: number; isPartial: boolean } | null,
): number | null {
  if (previous === null || previous.totalAmount === 0) {
    return null;
  }
  if (current.isPartial || previous.isPartial) {
    return null;
  }

  return roundToTwoDecimals(
    ((current.totalAmount - previous.totalAmount) / previous.totalAmount) * 100,
  );
}

export function generateCustomerHistory(
  params: GenerateCustomerHistoryParams,
): CustomerHistoryReport {
  const {
    customerId,
    customersById,
    productsById,
    orders,
    referenceDate,
    anomalyThresholdPercent = DEFAULT_ANOMALY_THRESHOLD_PERCENT,
  } = params;

  const customer = customersById.get(customerId);
  if (customer === undefined) {
    throw new UnknownCustomerError(customerId);
  }

  const window = createSixMonthWindow(resolveReferenceDate(orders, referenceDate));
  const customerOrders = selectCustomerOrders(orders, customerId, window);

  // Le rythme mesure la fréquence d'achat : toutes les commandes comptent, y
  // compris celles dont le montant est incalculable.
  const averageOrdersPerMonth = roundToTwoDecimals(customerOrders.length / WINDOW_LENGTH_IN_MONTHS);
  const isRegular = customerOrders.length / WINDOW_LENGTH_IN_MONTHS > REGULAR_ORDERS_PER_MONTH_THRESHOLD;

  const resolvedOrders = customerOrders.map((order) => ({
    order,
    ...calculateGrossOrderAmount(order, productsById),
    categories: collectOrderCategories(order, productsById),
  }));

  const customerAverageAmount = computeAverageAmount(
    resolvedOrders
      .map((resolved) => resolved.amount)
      .filter((amount): amount is number => amount !== null),
  );

  const historyOrders: HistoryOrder[] = resolvedOrders.map((resolved) => ({
    orderId: resolved.order.id,
    orderDate: new Date(resolved.order.orderDate.getTime()),
    status: resolved.order.status,
    amount: resolved.amount,
    categories: resolved.categories,
    missingProductIds: resolved.missingProductIds,
    anomaly:
      resolved.amount === null
        ? null
        : computeAnomaly(resolved.amount, customerAverageAmount, anomalyThresholdPercent),
  }));

  const rawPeriods = isRegular ? createIsoWeeklyPeriods(window) : createMonthlyPeriods(window);

  const periods: HistoryPeriod[] = [];
  for (const rawPeriod of rawPeriods) {
    const periodOrders = historyOrders.filter(
      (order) =>
        order.orderDate.getTime() >= rawPeriod.start.getTime() &&
        order.orderDate.getTime() <= rawPeriod.end.getTime(),
    );

    const aggregate = aggregatePeriod(periodOrders);
    const previous = periods[periods.length - 1];

    periods.push({
      key: rawPeriod.key,
      start: new Date(rawPeriod.start.getTime()),
      end: new Date(rawPeriod.end.getTime()),
      orderCount: periodOrders.length,
      ...aggregate,
      evolutionPercent: computeEvolutionPercent(aggregate, previous ?? null),
      orders: periodOrders,
    });
  }

  return {
    customer: { id: customer.id, name: customer.name, type: customer.type },
    window,
    rhythm: {
      kind: isRegular ? 'regular' : 'occasional',
      averageOrdersPerMonth,
      grouping: isRegular ? 'week' : 'month',
    },
    customerAverageAmount,
    periods,
  };
}
