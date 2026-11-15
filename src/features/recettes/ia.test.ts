import { describe, expect, it } from 'vitest'
import { assainirRecetteIA, interpreterConsigneRegles, videFrigoRegles } from './ia'
import { ALIMENTS, PAR_ID, RECETTES, reglages } from '@/test/fixtures'

const brute = (p: Partial<Parameters<typeof assainirRecetteIA>[0]> = {}) => ({
  nom: 'Bowl poulet riz', emoji: '🍗', types: ['diner' as const], tempsMinutes: 20, portions: 2,
  ingredients: [{ alimentId: 'riz-blanc', quantite: 150 }, { alimentId: 'poulet-filet', quantite: 250 }],
  etapes: ['Ajoute 1 cuillère à soupe d’huile.'], equipement: ['plaques' as const], gamelle: true, batch: false, peuSucre: true, tags: ['rapide'], ...p,
})

describe('IA : assainissement des recettes', () => {
  it('accepte une recette correcte et impose les unités de base', () => {
    const r = assainirRecetteIA(brute(), PAR_ID, reglages(), new Map())!
    expect(r.source).toBe('ia')
    expect(r.ingredients[0].unite).toBe('g')
    expect(r.etapes[0]).toContain('c. à s.')
  })
  it('rejette le fromage, la purée et la soupe', () => {
    expect(assainirRecetteIA(brute({ nom: 'Pâtes au fromage' }), PAR_ID, reglages(), new Map())).toBeNull()
    expect(assainirRecetteIA(brute({ etapes: ['Mixe en purée.'] }), PAR_ID, reglages(), new Map())).toBeNull()
    expect(assainirRecetteIA(brute({ nom: 'Soupe express' }), PAR_ID, reglages(), new Map())).toBeNull()
    expect(assainirRecetteIA(brute({ ingredients: [{ alimentId: 'pesto-basilic', quantite: 30 }] }), PAR_ID, reglages(), new Map())).toBeNull()
  })
  it('rejette les ingrédients inventés et les recettes trop longues', () => {
    expect(assainirRecetteIA(brute({ ingredients: [{ alimentId: 'licorne', quantite: 1 }, { alimentId: 'riz-blanc', quantite: 100 }] }), PAR_ID, reglages(), new Map())).toBeNull()
    expect(assainirRecetteIA(brute({ tempsMinutes: 45 }), PAR_ID, reglages(), new Map())).toBeNull()
  })
})

describe('consigne sans IA', () => {
  it('comprend la flemme, le batch et « pas de … »', () => {
    const c = interpreterConsigneRegles("Cette semaine j'ai la flemme, je veux faire du batch et pas de thon", ALIMENTS)
    expect(c.tempsMax).toBe(15)
    expect(c.preferer).toEqual(expect.arrayContaining(['rapide', 'batch']))
    expect(c.eviter).toContain('thon-boite')
    expect(c.resume).toMatch(/^Compris/)
  })
})

describe('vide-frigo sans IA', () => {
  it('priorise les recettes qui utilisent le stock qui périme', () => {
    const stock = [
      { alimentId: 'oeuf', nom: 'Œufs', quantite: 6, unite: 'piece' as const, emplacement: 'frigo' as const, ajouteLe: '', peremption: '2026-11-16' },
      { alimentId: 'tomate', nom: 'Tomates', quantite: 3, unite: 'piece' as const, emplacement: 'frigo' as const, ajouteLe: '' },
    ]
    const res = videFrigoRegles(RECETTES, stock, PAR_ID, '2026-11-15')
    expect(res[0].recette.id).toBe('omelette')
  })
})
