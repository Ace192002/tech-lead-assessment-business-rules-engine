# Hello Pomelo — Tech Lead Assessment

Ce dépôt contient le rendu complet du test technique :

- **Question 1** — rapport d'historique client par périodes dynamiques ;
- **Question 2** — moteur de pricing ordonné, avec dépendances entre règles et trace détaillée ;
- **Question 3** — architecture d'un portail unifié avec SSO (document) ;
- une **CLI** pour vérifier les Questions 1 et 2 sans interface ;
- une **interface React** de démonstration ;
- des **tests automatisés** (192 tests, 6 fichiers).

## Navigation rapide

| Partie | Implémentation | Tests / vérification |
|---|---|---|
| Question 1 — Historique client | `src/domain/customer-history/` | `npm run history -- C001` |
| Question 2 — Moteur de pricing | `src/domain/pricing/` | `npm run pricing -- ORD-2024-001` |
| Question 3 — Portail et SSO | [`QUESTION_3_PORTAIL_UNIFIE.md`](QUESTION_3_PORTAIL_UNIFIE.md) | document Markdown |
| Interface React | `src/presentation/` | `npm run dev` |
| Usage de l'IA | [`AI_USAGE.md`](AI_USAGE.md) | document |
| Architecture du code | [`ARCHITECTURE.md`](ARCHITECTURE.md) | document |

## Prérequis

- **Node.js 22** (développé et vérifié avec la 22.21.1) et **npm 10**. Aucune autre version n'a été testée ;
- aucun service externe, aucun backend, aucune base de données ;
- aucune variable d'environnement.

Les fichiers `data/customers.json`, `data/orders.json` et `data/products.json` sont embarqués dans le dépôt, importés statiquement et **jamais modifiés** : toutes les normalisations se font dans le code, en mémoire.

## Installation et vérification rapide

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run dev` démarre Vite, en général sur `http://localhost:5173` (Vite choisit un autre port si celui-ci est occupé ; l'URL réelle est affichée au démarrage).

## Question 1 — vérification indépendante

```bash
npm run history -- C001
```

Autres exemples utiles :

```bash
npm run history -- C002
npm run history -- C003 --reference-date 2024-11-15
npm run history -- C005
npm run history -- C005 --json
```

Ce que démontre chaque client :

- **C001** — client régulier (3,33 commandes/mois), regroupement **hebdomadaire** ;
- **C002** — client occasionnel, regroupement **mensuel** ;
- **C003** — la commande ORD-2024-080 tombe exactement sur la **borne basse** de la fenêtre : elle est incluse (14 commandes) ;
- **C005** — la commande ORD-2024-079 référence un produit inconnu (P999) : le rapport est produit, la commande est visible mais **non chiffrable**.

Options : `--reference-date` (date `YYYY-MM-DD` interprétée comme jour UTC, ou horodatage ISO complet ; vide = date maximale du dataset), `--json` (sortie `{ result, dataIssues }`), `--help`.

La sortie `--json` est du JSON pur, même via `npm run` : le fichier `.npmrc` du projet met npm en mode silencieux pour que son bandeau ne pollue pas stdout.

### Décisions métier (Question 1)

- date de référence par défaut = **date de commande maximale de tout le dataset** (jamais celle du seul client demandé, pour que les fenêtres restent comparables) ;
- fenêtre = **six mois calendaires à la granularité du jour, bornes inclusives** (référence 15/11 → du 15/05 00:00:00.000 UTC au 15/11 23:59:59.999 UTC), avec clamping des fins de mois (31/08 → 29/02 ou 28/02) ;
- toutes les opérations de dates sont en **UTC** ;
- semaines **ISO-8601** (lundi–dimanche, clé `YYYY-Www`), mois calendaires (`YYYY-MM`) ;
- client **régulier** si `commandes dans la fenêtre / 6 > 2`, sinon occasionnel ;
- les **périodes vides sont conservées** dans le rapport ;
- le montant de la Q1 est le **prix brut** (`Σ prix × quantité`), indépendant du moteur de la Q2 ;
- un produit inconnu rend la commande **visible mais non chiffrable** (`amount: null`, `missingProductIds` exposés) ; ces montants sont **exclus** des totaux, moyennes et anomalies ;
- **anomalie** si l'écart absolu à la moyenne du client est **strictement supérieur à 50 %** (seuil paramétrable, 50 par défaut) ;
- **évolution `null`** quand la comparaison est impossible (première période, total précédent nul) ou reposerait sur une **période partielle**.

