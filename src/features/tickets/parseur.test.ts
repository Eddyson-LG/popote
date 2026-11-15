import { describe, expect, it } from 'vitest'
import { detecterDate, detecterEnseigne, lireNombre, parserTicket } from './parseur'
import { TICKET_CARREFOUR, TICKET_LECLERC, TICKET_LIDL } from './fixtures'

describe('parserTicket — Lidl', () => {
  const t = parserTicket(TICKET_LIDL)
  it('enseigne, date et total', () => {
    expect(t.enseigne).toBe('Lidl')
    expect(t.date).toBe('2026-11-14')
    expect(t.total).toBe(12.83)
  })
  it('lignes, pesée, détail de quantité et remise rattachée', () => {
    expect(t.lignes.map((l) => l.libelle)).toEqual(['PDT 2.5KG', 'BANANE CAT1', 'LAIT DEMI ECREME 1L', 'OEUFS PLEIN AIR X12', 'PATES PENNE 500G'])
    expect(t.lignes[0].prix).toBe(2.49)
    expect(t.lignes[1]).toMatchObject({ prix: 1.52, poidsKg: 0.875, prixAuKg: 1.74 })
    expect(t.lignes[2]).toMatchObject({ prix: 5.34, quantite: 6 })
    expect(t.lignes[3]).toMatchObject({ prix: 2.69, remise: 0.5 })
  })
  it('ignore TVA et paiement après le total', () => {
    expect(t.lignes.some((l) => /TVA|CB/.test(l.libelle))).toBe(false)
  })
  it('la somme des lignes égale le total', () => {
    expect(Math.round(t.lignes.reduce((s, l) => s + l.prix, 0) * 100) / 100).toBe(t.total)
  })
})

describe('parserTicket — Leclerc', () => {
  const t = parserTicket(TICKET_LECLERC)
  it('enseigne, date, total', () => {
    expect(t.enseigne).toBe('Leclerc')
    expect(t.date).toBe('2026-11-09')
    expect(t.total).toBe(6.93)
  })
  it('libellé sur une ligne, détail en dessous', () => {
    expect(t.lignes.find((l) => l.libelle === 'YAOURT NATURE')).toMatchObject({ prix: 2.4, quantite: 2 })
    expect(t.lignes.find((l) => l.libelle === 'COURGETTE VRAC')).toMatchObject({ prix: 1.03, poidsKg: 0.412 })
  })
  it('remise « 0,30- » déduite de l’article précédent', () => {
    expect(t.lignes.find((l) => l.libelle.startsWith('THON'))).toMatchObject({ prix: 1.35, remise: 0.3 })
    expect(t.lignes).toHaveLength(4)
  })
})

describe('parserTicket — Carrefour', () => {
  const t = parserTicket(TICKET_CARREFOUR)
  it('enseigne, date, total', () => {
    expect(t.enseigne).toBe('Carrefour')
    expect(t.date).toBe('2026-11-02')
    expect(t.total).toBe(15.44)
  })
  it('code TVA numérique final et « x2 »', () => {
    expect(t.lignes).toHaveLength(5)
    expect(t.lignes[0]).toEqual({ libelle: 'CAROTTES 1KG', prix: 1.19 })
    expect(t.lignes[2]).toMatchObject({ libelle: 'SPAGHETTI 500G', quantite: 2, prix: 1.58 })
  })
  it('les rubriques « >> RAYON » ne deviennent pas des articles', () => {
    expect(t.lignes.some((l) => l.libelle.includes('EPICERIE'))).toBe(false)
  })
})

describe('cas particuliers', () => {
  it('remise isolée (sans article juste avant) gardée en ligne négative', () => {
    const t = parserTicket('SOUS TOTAL 10,00\nREMISE FIDELITE -1,00\nTOTAL 9,00')
    expect(t.lignes).toEqual([{ libelle: 'REMISE FIDELITE', prix: -1 }])
    expect(t.total).toBe(9)
  })
  it('« 2 x 1,29 » dans le libellé', () => {
    const t = parserTicket('BISCUITS 2 x 1,29 2,58')
    expect(t.lignes[0]).toMatchObject({ libelle: 'BISCUITS', quantite: 2, prix: 2.58 })
  })
  it('pesée sur la même ligne que le libellé', () => {
    const t = parserTicket('TOMATE GRAPPE 0,650 kg x 2,99 €/kg 1,94')
    expect(t.lignes[0]).toMatchObject({ libelle: 'TOMATE GRAPPE', poidsKg: 0.65, prix: 1.94 })
  })
  it('total sur la ligne suivante', () => {
    expect(parserTicket('PAIN 1,10\nTOTAL\n1,10').total).toBe(1.1)
  })
  it('repli sur le montant CB sans total', () => {
    expect(parserTicket('PAIN 1,10\nCB 1,10').total).toBe(1.1)
  })
  it('confusion OCR O/0 dans un prix', () => {
    expect(parserTicket('SEL FIN 1KG 0,5O A').lignes[0].prix).toBe(0.5)
  })
  it('« LAIT PROMO » reste un article', () => {
    expect(parserTicket('LAIT PROMO 1,05').lignes[0]).toEqual({ libelle: 'LAIT PROMO', prix: 1.05 })
  })
  it('texte vide', () => {
    expect(parserTicket('')).toEqual({ enseigne: undefined, date: undefined, lignes: [], total: undefined })
  })
})

describe('détections', () => {
  it.each([
    ['INTERMARCHE SUPER', 'Intermarché'],
    ['Intermarché', 'Intermarché'],
    ['SUPER U TARADEAU', 'Super U'],
    ['E. LECLERC', 'Leclerc'],
    ['AUCHAN', 'Auchan'],
    ['bonjour', undefined],
  ])('enseigne de %s', (txt, attendu) => expect(detecterEnseigne(txt)).toBe(attendu))
  it.each([
    ['14/11/2026 10:00', '2026-11-14'],
    ['1.3.26', '2026-03-01'],
    ['45/13/2026', undefined],
  ])('date de %s', (txt, attendu) => expect(detecterDate(txt)).toBe(attendu))
  it('lireNombre', () => {
    expect(lireNombre('1,29')).toBe(1.29)
    expect(lireNombre('12 ,5')).toBe(12.5)
  })
})
