/**
 * Types partagés de Popote.
 *
 * ⚠️ CONTRAT : ces types sont utilisés par tous les modules (et par les sous-agents).
 * On ne les modifie pas depuis un module de /src/features : toute évolution passe
 * par l'agent chef, qui met à jour ce fichier ET le schéma Dexie (src/lib/db.ts).
 */

// ─────────────────────────── Référentiels ───────────────────────────

export type Saison = 'printemps' | 'ete' | 'automne' | 'hiver'

/** Rayons, dans l'ordre d'un parcours de supermarché classique. */
export const RAYONS = [
  'fruits-legumes',
  'boulangerie',
  'frais',
  'boucherie-poisson',
  'epicerie-salee',
  'epicerie-sucree',
  'boissons',
  'surgeles',
  'hygiene-maison',
] as const
export type Rayon = (typeof RAYONS)[number]

export const RAYON_LIBELLES: Record<Rayon, string> = {
  'fruits-legumes': 'Fruits et légumes',
  boulangerie: 'Boulangerie',
  frais: 'Frais',
  'boucherie-poisson': 'Boucherie et poisson',
  'epicerie-salee': 'Épicerie salée',
  'epicerie-sucree': 'Épicerie sucrée',
  boissons: 'Boissons',
  surgeles: 'Surgelés',
  'hygiene-maison': 'Hygiène et maison',
}

export const CATEGORIES_ALIMENT = [
  'legume',
  'fruit',
  'feculent',
  'proteine-animale',
  'proteine-vegetale',
  'produit-laitier',
  'matiere-grasse',
  'condiment',
  'epice-herbe',
  'sucre',
  'boisson',
  'autre',
] as const
export type CategorieAliment = (typeof CATEGORIES_ALIMENT)[number]

/** Unité de quantité utilisée dans les recettes, le stock et la liste. */
export type Unite = 'g' | 'ml' | 'piece'

/** Unité dans laquelle un prix est exprimé. */
export type UnitePrix = 'kg' | 'l' | 'piece'

export const EQUIPEMENTS = ['plaques', 'four', 'micro-ondes', 'airfryer', 'mixeur', 'bouilloire'] as const
export type Equipement = (typeof EQUIPEMENTS)[number]

export const TYPES_REPAS = ['petit-dejeuner', 'dejeuner', 'gouter', 'diner', 'gamelle'] as const
/**
 * - dejeuner : midi (le week-end ; les midis de semaine sont au CROUS)
 * - gamelle : repas emporté les soirs de travail (remplace le sandwich)
 */
export type TypeRepas = (typeof TYPES_REPAS)[number]

/** Jour de la semaine : 0 = lundi … 6 = dimanche. */
export type Jour = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * Tags d'exclusion « de nature » : un aliment ou une recette qui porte l'un de ces tags
 * est exclu dès que le tag figure dans Reglages.exclusions.
 * Par défaut : fromage, purée, soupe (aliments détestés).
 */
export type TagExclusion = 'fromage' | 'puree' | 'soupe' | 'porc' | 'gluten' | 'lactose' | 'oeuf' | 'poisson' | 'fruits-a-coque'

// ─────────────────────────── Aliments et recettes ───────────────────────────

export interface FormatVente {
  /** Quantité du conditionnement habituel, dans l'unité de base de l'aliment. */
  quantite: number
  /** Libellé lisible : « paquet de 500 g », « filet de 1 kg », « la pièce ». */
  libelle: string
}

/** Aliment brut courant (fichier src/data/aliments.json). */
export interface Aliment {
  /** Identifiant stable en kebab-case, sans accent : « carotte », « riz-basmati ». */
  id: string
  nom: string
  emoji: string
  categorie: CategorieAliment
  rayon: Rayon
  /** Unité de base pour les quantités (recettes, stock, liste). */
  uniteBase: Unite
  /** Format de vente habituel, exprimé dans uniteBase. */
  formatVente: FormatVente
  /** Poids moyen d'une pièce en grammes (utile si uniteBase = 'piece'). */
  poidsPieceG?: number
  /** Mois de pleine saison ; tableau vide = disponible toute l'année. */
  saisons: Saison[]
  /** Tags de nature (fromage, porc…) servant aux exclusions. */
  tags: TagExclusion[]
  /** Durée de conservation indicative après achat, en jours. */
  conservationJours?: number
  /** Synonymes pour la recherche et la correspondance OCR (« pdt » pour pomme de terre). */
  synonymes?: string[]
}

export interface IngredientRecette {
  alimentId: string
  /** Quantité pour `Recette.portions` portions, dans l'unité de base de l'aliment. */
  quantite: number
  unite: Unite
  optionnel?: boolean
}

export type SourceRecette = 'base' | 'ia' | 'utilisateur'

