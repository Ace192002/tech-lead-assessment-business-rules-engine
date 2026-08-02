/**
 * Erreurs métier explicites.
 *
 * Distinction fondamentale de ce projet :
 * - une anomalie *récupérable* produit un `DataIssue` et n'interrompt rien
 *   (type client vide, prix en chaîne, référence inconnue…) ;
 * - une situation *ambiguë ou insoluble* lève l'une des erreurs ci-dessous.
 *
 * Aucune anomalie n'est jamais ignorée silencieusement.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Structure de fichier réellement invalide (champ obligatoire manquant, type
 * incompatible, date illisible…). Levée par la validation Zod.
 */
export class InvalidDataError extends DomainError {
  readonly source: string;
  readonly details: readonly string[];

  constructor(source: string, details: readonly string[]) {
    super(`Structure invalide dans ${source} :\n  - ${details.join('\n  - ')}`);
    this.source = source;
    this.details = details;
  }
}

/**
 * Deux entités partagent le même identifiant. Choisir « le premier gagne » ou
 * « le dernier gagne » reviendrait à trancher arbitrairement une ambiguïté de
 * données : le chargement est donc interrompu.
 */
export class DuplicateIdError extends DomainError {
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super(
      `Identifiant dupliqué pour ${entity} : "${id}". ` +
        `Résolution ambiguë, le chargement est interrompu.`,
    );
    this.entity = entity;
    this.id = id;
  }
}

/**
 * Un calcul a été demandé pour un client absent du référentiel.
 * Le chargement des données, lui, n'échoue pas : il signale un `DataIssue`.
 */
export class UnknownCustomerError extends DomainError {
  readonly customerId: string;

  constructor(customerId: string) {
    super(`Client inconnu : "${customerId}".`);
    this.customerId = customerId;
  }
}

/**
 * Le moteur de règles a rencontré une configuration insoluble : identifiants
 * dupliqués, règle s'annulant elle-même, annulation d'une règle inexistante, ou
 * absence de convergence. Une non-convergence n'est jamais masquée.
 */
export class RuleEngineError extends DomainError {}

/**
 * Un calcul a été demandé sur une commande référençant un produit absent du
 * catalogue. Aucun montant ne peut être établi pour cette commande.
 */
export class UnknownProductError extends DomainError {
  readonly productId: string;
  readonly orderId: string | undefined;

  constructor(productId: string, orderId?: string) {
    super(
      orderId === undefined
        ? `Produit inconnu : "${productId}".`
        : `Produit inconnu : "${productId}" (commande "${orderId}").`,
    );
    this.productId = productId;
    this.orderId = orderId;
  }
}
