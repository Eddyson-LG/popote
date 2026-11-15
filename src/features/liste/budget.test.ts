/** Critère de réussite : avec les données de départ, une semaine complète tient sous 50 €. */
import { describe, expect, it } from 'vitest'
import recettes from '@/data/recettes.json'
import type { Recette } from '@/types'
import { genererPlanning, graine, normaliserRestes } from '@/features/recettes/planning'
import { genererListe, totaux } from './generer'
import { PAR_ID, prixEstimes, reglages } from '@/test/fixtures'

describe('budget de la semaine (données réelles)', () => {
  const R = recettes as Recette[]
  const parId = new Map(R.map((r) => [r.id, r]))
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`graine ${seed} : liste principale ≤ 50 €`, () => {
      const plan = normaliserRestes(
        genererPlanning({
          semaine: '2026-11-16', recettes: R, alimentsParId: PAR_ID, gouts: new Map(), reglages: reglages(), stock: [],
          prix: prixEstimes, promos: new Set(), existants: [], recentes: new Set(), aleatoire: graine(seed), aujourdhui: new Date(2026, 10, 15),
        }),
      )
      const liste = genererListe({ repas: plan, recettes: parId, alimentsParId: PAR_ID, stock: [], achats: [], prix: prixEstimes, gouts: new Map(), reglages: reglages() })
      const t = totaux(liste)
      console.log(`graine ${seed}: ${plan.length} repas, ${new Set(plan.map((p) => p.recetteId)).size} recettes, ${liste.length} articles, ${t.principal} € (+${t.placard} € placard)`)
      expect(t.principal).toBeLessThanOrEqual(50)
    })
  }
})
