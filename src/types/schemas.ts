/**
 * Schémas Zod des fichiers de données (miroir des types de ./index.ts).
 * Servent à valider les JSON de départ (tests) et les réponses de l'IA.
 */
import { z } from 'zod'
import { CATEGORIES_ALIMENT, EQUIPEMENTS, RAYONS, TYPES_REPAS } from './index'

export const zUnite = z.enum(['g', 'ml', 'piece'])
export const zUnitePrix = z.enum(['kg', 'l', 'piece'])
export const zSaison = z.enum(['printemps', 'ete', 'automne', 'hiver'])
export const zTagExclusion = z.enum(['fromage', 'puree', 'soupe', 'porc', 'gluten', 'lactose', 'oeuf', 'poisson', 'fruits-a-coque'])
const zId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id en kebab-case sans accent')

export const zAliment = z.object({
  id: zId,
  nom: z.string().min(1),
  emoji: z.string().min(1),
  categorie: z.enum(CATEGORIES_ALIMENT),
  rayon: z.enum(RAYONS),
  uniteBase: zUnite,
  formatVente: z.object({ quantite: z.number().positive(), libelle: z.string().min(1) }),
  poidsPieceG: z.number().positive().optional(),
  saisons: z.array(zSaison),
  tags: z.array(zTagExclusion),
  conservationJours: z.number().int().positive().optional(),
  synonymes: z.array(z.string()).optional(),
  perso: z.boolean().optional(),
})

export const zIngredient = z.object({
  alimentId: zId,
  quantite: z.number().positive(),
  unite: zUnite,
  optionnel: z.boolean().optional(),
})

export const zRecette = z.object({
  id: zId,
  nom: z.string().min(1),
  emoji: z.string().min(1),
  types: z.array(z.enum(TYPES_REPAS)).min(1),
  tempsMinutes: z.number().int().positive(),
  portions: z.number().int().positive(),
  ingredients: z.array(zIngredient).min(1),
  etapes: z.array(z.string().min(1)).min(1),
  equipement: z.array(z.enum(EQUIPEMENTS)),
  gamelle: z.boolean(),
  batch: z.boolean(),
  peuSucre: z.boolean(),
  tags: z.array(z.string()),
  source: z.enum(['base', 'ia', 'utilisateur']),
})

export const zFichierPrixReference = z.object({
  dateReference: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().min(1),
  prix: z.array(z.object({ alimentId: zId, prixUnitaire: z.number().positive(), unitePrix: zUnitePrix })),
})
