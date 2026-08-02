/**
 * Rapport d'anomalies de données.
 *
 * Un `DataIssue` est une valeur métier, pas un log : il est retourné par le
 * chargement, asserté par les tests, imprimé par la CLI et affiché par
 * l'interface. Aucun `console.log` n'est utilisé comme mécanisme de
 * signalement.
 */

export const DATA_ISSUE_CODES = [
  /** Type client reconnu mais mal orthographié ou mal casé (ex. `"premium"`). */
  'CUSTOMER_TYPE_NORMALIZED',
  /** Type client absent ou vide → `"Unknown"`. */
  'CUSTOMER_TYPE_MISSING',
  /** Type client renseigné mais hors référentiel → `"Unknown"`. */
  'CUSTOMER_TYPE_UNRECOGNIZED',
  /** Prix stocké sous forme de chaîne → converti en `number`. */
  'PRODUCT_PRICE_COERCED',
  /** `express_delivery` absent → `false`. */
  'ORDER_EXPRESS_DEFAULTED',
  /** Commande rattachée à un client absent du référentiel. */
  'UNKNOWN_CUSTOMER_REFERENCE',
  /** Ligne de commande rattachée à un produit absent du catalogue. */
  'UNKNOWN_PRODUCT_REFERENCE',
] as const;

export type DataIssueCode = (typeof DATA_ISSUE_CODES)[number];

export type DataIssueSeverity = 'warning' | 'error';

export type DataIssueEntity = 'customer' | 'product' | 'order';

export interface DataIssue {
  readonly code: DataIssueCode;
  readonly severity: DataIssueSeverity;
  readonly entity: DataIssueEntity;
  /** Identifiant de l'entité qui *porte* l'anomalie. */
  readonly entityId: string;
  /** Champ concerné, en nommage métier (camelCase). */
  readonly field?: string;
  readonly message: string;
  /** Valeur source telle qu'elle figure dans le JSON, à titre de preuve. */
  readonly rawValue?: unknown;
}

/**
 * La sévérité est une propriété du code, pas une décision de chaque appelant :
 * une même anomalie ne peut donc pas être classée différemment selon l'endroit
 * où elle est détectée.
 *
 * `warning` : la donnée a été normalisée, tous les calculs restent possibles.
 * `error`   : la donnée est inexploitable en l'état ; les calculs qui en
 *             dépendent devront lever une erreur ou produire un résultat partiel.
 */
export const DATA_ISSUE_SEVERITY: Readonly<Record<DataIssueCode, DataIssueSeverity>> = {
  CUSTOMER_TYPE_NORMALIZED: 'warning',
  CUSTOMER_TYPE_MISSING: 'warning',
  CUSTOMER_TYPE_UNRECOGNIZED: 'warning',
  PRODUCT_PRICE_COERCED: 'warning',
  ORDER_EXPRESS_DEFAULTED: 'warning',
  UNKNOWN_CUSTOMER_REFERENCE: 'error',
  UNKNOWN_PRODUCT_REFERENCE: 'error',
};

export interface CreateDataIssueParams {
  readonly code: DataIssueCode;
  readonly entity: DataIssueEntity;
  readonly entityId: string;
  readonly message: string;
  readonly field?: string;
  readonly rawValue?: unknown;
}

/** Seule fabrique de `DataIssue` : garantit une sévérité cohérente. */
export function createDataIssue(params: CreateDataIssueParams): DataIssue {
  return { ...params, severity: DATA_ISSUE_SEVERITY[params.code] };
}
