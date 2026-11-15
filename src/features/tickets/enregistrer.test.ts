import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { ALIMENTS } from '@/test/fixtures'
import { chargerAppris, enregistrerTicket } from './enregistrer'

describe('enregistrerTicket (IndexedDB simulée)', () => {
  beforeEach(async () => {
    await Promise.all([db.prix.clear(), db.achats.clear(), db.depenses.clear(), db.gouts.clear(), db.meta.clear()])
    await db.aliments.bulkPut(ALIMENTS)
  })

  it('prix, achats, goûts, dépense et corrections apprises', async () => {
    const r = await enregistrerTicket({
      date: '2026-11-14',
      magasinId: 'lidl',
      total: 12.83,
      lignes: [
        { libelle: 'PDT 2.5KG', prix: 2.49, alimentId: 'pomme-de-terre' },
        { libelle: 'BANANE CAT1', prix: 1.52, poidsKg: 0.875, alimentId: 'banane' },
        { libelle: 'MON TRUC', prix: 3, alimentId: 'riz-blanc', alimentManuel: true },
        { libelle: 'SAC', prix: 0.1 },
        { libelle: 'REMISE', prix: -0.5 },
      ],
    })
    expect(r).toEqual({ montant: 12.83, prix: 3 })
    const prix = await db.prix.toArray()
    expect(prix.map((p) => [p.alimentId, p.quantite, p.unite, p.source, p.magasinId])).toEqual([
      ['pomme-de-terre', 2500, 'g', 'ticket', 'lidl'],
      ['banane', 7, 'piece', 'ticket', 'lidl'], // 875 g ÷ 120 g par pièce
      ['riz-blanc', 1000, 'g', 'ticket', 'lidl'],
    ])
    expect(await db.achats.count()).toBe(3)
    expect((await db.gouts.get('aliment:banane'))?.achats).toBe(1)
    expect(await db.depenses.toArray()).toMatchObject([{ montant: 12.83, origine: 'ticket', magasinId: 'lidl' }])
    expect(await chargerAppris()).toEqual({ 'mon truc': 'riz-blanc' })
  })

  it('sans total : somme des lignes', async () => {
    const r = await enregistrerTicket({ lignes: [{ libelle: 'A', prix: 1.2 }, { libelle: 'B', prix: 0.8 }] })
    expect(r.montant).toBe(2)
  })
  it('remplace la dépense d’une liste validée le même jour dans le même magasin (pas de double comptage)', async () => {
    await db.depenses.add({ date: new Date().toISOString(), montant: 30, magasinId: 'lidl', origine: 'liste' })
    await enregistrerTicket({ magasinId: 'lidl', lignes: [{ libelle: 'A', prix: 20 }, { libelle: 'B', prix: 8.5 }] })
    const d = await db.depenses.toArray()
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ montant: 28.5, origine: 'ticket' })
  })
})
