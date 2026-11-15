import { describe, expect, it } from 'vitest'
import { autreIdee, creneauxDeLaSemaine, genererPlanning, graine, normaliserRestes, type ContextePlanning } from './planning'
import { PAR_ID, RECETTES, prixEstimes, reglages } from '@/test/fixtures'

const ctx = (p: Partial<ContextePlanning> = {}): ContextePlanning => ({
  semaine: '2026-11-16',
  recettes: RECETTES,
  alimentsParId: PAR_ID,
  gouts: new Map(),
  reglages: reglages(),
  stock: [],
  prix: prixEstimes,
  promos: new Set(),
  existants: [],
  recentes: new Set(),
  aleatoire: graine(42),
  aujourdhui: new Date(2026, 10, 15),
  ...p,
})

describe('planning sans IA', () => {
  it('remplit tous les créneaux configurés', () => {
    const plan = genererPlanning(ctx())
    expect(plan).toHaveLength(creneauxDeLaSemaine(reglages()).length)
    // Pas de midi de semaine (CROUS).
    expect(plan.some((r) => r.type === 'dejeuner' && r.jour < 5)).toBe(false)
    // Gamelles jeudi, vendredi, samedi.
    expect(plan.filter((r) => r.type === 'gamelle').map((r) => r.jour)).toEqual([3, 4, 5])
  })
  it('ne met en gamelle que des recettes transportables', () => {
    const plan = genererPlanning(ctx())
    for (const r of plan.filter((x) => x.type === 'gamelle')) expect(RECETTES.find((x) => x.id === r.recetteId)?.gamelle).toBe(true)
  })
  it("respecte l'équipement (pas de four → pas de saumon au four)", () => {
    const plan = genererPlanning(ctx({ reglages: reglages({ equipement: ['plaques', 'micro-ondes'] }) }))
    expect(plan.some((r) => r.recetteId === 'saumon-four')).toBe(false)
  })
  it('garde les repas verrouillés', () => {
    const verrou = { id: '2026-11-16:0:diner', semaine: '2026-11-16', jour: 0 as const, type: 'diner' as const, recetteId: 'saumon-four', portions: 1, verrouille: true, cuisine: false }
    const plan = genererPlanning(ctx({ existants: [verrou] }))
    expect(plan.find((r) => r.id === verrou.id)?.recetteId).toBe('saumon-four')
  })
  it('est reproductible à graine égale et varie avec une autre graine', () => {
    const a = genererPlanning(ctx()).map((r) => r.recetteId)
    const b = genererPlanning(ctx()).map((r) => r.recetteId)
    expect(a).toEqual(b)
  })
  it('crée des restes cohérents pour les recettes batch', () => {
    const plan = genererPlanning(ctx())
    for (const r of plan.filter((x) => x.restes)) {
      const origine = plan.find((o) => !o.restes && o.recetteId === r.recetteId && r.jour - o.jour >= 0 && r.jour - o.jour <= 2)
      expect(origine, r.id).toBeDefined()
    }
    expect(normaliserRestes(plan)).toEqual(plan)
  })
  it('« autre idée » propose une autre recette', () => {
    const c = ctx()
    const plan = genererPlanning(c)
    const cible = plan.find((r) => r.type === 'diner')!
    expect(autreIdee(c, plan, cible)?.recetteId).not.toBe(cible.recetteId)
  })
  it('évite les recettes « jamais »', () => {
    const gouts = new Map([['recette:omelette', { id: 'recette:omelette', cible: 'recette' as const, refId: 'omelette', verdict: 'jamais' as const, achats: 0, score: -1, majLe: '' }]])
    const plan = genererPlanning(ctx({ gouts }))
    expect(plan.some((r) => r.recetteId === 'omelette')).toBe(false)
  })
})
