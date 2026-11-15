import { describe, expect, it } from 'vitest'
import type { Repas } from '@/types'
import { achatsHabituels, arrondirAuFormat, besoinsDuPlanning, genererListe, substitutions, totaux, type ContexteListe } from './generer'
import { PAR_ID, RECETTES, prixEstimes, reglages } from '@/test/fixtures'
import { RAYONS } from '@/types'

const repas = (recetteId: string, jour: number, p: Partial<Repas> = {}): Repas => ({
  id: `s:${jour}:diner`, semaine: 's', jour: jour as Repas['jour'], type: 'diner', recetteId, portions: 1, verrouille: false, cuisine: false, ...p,
})
const ctx = (p: Partial<ContexteListe> = {}): ContexteListe => ({
  repas: [],
  recettes: new Map(RECETTES.map((r) => [r.id, r])),
  alimentsParId: PAR_ID,
  stock: [],
  achats: [],
  prix: prixEstimes,
  gouts: new Map(),
  reglages: reglages(),
  maintenant: new Date('2026-11-15'),
  ...p,
})

describe('liste de courses', () => {
  it('additionne les besoins et ignore les restes et les repas cuisinés', () => {
    const b = besoinsDuPlanning(ctx({ repas: [repas('riz-poulet', 0), repas('riz-poulet', 1, { restes: true }), repas('riz-poulet', 2, { cuisine: true })] }))
    expect(b.get('riz-blanc')).toBe(75)
  })
  it('arrondit aux formats vendus', () => {
    const pates = PAR_ID.get('pates')!
    expect(arrondirAuFormat(230, pates).nbFormats).toBe(1)
    expect(arrondirAuFormat(pates.formatVente.quantite + 1, pates).nbFormats).toBe(2)
  })
  it('retire ce qui est déjà en stock', () => {
    const l = genererListe(ctx({
      repas: [repas('riz-poulet', 0, { portions: 2 })],
      stock: [{ alimentId: 'riz-blanc', nom: 'Riz', quantite: 500, unite: 'g', emplacement: 'placard', ajouteLe: '' }],
    }))
    expect(l.some((i) => i.alimentId === 'riz-blanc')).toBe(false)
    expect(l.some((i) => i.alimentId === 'poulet-filet')).toBe(true)
  })
  it('trie par rayon et met le placard à part', () => {
    const l = genererListe(ctx({ repas: [repas('dahl', 0, { portions: 4 }), repas('pates-thon', 1)] }))
    const principaux = l.filter((i) => !i.placard)
    const idx = principaux.map((i) => RAYONS.indexOf(i.rayon))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    expect(l.find((i) => i.alimentId === 'curry')?.placard).toBe(true)
    expect(l[l.length - 1].placard).toBe(true)
  })
  it('ajoute un fruit (objectif) si la liste n’en a pas', () => {
    const l = genererListe(ctx({ repas: [repas('pates-thon', 0)] }))
    expect(l.find((i) => i.raison === 'objectif')?.alimentId).toBe('banane')
  })
  it('détecte les achats habituels', () => {
    const achats = ['2026-10-10', '2026-10-20', '2026-10-30'].map((date) => ({ alimentId: 'lait', date, quantite: 1000, unite: 'ml' as const }))
    expect(achatsHabituels(achats, new Date('2026-11-15'))).toContain('lait')
    expect(achatsHabituels(achats, new Date('2026-11-01'))).not.toContain('lait')
  })
  it('calcule un total et chaque article a une source de prix', () => {
    const l = genererListe(ctx({ repas: [repas('riz-poulet', 0)] }))
    for (const i of l) expect(i.sourcePrix).toBeTruthy()
    expect(totaux(l).principal).toBeGreaterThan(0)
  })
  it('propose des substitutions moins chères', () => {
    const c = ctx({ repas: [repas('saumon-four', 0, { portions: 3 })] })
    const saumon = genererListe(c).find((i) => i.alimentId === 'saumon-filet')!
    const subs = substitutions(saumon, c)
    expect(subs.length).toBeGreaterThan(0)
    expect(subs[0].economie).toBeGreaterThan(0)
  })
})