Remarque honnête : la règle des 50 % est **très bruyante** sur des paniers hétérogènes — C001 obtient 18 anomalies sur 20 commandes. Elle est implémentée conformément à l'énoncé ; un seuil fondé sur l'écart-type ou la MAD serait une amélioration possible, non implémentée.

## Question 2 — vérification indépendante

```bash
npm run pricing -- ORD-2024-001
```

Autres exemples :

```bash
npm run pricing -- ORD-2024-021
npm run pricing -- ORD-2024-009
npm run pricing -- ORD-2024-065
npm run pricing -- ORD-2024-001 --json
```

Ce que démontre chaque commande :

- **ORD-2024-001** (979,97 → 955,18 EUR) — Premium, première commande du mois, palier 500 €, taxe Électronique ;
- **ORD-2024-021** (2 847,00 → 2 553,04 EUR) — VIP, palier 1000 € **remplaçant** le palier 500 €, livraison express ;
- **ORD-2024-009** (151,27 → 129,27 EUR) — taxe Alimentaire 5,5 % puis remise de volume (14 unités) ;
- **ORD-2024-065** (45,00 → 47,75 EUR) — produit non taxable (P024), frais de traitement +5 €.

Cas d'erreur, jamais silencieux :

```bash
npm run pricing -- ORD-2024-077    # client C999 inconnu     → UnknownCustomerError
npm run pricing -- ORD-2024-079    # produit P999 inconnu    → UnknownProductError
npm run pricing -- ORD-INEXISTANTE # commande absente        → UnknownOrderError
```

### Décisions métier (Question 2)

