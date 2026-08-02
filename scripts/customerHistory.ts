/**
 * CLI de la Question 1 — rapport d'historique client.
 *
 *   npm run history -- C001
 *   npm run history -- C003 --reference-date 2024-11-15
 *   npm run history -- C005 --json
 *
 * Couche d'entrée/sortie uniquement : le calcul vit dans
 * `domain/customer-history`, le chargement dans `infrastructure/data`.
 */

import { generateCustomerHistory } from '../src/domain/customer-history/generateCustomerHistory';
import type { CustomerHistoryReport, HistoryPeriod } from '../src/domain/customer-history/types';
import { parseReferenceDate } from '../src/domain/referenceDate';
import { loadData } from '../src/infrastructure/data/loadData';
import { formatDay, formatMoney, formatPercent, printDataIssues, reportError } from './cliUtils';

const USAGE = `Usage : npm run history -- <customerId> [options]

Options :
  --reference-date <date>  Date de référence (YYYY-MM-DD, interprétée en UTC,
                           ou horodatage ISO avec Z ou décalage UTC explicite,
                           ex. 2024-11-15T14:00:00Z ou 2024-11-15T14:00:00+02:00).
                           Par défaut : la commande la plus récente du dataset.
  --json                   Sortie JSON { result, dataIssues } sur stdout.
  --help                   Affiche cette aide.

Exemples :
  npm run history -- C001
  npm run history -- C003 --reference-date 2024-11-15
  npm run history -- C005 --json`;

interface CliArgs {
  readonly customerId: string;
  readonly json: boolean;
  readonly referenceDate: Date | undefined;
}

type ParsedArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'run'; readonly args: CliArgs };

function parseArgs(argv: readonly string[]): ParsedArgs {
  let customerId: string | undefined;
  let json = false;
  let referenceDate: Date | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      return { kind: 'help' };
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--reference-date') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return { kind: 'invalid', message: '--reference-date attend une valeur.' };
      }
      const parsed = parseReferenceDate(value);
      if (parsed === null) {
        return {
          kind: 'invalid',
          message: `Date de référence invalide : "${value}" (attendu YYYY-MM-DD, ou horodatage ISO avec Z ou décalage UTC explicite).`,
        };
      }
      referenceDate = parsed;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) {
      return { kind: 'invalid', message: `Option inconnue : ${argument}` };
    }
    if (customerId !== undefined) {
      return { kind: 'invalid', message: `Un seul identifiant client attendu (reçu "${customerId}" et "${argument}").` };
    }
    customerId = argument;
  }

  if (customerId === undefined) {
    return { kind: 'invalid', message: 'Identifiant client manquant.' };
  }

  return { kind: 'run', args: { customerId, json, referenceDate } };
}

function printPeriod(period: HistoryPeriod): void {
  const bounds = `${formatDay(period.start)} → ${formatDay(period.end)}`;

  if (period.orderCount === 0) {
    console.log(`  ${period.key}  ${bounds}  (aucune commande)`);
    return;
  }

  console.log(
    `  ${period.key}  ${bounds}  commandes: ${period.orderCount} (chiffrables: ${period.pricedOrderCount})` +
      `  total: ${formatMoney(period.totalAmount)}  moyenne: ${formatMoney(period.averageAmount)}` +
      `  évolution: ${formatPercent(period.evolutionPercent)}${period.isPartial ? '  [PARTIELLE]' : ''}`,
  );

  for (const order of period.orders) {
    const amount = order.amount === null ? 'NON CHIFFRABLE' : formatMoney(order.amount);
    const anomaly =
      order.anomaly === null
        ? 'anomalie: —'
        : `écart: ${order.anomaly.deviationPercent.toFixed(2)} %${order.anomaly.isAnomaly ? ' [ANOMALIE]' : ''}`;
    const missing =
      order.missingProductIds.length > 0
        ? `  produits inconnus: ${order.missingProductIds.join(', ')}`
        : '';

    console.log(
      `    ${order.orderId}  ${order.orderDate.toISOString()}  ${order.status.padEnd(10)}` +
        ` ${amount.padStart(14)}  [${order.categories.join(', ')}]  ${anomaly}${missing}`,
    );
  }
}

function printReport(report: CustomerHistoryReport): void {
  const orders = report.periods.flatMap((period) => period.orders);
  const anomalies = orders.filter((order) => order.anomaly?.isAnomaly).length;
  const unpriced = orders.filter((order) => order.amount === null).length;

  console.log(`Client          : ${report.customer.id} — ${report.customer.name} (${report.customer.type})`);
  console.log(`Fenêtre         : ${report.window.start.toISOString()} → ${report.window.end.toISOString()}`);
  console.log(
    `Rythme          : ${report.rhythm.kind} (${report.rhythm.averageOrdersPerMonth.toFixed(2)} commande(s)/mois)` +
      ` → regroupement par ${report.rhythm.grouping === 'week' ? 'semaine' : 'mois'}`,
  );
  console.log(`Moyenne client  : ${formatMoney(report.customerAverageAmount)}`);
  console.log(
    `Périodes        : ${report.periods.length}   Commandes : ${orders.length}   Anomalies : ${anomalies}   Non chiffrables : ${unpriced}`,
  );
  console.log('');

  for (const period of report.periods) {
    printPeriod(period);
  }
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.kind === 'help') {
    console.log(USAGE);
    return;
  }
  if (parsed.kind === 'invalid') {
    console.error(parsed.message);
    console.error('');
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  try {
    const { dataset, indexes, issues } = loadData();
    const report = generateCustomerHistory({
      customerId: parsed.args.customerId,
      customersById: indexes.customersById,
      productsById: indexes.productsById,
      orders: dataset.orders,
      ...(parsed.args.referenceDate === undefined ? {} : { referenceDate: parsed.args.referenceDate }),
    });

    if (parsed.args.json) {
      // Rien d'autre sur stdout : la sortie doit rester parsable telle quelle.
      console.log(JSON.stringify({ result: report, dataIssues: issues }, null, 2));
      return;
    }

    printReport(report);
    printDataIssues(issues);
  } catch (error) {
    reportError(error);
  }
}

main();
