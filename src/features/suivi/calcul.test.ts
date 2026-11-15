import { describe, expect, it } from 'vitest'
import type { Repas } from '@/types'
import { bilan, messageMotivant } from './calcul'

const repas = (type: Repas['type'], cuisineLe: string): Repas => ({ id: cuisineLe + type, semaine: '2026-11-09', jour: 0, type, recetteId: 'r', portions: 1, verrouille: false, cuisine: true, cuisineLe })

describe('suivi des économies', () => {
  const now = new Date('2026-11-13T12:00:00') // un vendredi
  const b = bilan(
    {
      depenses: [{ date: '2026-11-10T10:00:00Z', montant: 38.4, origine: 'liste' }, { date: '2026-10-28T10:00:00Z', montant: 40, origine: 'ticket' }],
      dehors: [{ date: '2026-11-12T20:00:00Z', montant: 6, type: 'sandwich' }],
      repas: [repas('gamelle', '2026-11-12T18:00:00Z'), repas('gamelle', '2026-11-13T18:00:00Z'), repas('diner', '2026-11-03T19:00:00Z'), repas('petit-dejeuner', '2026-11-03T08:00:00Z')],
      coutPortion: () => 1.5,
      prixRepasDehors: 5,
    },
    now,
  )
  it('compte une course du dimanche dans la semaine qui suit', () => {
    const dimanche = bilan({ depenses: [{ date: '2026-11-15T10:00:00', montant: 20, origine: 'liste' }], dehors: [], repas: [], coutPortion: () => 0, prixRepasDehors: 5 }, new Date('2026-11-16T12:00:00'))
    expect(dimanche.depenseSemaine).toBe(20)
  })
  it('sépare semaine et mois', () => {
    expect(b.depenseSemaine).toBe(38.4)
    expect(b.depenseMois).toBe(38.4)
    expect(b.dehorsSemaine).toBe(6)
  })
  it('compte les gamelles et l’économie (petits-déj exclus)', () => {
    expect(b.gamellesMois).toBe(2)
    expect(b.repasMaisonMois).toBe(3)
    expect(b.economieMois).toBe(10.5)
  })
  it('formule un message motivant', () => {
    expect(messageMotivant(b, 5)).toBe('2 gamelles et 3 repas maison ce mois = 11 € économisés 🔥')
  })
})
