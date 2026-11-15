import { describe, expect, it } from 'vitest'
import { ALIMENTS, PAR_ID } from '@/test/fixtures'
import { associer, chercherAliments, cleLibelle, indexerAliments } from './correspondance'
import { contenanceDuLibelle, dateIsoTicket, magasinPourEnseigne, piecesDuLibelle, quantiteAchetee } from './enregistrer'

const index = indexerAliments(ALIMENTS)

describe('associer (vrais aliments)', () => {
  it.each([
    ['PDT 2.5KG', 'pomme-de-terre'],
    ['BANANE CAT1', 'banane'],
    ['LAIT DEMI ECREME 1L', 'lait'],
    ['OEUFS PLEIN AIR X12', 'oeuf'],
    ['RIZ BASMATI 1KG', 'riz-basmati'],
    ['CAROTTES 1KG', 'carotte'],
    ['COURGETTE VRAC', 'courgette'],
    ['THON NATUREL 140G', 'thon-boite'],
    ['SPAGHETTI 500G', 'spaghetti'],
    ['HUILE OLIVE 75CL', 'huile-olive'],
    ['CAFE MOULU 250G', 'cafe'],
    ['YAOURT NATURE', 'yaourt-nature'],
    ['POMMES GOLDEN 1KG', 'pomme'],
    ['LENT CORAIL 500G', 'lentilles-corail'],
    ['STEAK HACHE 5%', 'boeuf-hache'],
  ])('%s → %s', (libelle, id) => {
    expect(associer(libelle, index)?.aliment.id).toBe(id)
  })

  it('pas d’association pour un libellé sans rapport', () => {
    expect(associer('SAC CABAS REUTILISABLE', index)).toBeNull()
    expect(associer('12345', index)).toBeNull()
  })

  it('confiance haute sur un nom exact, plus faible sur une abréviation partielle', () => {
    expect(associer('BANANE', index)?.confiance).toBe('haute')
    const c = chercherAliments('POMMES', index)
    expect(c[0].aliment.id).toBe('pomme')
    expect(c.find((x) => x.aliment.id === 'pomme-de-terre')?.score ?? 0).toBeLessThan(c[0].score)
  })

  it('les corrections apprises priment', () => {
    const appris = { [cleLibelle('BANANE CAT1')]: 'plantain-inexistant', [cleLibelle('MON PRODUIT')]: 'riz-blanc' }
    expect(associer('MON PRODUIT 1KG', index, appris)?.aliment.id).toBe('riz-blanc')
    // un id appris inconnu est ignoré
    expect(associer('BANANE CAT1', index, appris)?.aliment.id).toBe('banane')
  })
})

describe('quantités achetées', () => {
  it('contenance et lots dans le libellé', () => {
    expect(contenanceDuLibelle('PDT 2.5KG')).toEqual({ quantite: 2500, unite: 'g' })
    expect(contenanceDuLibelle('LAIT 6X1L')).toEqual({ quantite: 6000, unite: 'ml' })
    expect(contenanceDuLibelle('HUILE OLIVE 75CL')).toEqual({ quantite: 750, unite: 'ml' })
    expect(contenanceDuLibelle('BANANE CAT1')).toBeUndefined()
    expect(piecesDuLibelle('OEUFS PLEIN AIR X12')).toBe(12)
    expect(piecesDuLibelle('YAOURT 4X125G')).toBe(4)
  })
  it('dans l’unité de base de l’aliment', () => {
    expect(quantiteAchetee({ libelle: 'PDT 2.5KG' }, PAR_ID.get('pomme-de-terre')!)).toEqual({ quantite: 2500, unite: 'g' })
    expect(quantiteAchetee({ libelle: 'COURGETTE VRAC', poidsKg: 0.412 }, PAR_ID.get('carotte')!)).toEqual({ quantite: 412, unite: 'g' })
    expect(quantiteAchetee({ libelle: 'LAIT 1L', quantite: 6 }, PAR_ID.get('lait')!)).toEqual({ quantite: 6000, unite: 'ml' })
    expect(quantiteAchetee({ libelle: 'OEUFS X12' }, PAR_ID.get('oeuf')!)).toEqual({ quantite: 12, unite: 'piece' })
  })
  it('repli sur le format de vente', () => {
    expect(quantiteAchetee({ libelle: 'COURGETTE' }, PAR_ID.get('courgette')!)).toEqual({ quantite: 1, unite: 'piece' })
    expect(quantiteAchetee({ libelle: 'RIZ', quantite: 2 }, PAR_ID.get('riz-blanc')!)).toEqual({ quantite: 2000, unite: 'g' })
  })
  it('magasin et date', () => {
    const mags = [{ id: 'lidl', enseigne: 'Lidl', ville: '', actif: true }, { id: 'inter', enseigne: 'Intermarche', ville: '', actif: true }]
    expect(magasinPourEnseigne('Lidl', mags)?.id).toBe('lidl')
    expect(magasinPourEnseigne('Intermarché', mags)?.id).toBe('inter')
    expect(magasinPourEnseigne('Aldi', mags)).toBeUndefined()
    expect(new Date(dateIsoTicket('2026-11-14')).getDate()).toBe(14)
  })
})
