import { describe, expect, it } from 'vitest'
import type { ItemListe, ListeCourses } from '@/types'
import { prix } from '@/lib/format'
import { grouperParRayon, listeEnRappels, listeEnTexte, totauxExport } from './texte'
import { echapper, listeEnHtml } from './impression'

function article(p: Partial<ItemListe> & Pick<ItemListe, 'id' | 'nom' | 'rayon'>): ItemListe {
  return {
    quantiteBesoin: 1,
    unite: 'piece',
    nbFormats: 1,
    libelleFormat: 'la pièce',
    prixEstime: 1,
    sourcePrix: 'estimation',
    datePrix: '2026-11-01',
    raison: 'planning',
    coche: false,
    ...p,
  }
}

const LISTE: ListeCourses = {
  id: '2026-11-16',
  creeLe: '2026-11-15T10:00:00.000Z',
  majLe: '2026-11-15T10:00:00.000Z',
  validee: false,
  items: [
    article({ id: 'pates', nom: 'Pâtes', emoji: '🍝', rayon: 'epicerie-salee', libelleFormat: 'paquet de 500 g', nbFormats: 2, prixEstime: 1.8 }),
    article({ id: 'carotte', nom: 'Carotte', emoji: '🥕', rayon: 'fruits-legumes', libelleFormat: 'filet de 1 kg', prixEstime: 1.35 }),
    article({ id: 'banane', nom: 'Banane', emoji: '🍌', rayon: 'fruits-legumes', nbFormats: 5, prixEstime: 1.25 }),
    article({ id: 'lait', nom: 'Lait', emoji: '🥛', rayon: 'frais', libelleFormat: 'bouteille de 1 L', prixEstime: 1.1, coche: true }),
    article({ id: 'huile', nom: 'Huile d’olive', emoji: '🫒', rayon: 'epicerie-salee', libelleFormat: 'bouteille de 1 L', prixEstime: 6.5, placard: true }),
  ],
}

describe('grouperParRayon', () => {
  it('suit le parcours du magasin et met le placard à la fin', () => {
    const g = grouperParRayon(LISTE.items)
    expect(g.map((x) => x.rayon)).toEqual(['fruits-legumes', 'frais', 'epicerie-salee', 'placard'])
    expect(g[0].items.map((i) => i.nom)).toEqual(['Banane', 'Carotte'])
  })
})

describe('listeEnTexte', () => {
  const texte = listeEnTexte(LISTE)

  it('a un titre avec la semaine', () => {
    expect(texte.split('\n')[0]).toBe('🛒 Ma liste Popote — semaine du 16 novembre')
  })

  it('groupe par rayon, dans l’ordre, avec formats et prix', () => {
    const iFruits = texte.indexOf('Fruits et légumes')
    const iEpicerie = texte.indexOf('Épicerie salée')
    expect(iFruits).toBeGreaterThan(0)
    expect(iEpicerie).toBeGreaterThan(iFruits)
    expect(texte).toContain(`- 🍝 Pâtes : 2 × paquet de 500 g (${prix(1.8)})`)
    expect(texte).toContain(`- 🍌 Banane : 5 pièces (${prix(1.25)})`)
  })

  it('ignore les articles cochés', () => {
    expect(texte).not.toContain('Lait')
    expect(texte).not.toContain('Frais')
  })

  it('met le placard à part et hors du total', () => {
    expect(texte.indexOf('Placard')).toBeGreaterThan(texte.indexOf('Pâtes'))
    expect(texte).toContain(`Total estimé : ${prix(1.8 + 1.35 + 1.25)}`)
    expect(texte).toContain(`+ ${prix(6.5)} de placard`)
  })

  it('peut inclure les cochés et se passer des prix et emojis', () => {
    const t = listeEnTexte(LISTE, { inclureCoches: true, avecPrix: false, avecEmojis: false })
    expect(t).toContain('- Lait : bouteille de 1 L ✓')
    expect(t).not.toContain('€')
    expect(t).not.toContain('🍝')
  })

  it('dit quand il n’y a plus rien à acheter', () => {
    expect(listeEnTexte({ ...LISTE, items: [] })).toContain('Rien à acheter')
  })
})

describe('listeEnRappels', () => {
  const lignes = listeEnRappels(LISTE).split('\n')

  it('une ligne par article non coché, sans ligne vide ni puce', () => {
    expect(lignes).toEqual([
      'Banane (5 pièces)',
      'Carotte (filet de 1 kg)',
      'Pâtes (2 × paquet de 500 g)',
      'Huile d’olive (bouteille de 1 L, si besoin)',
    ])
  })

  it('aplatit les retours à la ligne dans un nom saisi à la main', () => {
    const l = { ...LISTE, items: [article({ id: 'x', nom: 'Sauce\npiquante', rayon: 'epicerie-salee' })] }
    expect(listeEnRappels(l)).toBe('Sauce piquante (1 pièce)')
  })
})

describe('totauxExport', () => {
  it('utilise le prix payé quand il existe', () => {
    expect(totauxExport([article({ id: 'a', nom: 'A', rayon: 'frais', prixEstime: 2, prixPaye: 1.5 })]).principal).toBe(1.5)
  })
})

describe('listeEnHtml (PDF)', () => {
  const html = listeEnHtml(LISTE, new Date('2026-11-15T12:00:00'))

  it('contient cases, quantités, prix, total et date', () => {
    expect(html).toContain('class="case"')
    expect(html).toContain('2 × paquet de 500 g')
    expect(html).toContain('Total estimé')
    expect(html).toContain(prix(4.4))
    expect(html).toContain('15 novembre 2026')
    expect(html).not.toContain('Lait')
  })

  it('échappe le HTML des noms saisis', () => {
    expect(echapper('<b>&"')).toBe('&lt;b&gt;&amp;&quot;')
    const l = { ...LISTE, items: [article({ id: 'x', nom: '<img src=x>', rayon: 'frais' })] }
    expect(listeEnHtml(l)).not.toContain('<img')
  })
})
