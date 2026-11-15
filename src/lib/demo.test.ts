import { describe, expect, it } from 'vitest'
import { db } from './db'
import { chargerDemo } from './demo'
import { semaineActive } from './dates'
import { totaux } from '@/features/liste/generer'

describe('données de démo (intégration de bout en bout)', () => {
  it('produit un planning complet et une liste sous le budget', async () => {
    await chargerDemo()
    const [repas, liste, reglages] = await Promise.all([db.repas.where('semaine').equals(semaineActive()).toArray(), db.listes.get(semaineActive()), db.reglages.get('moi')])
    expect(reglages?.onboardingFait).toBe(true)
    expect(repas.length).toBeGreaterThan(20)
    expect(liste?.items.length).toBeGreaterThan(10)
    expect(totaux(liste!.items).principal).toBeLessThanOrEqual(50)
    // Chaque article affiche une source et une date de prix.
    for (const i of liste!.items) expect(i.sourcePrix && i.datePrix).toBeTruthy()
    // Les prix constatés (tickets) ont pris le dessus sur l'estimation.
    expect(liste!.items.some((i) => i.sourcePrix === 'ticket')).toBe(true)
  })
})
