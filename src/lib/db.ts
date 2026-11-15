/**
 * Base de données locale (IndexedDB via Dexie). Tout vit sur l'appareil.
 *
 * ⚠️ CONTRAT : le schéma est géré par l'agent chef. Un module qui a besoin d'une
 * nouvelle table ou d'un nouvel index le demande, il ne modifie pas ce fichier.
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  Achat,
  Aliment,
  Depense,
  Gout,
  ListeCourses,
  Magasin,
  PrixObservation,
  Produit,
  Promo,
  Recette,
  Reglages,
  Repas,
  RepasDehors,
  StockItem,
} from '@/types'

export class PopoteDB extends Dexie {
  aliments!: EntityTable<Aliment, 'id'>
  /** Les « plats » du swipe sont les recettes (base, IA ou perso). */
  recettes!: EntityTable<Recette, 'id'>
  gouts!: EntityTable<Gout, 'id'>
  stock!: EntityTable<StockItem, 'id'>
  produits!: EntityTable<Produit, 'codeBarres'>
  prix!: EntityTable<PrixObservation, 'id'>
  promos!: EntityTable<Promo, 'id'>
  magasins!: EntityTable<Magasin, 'id'>
  listes!: EntityTable<ListeCourses, 'id'>
  repas!: EntityTable<Repas, 'id'>
  achats!: EntityTable<Achat, 'id'>
  repasDehors!: EntityTable<RepasDehors, 'id'>
  depenses!: EntityTable<Depense, 'id'>
  reglages!: EntityTable<Reglages, 'id'>
  /** Métadonnées techniques (version des données de départ…). */
  meta!: EntityTable<{ cle: string; valeur: unknown }, 'cle'>

  constructor(nom = 'popote') {
    super(nom)
    this.version(1).stores({
      aliments: 'id, categorie, rayon, *tags',
      recettes: 'id, source, *types, *tags',
      gouts: 'id, cible, refId, verdict, score',
      stock: '++id, alimentId, codeBarres, emplacement, peremption',
      produits: 'codeBarres, alimentId',
      prix: '++id, cle, alimentId, codeBarres, magasinId, source, date, [cle+magasinId]',
      promos: '++id, magasinId, alimentId, codeBarres, fin',
      magasins: 'id, enseigne',
      listes: 'id, creeLe',
      repas: 'id, semaine, [semaine+jour], recetteId',
      achats: '++id, alimentId, codeBarres, date',
      repasDehors: '++id, date',
      depenses: '++id, date',
      reglages: 'id',
      meta: 'cle',
    })
  }
}

export const db = new PopoteDB()

/** Les noms de tables, utiles pour l'export / import JSON. */
export const TABLES = [
  'aliments',
  'recettes',
  'gouts',
  'stock',
  'produits',
  'prix',
  'promos',
  'magasins',
  'listes',
  'repas',
  'achats',
  'repasDehors',
  'depenses',
  'reglages',
  'meta',
] as const
export type NomTable = (typeof TABLES)[number]