- les cinq familles s'appliquent dans l'ordre de l'énoncé : base → conditionnelles → taxes par catégorie → seuil cumulatif → finales ;
- Premium (−10 %) et VIP (−15 %) sont **exclusifs** (un client n'a qu'un type) ;
- les remises sont **multiplicatives et séquentielles** (Premium puis 1re du mois : ×0,90 × 0,95, pas −15 %) ;
- la **première commande du mois** est déterminée par mois calendaire **UTC**, sur tout le dataset, départage par identifiant croissant ;
- les paliers conditionnels sont évalués sur l'**instantané après les seules règles de base** : une taxe ultérieure ne peut pas déclencher rétroactivement une remise ;
- le palier **> 1000 € remplace** le palier > 500 € — jamais de cumul −5 % et −8 % ;
- les taxes s'appliquent **ligne par ligne** avec le **taux maximal** de la ligne (Électronique + Alimentaire → 20 % uniquement) ;
- le seuil cumulatif porte sur les **quantités** (> 3 unités d'une même catégorie), pas sur les références distinctes ;
- la remise de volume s'applique **une seule fois par ligne**, même multi-catégories qualifiantes ;
- une **annulation** ne « défait » jamais un calcul : le moteur **rejoue tout depuis l'état brut** sans la règle annulée ;
- la livraison express (+15 €) est ajoutée **avant** le contrôle des frais de traitement (< 50 € → +5 €) ;
- calcul interne en **pleine précision**, arrondi à deux décimales **uniquement en sortie**.

### Le moteur en quelques paragraphes

Les règles sont triées par **priorité croissante** (l'ordre de déclaration départage les égalités) et rejouées sur un état orienté lignes ; le total est toujours dérivé des lignes et des ajustements, jamais stocké.

Quand une règle tardive invalide une règle déjà appliquée (le palier 1000 remplaçant le palier 500, ou la remise de volume faisant retomber le total sous 500 €), le moteur n'inverse aucun calcul : il inscrit la règle dans un **ensemble de règles désactivées**, abandonne le passage en cours et **repart de l'état initial** en rejouant les règles restantes. Cet ensemble est **monotone** — une règle désactivée ne redevient jamais active pendant le même calcul — ce qui garantit la terminaison ; un garde-fou de convergence (10 passages par défaut) lève une erreur explicite plutôt que de masquer une oscillation.

La trace finale liste chaque règle dans l'ordre réel avec son issue — `applied`, `skipped`, `replaced`, `cancelled` — ses montants avant/après, son impact et sa raison. Les règles ignorées restent visibles : elles prouvent pourquoi une règle ne s'est pas appliquée. Le fonctionnement détaillé est dans [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Interface React

```bash
npm run dev
```

Deux onglets : **Question 1 — Historique client** (select client, date de référence optionnelle, résumé, périodes dépliables) et **Question 2 — Moteur de pricing** (select commande — y compris les commandes en erreur —, résumé, lignes, ajustements, trace complète avec badges). L'entête donne accès au panneau des 7 anomalies de qualité de données.

React **ne recalcule aucune règle métier** : l'interface appelle exactement les mêmes fonctions de domaine (`generateCustomerHistory`, `calculateOrderPrice`, `loadData`) que les tests et la CLI.

## Qualité des données

Le chargement produit exactement **7 anomalies** (`DataIssue`), affichées par la CLI et l'interface :

| Élément | Problème | Traitement |
|---|---|---|
| C007 | `premium` en minuscules | normalisé en `Premium` |
| C009 | type absent | `Unknown` |
| C012 | type vide | `Unknown` |
| P018 | prix sous forme de chaîne | converti en `number` |
| ORD-2024-078 | `express_delivery` absent | `false` |
| ORD-2024-077 | client C999 inconnu | erreur explicite pour tout calcul |
| ORD-2024-079 | produit P999 inconnu | erreur explicite en Q2, rapport partiel en Q1 |

**ORD-2024-080 n'est pas une anomalie** : c'est une commande valide datée exactement sur la borne basse de la fenêtre — un cas de test d'inclusivité, pas un défaut de données.

Les identifiants dupliqués et les structures invalides (date illisible, quantité négative…) sont, eux, **bloquants** : le chargement lève une erreur plutôt que de choisir silencieusement.

## Architecture

Direction des dépendances :

```text
JSON bruts (data/)
   ↓
infrastructure/data (validation Zod, normalisation explicite, DataIssue, index)
   ↓
modèles normalisés (domain/model.ts)
   ↓
domain (customer-history, pricing) — sans React, sans Zod, sans Node
   ↓
CLI (scripts/) et React (src/presentation/)
```

Détails, choix structurants et points d'extension : [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Question 3

Proposition d'architecture pour un portail interne unifié devant les applications RH, CRM, Finance et Projets : SPA React + BFF NestJS, SSO sur l'IdP d'entreprise (OIDC + PKCE, jetons côté serveur uniquement), intégration progressive en trois phases sans remplacer les applications existantes. Chaque application reste source de vérité de son domaine.

Document complet : [`QUESTION_3_PORTAIL_UNIFIE.md`](QUESTION_3_PORTAIL_UNIFIE.md).

## Tests

```bash
npm run typecheck
npm test
npm run build
```

État au dernier audit : **6 fichiers de tests, 192 tests, tous verts** ; typecheck et build de production sans erreur.

Contrôles particuliers couverts :

- calculs de dates rejoués sous plusieurs fuseaux (UTC+14, UTC−11) avec résultats identiques ;
- rejet des données structurellement invalides et des identifiants dupliqués ;
- périodes : bornes inclusives, clamping de fin de mois, semaines ISO au changement d'année, continuité sans trou ni chevauchement ;
- moteur générique : ordre, égalités de priorité, remplacement, annulation, monotonie des désactivations, non-convergence rejetée ;
- règles métier : seuils exacts (500, 1000, 50 €, 3 unités, 50 %), exclusivités, taxe maximale, remise unique par ligne ;
- non-mutation des entrées (commandes, produits, clients, règles, états) ;
- annulation vérifiée sur fixture synthétique (520 → 468 €, ni 444,60 € ni 520 €) ;
- sorties CLI : codes de sortie et JSON parsable.

Aucun pourcentage de couverture n'est annoncé : aucun rapport de couverture n'est demandé ni généré.

## Structure du dépôt

```text
data/                    customers.json, orders.json, products.json (inchangés)
scripts/                 CLI : customerHistory.ts, pricing.ts, cliUtils.ts
src/
  domain/
    customer-history/    periods.ts, generateCustomerHistory.ts, types.ts
    pricing/             engine.ts, rules/, calculateOrderPrice.ts, types.ts
    model.ts, errors.ts, calculateGrossOrderAmount.ts, rounding.ts
  infrastructure/data/   schemas.ts, normalizeData.ts, dataIssues.ts, loadData.ts
  presentation/          pages et composants React
QUESTION_3_PORTAIL_UNIFIE.md
ARCHITECTURE.md
AI_USAGE.md
README.md
```

## Limitations et évolutions

- données locales JSON, sans persistance : l'interface est une démonstration ;
- pas d'internationalisation (libellés en français) ;
- règle d'anomalie volontairement conforme à l'énoncé, statistiquement améliorable (écart-type, MAD) ;
- le moteur accepte de nouvelles règles par code (registre ordonné), sans interface d'administration ;
- absence de backend volontaire : rien dans l'énoncé des Questions 1 et 2 ne le demande.

## Commits

L'historique contient au moins un commit distinct par question : `feat(history)` (Question 1, en deux commits : périodes puis rapport), `feat(pricing)` (Question 2, en deux commits : moteur puis règles), `docs(q3)` (Question 3), plus les commits d'infrastructure de données, de CLI, d'interface et de documentation.
