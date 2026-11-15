import { beforeEach, describe, expect, it } from 'vitest'
import { ALIMENTS } from '@/test/fixtures'
import { db } from '@/lib/db'
import nutella from './fixtures/off-nutella.json'
import inconnu from './fixtures/off-inconnu.json'
import {
  _reinitialiserQuota,
  analyserReponseOff,
  codeBarresValide,
  correspondreAliment,
  lireQuantiteTexte,
  normaliserQuantite,
  rechercherAliments,
  rechercherProduitDetaille,
} from './off'

describe('analyserReponseOff', () => {
  it('extrait les champs utiles de la fixture Nutella', () => {
    const p = analyserReponseOff(nutella, '3017624010701', ALIMENTS, new Date('2026-11-15T10:00:00Z'))
    expect(p).toMatchObject({
      codeBarres: '3017624010701',
      nom: 'Nutella',
      marque: 'Ferrero',
      nutriscore: 'e',
      categorie: 'Pâtes à tartiner aux noisettes',
      quantiteTexte: '400.0 g',
      quantiteNormalisee: { quantite: 400, unite: 'g' },
      alimentId: 'pate-a-tartiner',
      source: 'open-food-facts',
      majLe: '2026-11-15T10:00:00.000Z',
    })
    expect(p?.imageUrl).toMatch(/^https:\/\/images\.openfoodfacts\.org\//)
  })

  it('renvoie null pour un produit inconnu ou une réponse vide', () => {
    expect(analyserReponseOff(inconnu, '0000000000000', ALIMENTS)).toBeNull()
    expect(analyserReponseOff(null, '1', ALIMENTS)).toBeNull()
    expect(analyserReponseOff({ status: 'success', product: { code: '1' } }, '1', ALIMENTS)).toBeNull()
  })

  it('ignore un Nutri-Score hors a–e et une image hors domaine OFF', () => {
    const p = analyserReponseOff(
      { status: 'success', product: { product_name: 'Truc', nutriscore_grade: 'unknown', image_front_small_url: 'javascript:alert(1)' } },
      '123',
      ALIMENTS,
    )
    expect(p?.nutriscore).toBeUndefined()
    expect(p?.imageUrl).toBeUndefined()
    expect(p?.codeBarres).toBe('123')
  })
})

describe('normaliserQuantite', () => {
  it('convertit les unités vers g ou ml', () => {
    expect(normaliserQuantite(400, 'g')).toEqual({ quantite: 400, unite: 'g' })
    expect(normaliserQuantite('1', 'kg')).toEqual({ quantite: 1000, unite: 'g' })
    expect(normaliserQuantite(1.5, 'L')).toEqual({ quantite: 1500, unite: 'ml' })
    expect(normaliserQuantite(33, 'cl')).toEqual({ quantite: 330, unite: 'ml' })
  })
  it('se replie sur le texte quand product_quantity manque', () => {
    expect(normaliserQuantite(undefined, undefined, '6 x 125 g')).toEqual({ quantite: 750, unite: 'g' })
    expect(normaliserQuantite(undefined, undefined, '1,5 L')).toEqual({ quantite: 1500, unite: 'ml' })
    expect(normaliserQuantite(1000, '', '1 l')).toEqual({ quantite: 1000, unite: 'ml' })
    expect(normaliserQuantite(undefined, undefined, '12 œufs')).toBeUndefined()
    expect(normaliserQuantite(0, 'g')).toBeUndefined()
  })
  it('lit des textes variés', () => {
    expect(lireQuantiteTexte('500g')).toEqual({ quantite: 500, unite: 'g' })
    expect(lireQuantiteTexte('Pack 4×20 cl')).toEqual({ quantite: 800, unite: 'ml' })
  })
})

describe('correspondreAliment', () => {
  it('trouve par le nom, en préférant le terme le plus spécifique', () => {
    expect(correspondreAliment({ nom: 'Pâtes complètes Fusilli' }, ALIMENTS)).toBe('pates-completes')
    expect(correspondreAliment({ nom: 'Lentilles corail bio' }, ALIMENTS)).toBe('lentilles-corail')
    expect(correspondreAliment({ nom: 'CAROTTES râpées' }, ALIMENTS)).toBe('carotte')
  })
  it('se replie sur les catégories françaises puis anglaises', () => {
    expect(correspondreAliment({ nom: 'Panzani n°5', categoriesFr: ['Aliments d’origine végétale', 'Pâtes alimentaires'] }, ALIMENTS)).toBe('pates')
    expect(correspondreAliment({ nom: 'Marque X', categoriesTags: ['en:dairies', 'en:milks'] }, ALIMENTS)).toBe('lait')
  })
  it('ne force pas de correspondance', () => {
    expect(correspondreAliment({ nom: 'Coca-Cola', categoriesTags: ['en:sodas'] }, ALIMENTS)).toBeUndefined()
  })
})

describe('rechercherAliments', () => {
  it('ignore accents et casse, et cherche dans les synonymes', () => {
    expect(rechercherAliments(ALIMENTS, 'PATES').map((a) => a.id)).toContain('pates')
    expect(rechercherAliments(ALIMENTS, 'oeuf')[0].id).toBe('oeuf')
    expect(rechercherAliments(ALIMENTS, 'pdt').map((a) => a.id)).toContain('pomme-de-terre')
    expect(rechercherAliments(ALIMENTS, 'z')).toEqual([])
  })
})

describe('codeBarresValide', () => {
  it('vérifie la clé de contrôle', () => {
    expect(codeBarresValide('3017624010701')).toBe(true)
    expect(codeBarresValide('3017624010702')).toBe(false)
    expect(codeBarresValide('96385074')).toBe(true)
    expect(codeBarresValide('abc')).toBe(false)
  })
})

describe('rechercherProduitDetaille', () => {
  beforeEach(async () => {
    _reinitialiserQuota()
    await db.produits.clear()
    await db.aliments.clear()
    await db.aliments.bulkPut(ALIMENTS)
  })
  const repondre = (status: number, corps: unknown) => (async () => new Response(JSON.stringify(corps), { status })) as unknown as typeof fetch

  it('met le produit trouvé en cache, puis le relit sans réseau', async () => {
    const r = await rechercherProduitDetaille('3017624010701', repondre(200, nutella))
    expect(r.statut).toBe('trouve')
    expect(await db.produits.get('3017624010701')).toMatchObject({ nom: 'Nutella' })
    const echec = (async () => {
      throw new Error('pas de réseau')
    }) as unknown as typeof fetch
    const r2 = await rechercherProduitDetaille('3017624010701', echec)
    expect(r2).toMatchObject({ statut: 'trouve', depuisCache: true })
  })

  it('404 → inconnu, erreur réseau → hors-ligne', async () => {
    expect((await rechercherProduitDetaille('0000000000000', repondre(404, inconnu))).statut).toBe('inconnu')
    const echec = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect((await rechercherProduitDetaille('5000000000002', echec)).statut).toBe('hors-ligne')
  })
})
