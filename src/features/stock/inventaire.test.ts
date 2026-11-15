import { describe, expect, it } from 'vitest'
import type { Produit, StockItem } from '@/types'
import { PAR_ID } from '@/test/fixtures'
import {
  aConsommerVite,
  emplacementPourAliment,
  emplacementPourCategorie,
  etatPeremption,
  grouperParEmplacement,
  itemDepuisAliment,
  itemDepuisProduit,
  joursRestants,
  libellePeremption,
} from './inventaire'

const AUJ = '2026-11-15'
const item = (nom: string, emplacement: StockItem['emplacement'], peremption?: string): StockItem => ({
  nom,
  emplacement,
  peremption,
  quantite: 1,
  unite: 'piece',
  ajouteLe: '2026-11-01T00:00:00Z',
})

describe('péremption', () => {
  it('compte les jours restants, y compris au changement de mois', () => {
    expect(joursRestants('2026-11-18', AUJ)).toBe(3)
    expect(joursRestants('2026-12-01', '2026-11-30')).toBe(1)
    expect(joursRestants('2026-11-14', AUJ)).toBe(-1)
  })
  it('alerte à 3 jours ou moins', () => {
    expect(etatPeremption(item('a', 'frigo', '2026-11-18'), AUJ)).toBe('vite')
    expect(etatPeremption(item('a', 'frigo', '2026-11-15'), AUJ)).toBe('vite')
    expect(etatPeremption(item('a', 'frigo', '2026-11-19'), AUJ)).toBe('ok')
    expect(etatPeremption(item('a', 'frigo', '2026-11-10'), AUJ)).toBe('perime')
    expect(etatPeremption(item('a', 'placard'), AUJ)).toBe('inconnue')
  })
  it('libellés lisibles', () => {
    expect(libellePeremption('2026-11-15', AUJ)).toBe("à finir aujourd'hui")
    expect(libellePeremption('2026-11-16', AUJ)).toBe('à finir demain')
    expect(libellePeremption('2026-11-20', AUJ)).toBe('encore 5 j')
    expect(libellePeremption('2026-11-12', AUJ)).toBe('périmé depuis 3 j')
  })
  it('liste les urgents, du plus pressé au moins pressé', () => {
    const items = [item('yaourt', 'frigo', '2026-11-17'), item('riz', 'placard', '2027-06-01'), item('jambon', 'frigo', '2026-11-14'), item('sel', 'placard')]
    expect(aConsommerVite(items, AUJ).map((i) => i.nom)).toEqual(['jambon', 'yaourt'])
  })
})

describe('grouperParEmplacement', () => {
  it('ordonne frigo, congélateur, placard, et trie par péremption puis nom', () => {
    const g = grouperParEmplacement([
      item('riz', 'placard'),
      item('pâtes', 'placard', '2027-01-01'),
      item('lait', 'frigo', '2026-11-20'),
      item('beurre', 'frigo', '2026-11-16'),
    ])
    expect(g.map((x) => x.emplacement)).toEqual(['frigo', 'placard'])
    expect(g[0].items.map((i) => i.nom)).toEqual(['beurre', 'lait'])
    expect(g[1].items.map((i) => i.nom)).toEqual(['pâtes', 'riz'])
  })
})

describe('valeurs par défaut', () => {
  it('range selon le rayon', () => {
    expect(emplacementPourAliment(PAR_ID.get('epinards-surgeles')!)).toBe('congelateur')
    expect(emplacementPourAliment(PAR_ID.get('yaourt-nature')!)).toBe('frigo')
    expect(emplacementPourAliment(PAR_ID.get('pates')!)).toBe('placard')
    expect(emplacementPourCategorie('Pizzas surgelées')).toBe('congelateur')
    expect(emplacementPourCategorie('Yaourts nature')).toBe('frigo')
    expect(emplacementPourCategorie(undefined)).toBe('placard')
  })
  it('construit une ligne depuis un aliment (format de vente, conservation)', () => {
    const a = PAR_ID.get('carotte')!
    const l = itemDepuisAliment(a, AUJ)
    expect(l).toMatchObject({ alimentId: 'carotte', quantite: a.formatVente.quantite, unite: a.uniteBase, emplacement: 'frigo', peremption: '2026-12-06' })
  })
  it('construit une ligne depuis un produit scanné', () => {
    const p: Produit = { codeBarres: '1', nom: 'Fusilli', marque: 'Panzani', alimentId: 'pates', quantiteNormalisee: { quantite: 500, unite: 'g' }, source: 'open-food-facts', majLe: '' }
    expect(itemDepuisProduit(p, PAR_ID.get('pates'), AUJ)).toMatchObject({ nom: 'Fusilli (Panzani)', codeBarres: '1', alimentId: 'pates', quantite: 500, unite: 'g', emplacement: 'placard' })
    const sansQ: Produit = { codeBarres: '2', nom: 'Truc', source: 'manuel', majLe: '' }
    expect(itemDepuisProduit(sansQ, undefined, AUJ)).toMatchObject({ quantite: 1, unite: 'piece', emplacement: 'placard' })
  })
})
