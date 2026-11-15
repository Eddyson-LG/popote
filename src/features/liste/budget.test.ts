/** Critère de réussite : avec les données de départ, une semaine complète tient sous 50 €. */
import { describe, expect, it } from 'vitest'
import recettes from '@/data/recettes.json'
import type { Recette } from '@/types'
import { genererPlanning, graine, normaliserRestes, type ContextePlanning } from '@/features/recettes/planning'
import { respecterBudget } from '@/features/recettes/budget'
import { genererListe, totaux } from './generer'
import { PAR_ID, prixEstimes, reglages } from '@/test/fixtures'

describe('budget de la semaine (données réelles)', () => {
  const R = recettes as Recette[]
  const parId = new Map(R.map((r) => [r.id, r]))
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`graine ${seed} : liste complète (placard compris) ≤ 50 €`, () => {
      // Cas le plus dur : première semaine, placard vide (seuls huile, sel, poivre, comme proposé au questionnaire).
      const stock = ['huile-olive', 'sel', 'poivre'].map((id) => ({ alimentId: id, nom: id, quantite: PAR_ID.get(id)!.formatVente.quantite, unite: PAR_ID.get(id)!.uniteBase, emplacement: 'placard' as const, ajouteLe: '' }))
      const ctx: ContextePlanning = {
        semaine: '2026-11-16', recettes: R, alimentsParId: PAR_ID, gouts: new Map(), reglages: reglages(), stock,
        prix: prixEstimes, promos: new Set(), existants: [], recentes: new Set(), aleatoire: graine(seed), aujourdhui: new Date(2026, 10, 15),
      }
      const listeDe = (p: typeof plan) => genererListe({ repas: p, recettes: parId, alimentsParId: PAR_ID, stock, achats: [], prix: prixEstimes, gouts: new Map(), reglages: reglages() })
      const plan = normaliserRestes(genererPlanning(ctx))
      const ajuste = respecterBudget(plan, ctx, 50, (p) => totaux(listeDe(p)).total)
      const t = totaux(listeDe(ajuste.plan))
      console.log(`graine ${seed}: ${ajuste.plan.length} repas, ${new Set(ajuste.plan.map((p) => p.recetteId)).size} recettes, total ${t.total} € (dont ${t.placard} € placard), avant ajustement ${totaux(listeDe(plan)).total} €`)
      expect(ajuste.plan.length).toBe(plan.length)
      expect(t.total).toBeLessThanOrEqual(50)
    })
  }
})