/** Recette (= « plat » dans le swipe). Fichier src/data/recettes.json. */
export interface Recette {
  id: string
  nom: string
  emoji: string
  /** Créneaux pour lesquels la recette convient. */
  types: TypeRepas[]
  /** Temps total (préparation + cuisson), en minutes. 30 max pour la base. */
  tempsMinutes: number
  /** Nombre de portions pour lesquelles les quantités sont données. */
  portions: number
  ingredients: IngredientRecette[]
  etapes: string[]
  equipement: Equipement[]
  /** Bonne froide ou réchauffée au micro-ondes : transportable en gamelle. */
  gamelle: boolean
  /** Se prépare en grande quantité pour plusieurs repas. */
  batch: boolean
  /** Peu sucrée (pertinent pour petits-déj et goûters). */
  peuSucre: boolean
  /** Tags libres : « rapide », « vegetarien », « sans-cuisson »… et tags d'exclusion éventuels. */
  tags: string[]
  source: SourceRecette
}

// ─────────────────────────── Goûts ───────────────────────────

export type CibleGout = 'aliment' | 'recette' | 'produit'

/** Résultat d'un swipe : droite / haut / gauche / bas, + « pas trop souvent ». */
export type Verdict = 'adore' | 'aime' | 'pas-souvent' | 'pas-aime' | 'jamais'

export interface Gout {
  /** `${cible}:${refId}` */
  id: string
  cible: CibleGout
  /** alimentId, recetteId ou code-barres. */
  refId: string
  verdict?: Verdict
  /** Note de 1 à 5 après avoir cuisiné (recettes). */
  note?: 1 | 2 | 3 | 4 | 5
  /** Nombre d'achats constatés (liste validée, ticket). */
  achats: number
  /** Score de préférence entre -1 (jamais) et +1 (adore). Recalculé à chaque événement. */
  score: number
  majLe: string
}

// ─────────────────────────── Stock ───────────────────────────

export type Emplacement = 'frigo' | 'congelateur' | 'placard'

export interface StockItem {
  id?: number
  alimentId?: string
  codeBarres?: string
  nom: string
  quantite: number
  unite: Unite
  emplacement: Emplacement
  /** Date ISO (AAAA-MM-JJ). */
  peremption?: string
  ajouteLe: string
}

/** Produit identifié par code-barres (Open Food Facts ou saisie). */
export interface Produit {
  codeBarres: string
  nom: string
  marque?: string
  imageUrl?: string
  /** a à e, en minuscule. */
  nutriscore?: 'a' | 'b' | 'c' | 'd' | 'e'
  categorie?: string
  /** Correspondance avec un aliment brut quand elle est connue. */
  alimentId?: string
  /** Texte de quantité OFF : « 500 g ». */
  quantiteTexte?: string
  /** Quantité normalisée en g ou ml quand elle est lisible. */
  quantiteNormalisee?: { quantite: number; unite: Unite }
  source: 'open-food-facts' | 'manuel'
  majLe: string
}

// ─────────────────────────── Magasins et prix ───────────────────────────

export interface Magasin {
  id: string
  enseigne: string
  ville: string
  actif: boolean
  /** Identifiant de lieu Open Prices / OpenStreetMap, si connu. */
  osmId?: number
  osmType?: 'NODE' | 'WAY' | 'RELATION'
}

export type SourcePrix = 'open-prices' | 'ticket' | 'manuel' | 'liste' | 'promo' | 'estimation'

/** Un prix constaté à une date (historique). */
export interface PrixObservation {
  id?: number
  /** Clé de rattachement : alimentId ou code-barres. */
  cle: string
  alimentId?: string
  codeBarres?: string
  magasinId?: string
  /** Prix payé pour `quantite` `unite` (ex. 1,29 € pour 500 g). */
  prix: number
  quantite: number
  unite: Unite
  source: SourcePrix
  /** Date ISO complète. */
  date: string
  /**
   * 'national' : médiane de prix constatés ailleurs en France (Open Prices), utilisée comme estimation
   * quand aucun prix local n'existe. Absent = prix local constaté.
   */
  portee?: 'local' | 'national'
}

export interface Promo {
  id?: number
  magasinId: string
  alimentId?: string
  codeBarres?: string
  libelle: string
  prix: number
  prixNormal?: number
  /** Date ISO de fin de validité. */
  fin: string
  ajouteLe: string
}

/** Ce qu'un fournisseur de prix renvoie : un prix ramené à l'unité de prix. */
export interface PrixAffiche {
  /** Prix par kg, par litre ou à la pièce. */
  prixUnitaire: number
  unitePrix: UnitePrix
  source: SourcePrix
  /** Date ISO à laquelle le prix a été constaté (sert à afficher l'âge). */
  date: string
  magasinId?: string
  /** true si c'est une estimation (table de référence ou médiane nationale) et non un prix constaté localement. */
  estime: boolean
  /** Précision affichée à côté de la source (« médiane France »…). */
  detail?: string
}

/** Référence de produit passée aux fournisseurs de prix. */
export interface RefProduit {
  alimentId?: string
  codeBarres?: string
}

/** Interface commune des sources de prix (Open Prices, tickets, manuel, promos, estimation). */
export interface PriceProvider {
  id: SourcePrix
  getPrice(produit: RefProduit, magasin?: Magasin): Promise<PrixAffiche | null>
  getPromos(magasin: Magasin): Promise<Promo[]>
}

