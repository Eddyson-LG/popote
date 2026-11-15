import { describe, expect, it } from 'vitest'
import { creerAlimentPerso, libelleFormat } from './alimentsPerso'
import { ALIMENTS } from '@/test/fixtures'
import { zAliment } from '@/types/schemas'

const saisie = { nom: 'tofu soyeux', categorie: 'proteine-vegetale' as const, rayon: 'frais' as const, uniteBase: 'g' as const, quantiteFormat: 400 }

describe('aliments perso', () => {
  it('crée un aliment valide avec un id unique', () => {
    const a = creerAlimentPerso(saisie, ALIMENTS)!
    expect(a.id).toBe('perso-tofu-soyeux')
    expect(a.nom).toBe('Tofu soyeux')
    expect(a.perso).toBe(true)
    expect(a.formatVente.libelle).toBe('paquet de 400 g')
    expect(() => zAliment.parse(a)).not.toThrow()
    expect(creerAlimentPerso(saisie, [...ALIMENTS, { ...a, nom: 'Autre' }])!.id).toBe('perso-tofu-soyeux-2')
  })
  it('refuse un doublon de nom (accents et majuscules ignorés) ou une saisie vide', () => {
    expect(creerAlimentPerso({ ...saisie, nom: 'BANANE' }, ALIMENTS)).toBeNull()
    expect(creerAlimentPerso({ ...saisie, nom: ' ' }, ALIMENTS)).toBeNull()
    expect(creerAlimentPerso({ ...saisie, quantiteFormat: 0 }, ALIMENTS)).toBeNull()
  })
  it('écrit des libellés de format lisibles', () => {
    expect(libelleFormat(1500, 'g')).toBe('paquet de 1,5 kg')
    expect(libelleFormat(1, 'piece')).toBe('la pièce')
    expect(libelleFormat(1000, 'ml')).toBe('bouteille de 1 L')
  })
})
