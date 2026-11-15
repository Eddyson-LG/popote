import { describe, expect, it } from 'vitest'
import type { ItemListe, Magasin, PrixAffiche } from '@/types'
import { medianeObservations, versObservation } from './openPrices'
import { comparerMagasins, meilleureRepartition } from './comparateur'
import { meilleurPrix } from '@/lib/prix'
import { PAR_ID } from '@/test/fixtures'

const ctx = { alimentsParId: PAR_ID, produits: new Map(), magasins: [{ id: 'lidl', enseigne: 'Lidl', ville: '', actif: true, osmId: 42 }] as Magasin[] }
const op = (p: Partial<Parameters<typeof versObservation>[0]>) =>
  ({ type: 'CATEGORY', product_code: null, category_tag: 'en:carrots', price: 1.5, currency: 'EUR', price_per: 'KILOGRAM', date: '2026-11-01', ...p }) as Parameters<typeof versObservation>[0]

describe('Open Prices', () => {
  it('convertit un prix au kg de catégorie', () => {
    const o = versObservation(op({ location_osm_id: 42 }), ctx, 'local')!
    expect(o).toMatchObject({ alimentId: 'carotte', prix: 1.5, quantite: 1000, unite: 'g', source: 'open-prices', magasinId: 'lidl' })
  })
  it('convertit un prix au kg pour un aliment compté à la pièce', () => {
    const o = versObservation(op({ category_tag: 'en:bananas', price: 2 }), ctx, 'national')!
    expect(o.unite).toBe('piece')
    expect(o.quantite).toBeCloseTo(1000 / PAR_ID.get('banane')!.poidsPieceG!)
    expect(o.magasinId).toBeUndefined()
  })
  it('ignore les catégories inconnues et les autres devises', () => {
    expect(versObservation(op({ category_tag: 'en:unicorns' }), ctx, 'local')).toBeNull()
    expect(versObservation(op({ currency: 'USD' }), ctx, 'local')).toBeNull()
  })
  it('calcule une médiane', () => {
    const obs = [1, 2, 9].map((prix) => versObservation(op({ price: prix }), ctx, 'national')!)
    expect(medianeObservations(obs)?.prix).toBe(2)
  })
})

describe('meilleur prix', () => {
  const p = (x: Partial<PrixAffiche>): PrixAffiche => ({ prixUnitaire: 1, unitePrix: 'kg', source: 'estimation', date: '2026-11-01', estime: true, ...x })
  it('préfère un prix constaté récent à une estimation', () => {
    expect(meilleurPrix([p({}), p({ source: 'ticket', estime: false, prixUnitaire: 2, date: '2026-11-10' })], new Date('2026-11-15'))?.source).toBe('ticket')
  })
  it('préfère une promo', () => {
    expect(meilleurPrix([p({ source: 'ticket', estime: false }), p({ source: 'promo', estime: false })])?.source).toBe('promo')
  })
})

describe('comparateur', () => {
  const magasins: Magasin[] = [
    { id: 'a', enseigne: 'A', ville: '', actif: true },
    { id: 'b', enseigne: 'B', ville: '', actif: true },
  ]
  const item = (alimentId: string): ItemListe => {
    const al = PAR_ID.get(alimentId)!
    return { id: alimentId, alimentId, nom: al.nom, rayon: al.rayon, quantiteBesoin: al.formatVente.quantite, unite: al.uniteBase, nbFormats: 1, libelleFormat: al.formatVente.libelle, prixEstime: 1, sourcePrix: 'estimation', datePrix: '', raison: 'planning', coche: false }
  }
  // A est moins cher sur les carottes, B sur le riz.
  const prix = (id: string, m?: string): PrixAffiche | null => {
    const base = { unitePrix: 'kg' as const, date: '2026-11-10', estime: false, source: 'ticket' as const, magasinId: m }
    if (id === 'carotte') return { ...base, prixUnitaire: m === 'a' ? 1 : 6 }
    if (id === 'riz-blanc') return { ...base, prixUnitaire: m === 'b' ? 1 : 6 }
    return null
  }
  it('totalise par magasin, du moins cher au plus cher', () => {
    const t = comparerMagasins([item('carotte'), item('riz-blanc')], magasins, PAR_ID, prix)
    expect(t).toHaveLength(2)
    expect(t[0].couverture).toBe(1)
  })
  it('propose une répartition si l’économie dépasse le seuil', () => {
    const r = meilleureRepartition([item('carotte'), item('riz-blanc')], magasins, PAR_ID, prix, 3)
    expect(r?.affectation).toEqual({ carotte: 'a', 'riz-blanc': 'b' })
    expect(meilleureRepartition([item('carotte'), item('riz-blanc')], magasins, PAR_ID, prix, 100)).toBeNull()
  })
})