/** Ligne du fichier src/data/prix-reference.json. */
export interface PrixReference {
  alimentId: string
  prixUnitaire: number
  unitePrix: UnitePrix
}

export interface FichierPrixReference {
  /** Date ISO à laquelle les prix moyens ont été établis. */
  dateReference: string
  source: string
  prix: PrixReference[]
}

// ─────────────────────────── Planning ───────────────────────────

/** Un créneau du planning : une recette pour un jour et un type de repas. */
export interface Repas {
  /** `${semaine}:${jour}:${type}` */
  id: string
  /** Lundi de la semaine, date ISO AAAA-MM-JJ. */
  semaine: string
  jour: Jour
  type: TypeRepas
  recetteId: string
  portions: number
  verrouille: boolean
  cuisine: boolean
  /** Date ISO à laquelle le repas a été marqué cuisiné. */
  cuisineLe?: string
  /** true quand le repas réutilise une préparation batch d'un repas précédent. */
  restes?: boolean
}

// ─────────────────────────── Liste de courses ───────────────────────────

export type RaisonItem = 'planning' | 'habitude' | 'objectif' | 'manuel'

export interface ItemListe {
  id: string
  alimentId?: string
  codeBarres?: string
  nom: string
  emoji?: string
  rayon: Rayon
  /** Quantité nécessaire, dans `unite`. */
  quantiteBesoin: number
  unite: Unite
  /** Nombre de conditionnements à acheter (quantités arrondies aux formats vendus). */
  nbFormats: number
  /** Libellé du conditionnement (« paquet de 500 g »). */
  libelleFormat: string
  /** Prix estimé pour nbFormats, en euros. */
  prixEstime: number
  sourcePrix: SourcePrix
  /** Date ISO du prix utilisé (âge affiché). */
  datePrix: string
  magasinId?: string
  raison: RaisonItem
  /**
   * Produit de placard (huile, sel, épices, condiments) : probablement déjà à la maison.
   * Affiché à part (« vérifie si tu en as ») et compté hors du total principal.
   */
  placard?: boolean
  coche: boolean
  /** Prix réellement payé (facultatif, saisi en cochant). */
  prixPaye?: number
}

export interface ListeCourses {
  /** Lundi de la semaine concernée (AAAA-MM-JJ). */
  id: string
  creeLe: string
  majLe: string
  items: ItemListe[]
  /** Magasin principal choisi (comparateur). */
  magasinId?: string
  /** Liste validée (courses faites) : alimente le stock et l'historique. */
  validee: boolean
  /** Substitutions choisies par l'utilisateur : alimentId d'origine → alimentId de remplacement. */
  substitutions?: Record<string, string>
}

// ─────────────────────────── Suivi ───────────────────────────

/** Achat constaté (sert à la fréquence d'achat habituelle). */
export interface Achat {
  id?: number
  alimentId?: string
  codeBarres?: string
  date: string
  quantite: number
  unite: Unite
  prix?: number
  magasinId?: string
}

/** Repas acheté dehors, saisi d'un tap. */
export interface RepasDehors {
  id?: number
  date: string
  montant: number
  type: 'sandwich' | 'resto' | 'fast-food' | 'autre'
}

/** Dépense de courses (liste validée ou ticket). */
export interface Depense {
  id?: number
  date: string
  montant: number
  magasinId?: string
  origine: 'liste' | 'ticket' | 'manuel'
}

// ─────────────────────────── Réglages ───────────────────────────

export type FrequenceCourses = 'hebdo' | 'mensuel-plus-hebdo'

export interface Reglages {
  /** Toujours 'moi' (un seul utilisateur). */
  id: 'moi'
  onboardingFait: boolean
  budgetHebdo: number
  /** Jours planifiés pour chaque type de repas (0 = lundi). */
  creneaux: Record<TypeRepas, Jour[]>
  /** Les midis de semaine sont au CROUS (non planifiés). */
  midiCrous: boolean
  equipement: Equipement[]
  tempsMaxMinutes: number
  /** Tags d'exclusion actifs (fromage, purée, soupe par défaut). */
  exclusions: TagExclusion[]
  /** Aliments exclus individuellement (alimentId). */
  alimentsExclus: string[]
  allergies: string
  frequenceCourses: FrequenceCourses
  /** Économie minimale (€) pour proposer de répartir entre 2 magasins. */
  seuilRepartition: number
  /** Intervalle de rafraîchissement des prix, en heures. */
  rafraichissementHeures: number
  /** Prix moyen d'un repas acheté dehors (base du calcul des économies). */
  prixRepasDehors: number
  /** Clé API Claude : stockée uniquement en local, jamais envoyée ailleurs qu'à l'API Anthropic. */
  cleApi?: string
  iaActive: boolean
  notifications: boolean
  /** Dernier rafraîchissement des prix (date ISO). */
  prixMajLe?: string
  /** Tokens consommés (pour l'estimation de coût). */
  tokensEntree: number
  tokensSortie: number
}
