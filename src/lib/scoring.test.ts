import { describe, expect, it } from 'vitest'
import type { Gout } from '@/types'
import { calculerScore, recetteExclue, scoreRecette, type CarteGouts } from './scoring'
import { PAR_ID, RECETTES, reglages } from '@/test/fixtures'

const g = (cible: Gout['cible'], refId: string, p: Partial<Gout>): [string, Gout] => {
  const gout: Gout = { id: `${cible}:${refId}`, cible, refId, achats: 0, score: 0, majLe: '', ...p }
  gout.score = calculerScore(gout)
  return [gout.id, gout]
}

describe('scoring', () => {
  it('ordonne les verdicts', () => {
    const s = (verdict: Gout['verdict']) => calculerScore({ verdict, achats: 0 })
    expect(s('adore')).toBeGreaterThan(s('aime'))
    expect(s('aime')).toBeGreaterThan(s('pas-souvent'))
    expect(s('pas-souvent')).toBeGreaterThan(s('jamais'))
    expect(s('jamais')).toBe(-1)
  })
  it('tient compte des notes et des achats', () => {
    expect(calculerScore({ verdict: 'aime', note: 5, achats: 0 })).toBeGreaterThan(calculerScore({ verdict: 'aime', achats: 0 }))
    expect(calculerScore({ verdict: 'aime', note: 1, achats: 0 })).toBeLessThan(0)
    expect(calculerScore({ achats: 4 })).toBeCloseTo(0.2)
  })
  it('exclut une recette dont un ingrédient est « jamais »', () => {
    const gouts: CarteGouts = new Map([g('aliment', 'thon-boite', { verdict: 'jamais' })])
    const pates = RECETTES.find((r) => r.id === 'pates-thon')!
    expect(recetteExclue(pates, PAR_ID, reglages(), gouts)).toBe(true)
    expect(recetteExclue(RECETTES[0], PAR_ID, reglages(), gouts)).toBe(false)
  })
  it('exclut un aliment de la famille fromage, mais pas le pesto', () => {
    const tomme = { ...PAR_ID.get('skyr')!, id: 'tomme', nom: 'Tomme', tags: ['fromage' as const] }
    const parId = new Map([...PAR_ID, ['tomme', tomme]])
    const avec = (id: string) => ({ ...RECETTES[0], ingredients: [...RECETTES[0].ingredients, { alimentId: id, quantite: 30, unite: 'g' as const }] })
    expect(recetteExclue(avec('tomme'), parId, reglages(), new Map())).toBe(true)
    expect(recetteExclue(avec('pesto-basilic'), parId, reglages(), new Map())).toBe(false)
    // Si l'utilisateur débannit la famille fromage, la tomme repasse.
    expect(recetteExclue(avec('tomme'), parId, reglages({ exclusions: ['puree', 'soupe'] }), new Map())).toBe(false)
  })
  it('remonte une recette dont les ingrédients sont adorés', () => {
    const gouts: CarteGouts = new Map([g('aliment', 'poulet-filet', { verdict: 'adore' }), g('aliment', 'riz-blanc', { verdict: 'aime' })])
    expect(scoreRecette(RECETTES[0], gouts)).toBeGreaterThan(scoreRecette(RECETTES[3], gouts))
  })
})
