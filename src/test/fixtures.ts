/** Données de test partagées : vrais aliments et prix de référence, recettes d'exemple. */
import aliments from '@/data/aliments.json'
import prixRef from '@/data/prix-reference.json'
import type { Aliment, PrixAffiche, Recette, Reglages } from '@/types'
import { reglagesParDefaut } from '@/lib/defaults'
import type { ResolveurPrix } from '@/lib/prix'

export const ALIMENTS = aliments as Aliment[]
export const PAR_ID = new Map(ALIMENTS.map((a) => [a.id, a]))

export const prixEstimes: ResolveurPrix = (id) => {
  const p = prixRef.prix.find((x) => x.alimentId === id)
  if (!p) return null
  return { prixUnitaire: p.prixUnitaire, unitePrix: p.unitePrix as PrixAffiche['unitePrix'], source: 'estimation', date: prixRef.dateReference, estime: true }
}

const base = { etapes: ['Cuisine.'], equipement: ['plaques'] as Recette['equipement'], tags: [], source: 'base' as const, peuSucre: true }

export const RECETTES: Recette[] = [
  { ...base, id: 'riz-poulet', nom: 'Riz poulet', emoji: '🍗', types: ['diner', 'gamelle', 'dejeuner'], tempsMinutes: 25, portions: 2, gamelle: true, batch: false,
    ingredients: [{ alimentId: 'riz-blanc', quantite: 150, unite: 'g' }, { alimentId: 'poulet-filet', quantite: 250, unite: 'g' }, { alimentId: 'courgette', quantite: 1, unite: 'piece' }] },
  { ...base, id: 'dahl', nom: 'Dahl de lentilles', emoji: '🍛', types: ['diner', 'gamelle', 'dejeuner'], tempsMinutes: 30, portions: 4, gamelle: true, batch: true,
    ingredients: [{ alimentId: 'lentilles-corail', quantite: 250, unite: 'g' }, { alimentId: 'lait-coco', quantite: 200, unite: 'ml' }, { alimentId: 'oignon', quantite: 1, unite: 'piece' }, { alimentId: 'curry', quantite: 5, unite: 'g' }] },
  { ...base, id: 'omelette', nom: 'Omelette', emoji: '🍳', types: ['diner', 'dejeuner'], tempsMinutes: 10, portions: 1, gamelle: false, batch: false,
    ingredients: [{ alimentId: 'oeuf', quantite: 3, unite: 'piece' }, { alimentId: 'tomate', quantite: 1, unite: 'piece' }] },
  { ...base, id: 'pates-thon', nom: 'Pâtes au thon', emoji: '🍝', types: ['diner', 'gamelle', 'dejeuner'], tempsMinutes: 15, portions: 2, gamelle: true, batch: false,
    ingredients: [{ alimentId: 'pates', quantite: 200, unite: 'g' }, { alimentId: 'thon-boite', quantite: 140, unite: 'g' }, { alimentId: 'tomates-concassees-boite', quantite: 200, unite: 'g' }] },
  { ...base, id: 'saumon-four', nom: 'Saumon au four', emoji: '🐟', types: ['diner'], tempsMinutes: 25, portions: 1, gamelle: false, batch: false, equipement: ['four'],
    ingredients: [{ alimentId: 'saumon-filet', quantite: 150, unite: 'g' }, { alimentId: 'pomme-de-terre', quantite: 250, unite: 'g' }] },
  { ...base, id: 'porridge', nom: 'Porridge banane', emoji: '🥣', types: ['petit-dejeuner'], tempsMinutes: 5, portions: 1, gamelle: false, batch: false, equipement: ['micro-ondes'],
    ingredients: [{ alimentId: 'flocons-avoine', quantite: 50, unite: 'g' }, { alimentId: 'lait', quantite: 200, unite: 'ml' }, { alimentId: 'banane', quantite: 1, unite: 'piece' }] },
  { ...base, id: 'tartine-cacahuete', nom: 'Tartine cacahuète', emoji: '🥜', types: ['petit-dejeuner', 'gouter'], tempsMinutes: 3, portions: 1, gamelle: false, batch: false, equipement: [],
    ingredients: [{ alimentId: 'pain-complet', quantite: 60, unite: 'g' }, { alimentId: 'beurre-cacahuete', quantite: 20, unite: 'g' }] },
  { ...base, id: 'yaourt-fruit', nom: 'Yaourt pomme', emoji: '🍎', types: ['gouter', 'petit-dejeuner'], tempsMinutes: 2, portions: 1, gamelle: false, batch: false, equipement: [],
    ingredients: [{ alimentId: 'yaourt-nature', quantite: 1, unite: 'piece' }, { alimentId: 'pomme', quantite: 1, unite: 'piece' }] },
]

export function reglages(partiel: Partial<Reglages> = {}): Reglages {
  return { ...reglagesParDefaut(), onboardingFait: true, ...partiel }
}
