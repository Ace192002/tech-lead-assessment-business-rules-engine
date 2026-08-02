/**
 * Validation de la **structure brute** des JSON sources — et rien d'autre.
 *
 * Règle de frontière avec `normalizeData.ts` :
 * - ici, aucune coercition, aucune valeur par défaut, aucun `.transform()`.
 *   Une normalisation cachée dans un schéma deviendrait invisible, donc
 *   intraçable et intestable ;
 * - les schémas restent *permissifs là où les données le sont* (prix en
 *   chaîne, type client absent, `express_delivery` absent) : ce sont des
 *   anomalies de contenu, traitées et tracées par la normalisation ;
 * - en revanche, une structure réellement invalide (champ obligatoire
 *   manquant, date illisible, quantité négative…) lève `InvalidDataError`.
 */

import { z } from 'zod';
import { InvalidDataError } from '../../domain/errors';

const nonEmptyString = z.string().min(1);

/** Chaîne représentant un nombre, ex. `"69.99"` (cf. produit P018). */
const NUMERIC_STRING = /^-?\d+(?:\.\d+)?$/;

export const rawCustomerSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  email: nonEmptyString,
  /** Peut être absent (C009) ou vide (C012) : normalisé en `"Unknown"`. */
  type: z.string().optional(),
  registration_date: z.iso.date(),
});

export const rawProductSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  /**
   * P018 stocke `"69.99"` : la *forme* chaîne est acceptée ici, convertie et
   * tracée à la normalisation. Un prix négatif, en revanche, n'est pas une
   * anomalie de contenu rattrapable : il rendrait tous les montants aval faux.
   * Le refus porte sur les deux formes, après validation de la forme, pour que
   * le message reste « prix négatif » et non « prix non numérique ».
   */
  price: z
    .union([z.number().finite(), z.string().regex(NUMERIC_STRING, 'prix non numérique')])
    .refine((value) => Number(value) >= 0, 'prix négatif'),
  categories: z.array(nonEmptyString).min(1),
});

export const rawOrderItemSchema = z.object({
  product_id: nonEmptyString,
  quantity: z.number().int().positive(),
});

export const rawOrderSchema = z.object({
  order_id: nonEmptyString,
  customer_id: nonEmptyString,
  order_date: z.iso.datetime(),
  status: nonEmptyString,
  /** Absent sur ORD-2024-078 : normalisé en `false`. */
  express_delivery: z.boolean().optional(),
  items: z.array(rawOrderItemSchema).min(1),
});

export const rawCustomersFileSchema = z.object({ customers: z.array(rawCustomerSchema) });
export const rawProductsFileSchema = z.object({ products: z.array(rawProductSchema) });
export const rawOrdersFileSchema = z.object({ orders: z.array(rawOrderSchema) });

export type RawCustomer = z.infer<typeof rawCustomerSchema>;
export type RawProduct = z.infer<typeof rawProductSchema>;
export type RawOrderItem = z.infer<typeof rawOrderItemSchema>;
export type RawOrder = z.infer<typeof rawOrderSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, source: string): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<racine>';
    return `${path} : ${issue.message}`;
  });
  throw new InvalidDataError(source, details);
}

export function parseCustomersFile(input: unknown): RawCustomer[] {
  return parseOrThrow(rawCustomersFileSchema, input, 'customers.json').customers;
}

export function parseProductsFile(input: unknown): RawProduct[] {
  return parseOrThrow(rawProductsFileSchema, input, 'products.json').products;
}

export function parseOrdersFile(input: unknown): RawOrder[] {
  return parseOrThrow(rawOrdersFileSchema, input, 'orders.json').orders;
}
