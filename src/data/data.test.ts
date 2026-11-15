/**
 * Vérification automatique des données de départ.
 * - format conforme aux types partagés
 * - identifiants uniques et cohérents entre fichiers
 * - AUCUNE recette avec du fromage, de la purée ou de la soupe
 */
import { describe, expect, it } from 'vitest'
import aliments from './aliments.json'
import recettes from './recettes.json'
import prixRef from './prix-reference.json'
import contrat from './contrat-aliments.json'
import { zAliment, zFichierPrixReference, zRecette } from '@/types/schemas'

/** Mots interdits dans le nom, les étapes ou les ingrédients d'une recette. */
const INTERDITS = [
  /fromage/i, /gruy[eè]re/i, /emmental/i, /parmesan/i, /comt[eé]/i, /mozzarella/i, /ch[eè]vre/i,
  /feta/i, /f[eé]ta/i, /raclette/i, /cheddar/i, /roquefort/i, /camembert/i, /brie\b/i, /ricotta/i,
  /mascarpone/i, /burrata/i, /reblochon/i, /bleu d/i, /r[aâ]p[eé] (?:de )?fromage/i, /gratin/i,
  /pur[eé]e/i, /soupe/i, /velout[eé]/i, /potage/i, /bouillon de l[eé]gumes en soupe/i, /gaspacho/i,
  /cr[eè]me de (?:l[eé]gumes|potiron|courge)/i,
]

describe('aliments.json', () => {
  it('respecte le format', () => {
    for (const a of aliments) expect(() => zAliment.parse(a), a.id).not.toThrow()
  })
  it('a des identifiants uniques', () => {
    const ids = aliments.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('contient au moins 150 aliments', () => {
    expect(aliments.length).toBeGreaterThanOrEqual(150)
  })
  it('respecte le contrat d\'identifiants et d\'unités (contrat-aliments.json)', () => {
    const parId = new Map(aliments.map((a) => [a.id, a]))
    for (const c of contrat) {
      expect(parId.has(c.id), c.id).toBe(true)
      expect(parId.get(c.id)?.uniteBase, c.id).toBe(c.uniteBase)
    }
  })
  it("n'expose aucun aliment de nature fromage (exclu par défaut, mais présent seulement si tagué)", () => {
    for (const a of aliments) {
      if (/fromage|emmental|gruy|parmesan|mozza|comt/i.test(a.nom)) expect(a.tags, a.id).toContain('fromage')
    }
  })
})

describe('recettes.json', () => {
  const idsAliments = new Set(aliments.map((a) => a.id))
  const parId = new Map(aliments.map((a) => [a.id, a]))

  it('respecte le format', () => {
    for (const r of recettes) expect(() => zRecette.parse(r), r.id).not.toThrow()
  })
  it('a des identifiants uniques', () => {
    const ids = recettes.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it("n'utilise que des aliments existants, dans leur unité de base", () => {
    for (const r of recettes)
      for (const i of r.ingredients) {
        expect(idsAliments.has(i.alimentId), `${r.id} → ${i.alimentId}`).toBe(true)
        expect(i.unite, `${r.id} → ${i.alimentId}`).toBe(parId.get(i.alimentId)?.uniteBase)
      }
  })
  it('ne contient ni fromage, ni purée, ni soupe', () => {
    for (const r of recettes) {
      const texte = [r.nom, ...r.etapes, ...r.tags].join(' ')
      for (const motif of INTERDITS) expect(motif.test(texte), `${r.id} : ${motif}`).toBe(false)
      for (const t of ['fromage', 'puree', 'soupe']) expect(r.tags, r.id).not.toContain(t)
      for (const i of r.ingredients) {
        const al = parId.get(i.alimentId)
        expect(al?.tags.some((t) => ['fromage', 'puree', 'soupe'].includes(t)), `${r.id} → ${i.alimentId}`).toBe(false)
      }
    }
  })
  it('contient au moins 60 recettes, dont des petits-déjeuners et des goûters peu sucrés', () => {
    expect(recettes.length).toBeGreaterThanOrEqual(60)
    expect(recettes.filter((r) => r.types.includes('petit-dejeuner') && r.peuSucre).length).toBeGreaterThanOrEqual(8)
    expect(recettes.filter((r) => r.types.includes('gouter') && r.peuSucre).length).toBeGreaterThanOrEqual(8)
    expect(recettes.filter((r) => r.gamelle).length).toBeGreaterThanOrEqual(25)
  })
  it('respecte 30 minutes maximum', () => {
    for (const r of recettes) expect(r.tempsMinutes, r.id).toBeLessThanOrEqual(30)
  })
})

describe('prix-reference.json', () => {
  it('respecte le format', () => {
    expect(() => zFichierPrixReference.parse(prixRef)).not.toThrow()
  })
  it('couvre chaque aliment, avec des identifiants existants', () => {
    const ids = new Set(aliments.map((a) => a.id))
    const couverts = new Set(prixRef.prix.map((p) => p.alimentId))
    for (const p of prixRef.prix) expect(ids.has(p.alimentId), p.alimentId).toBe(true)
    for (const a of aliments) expect(couverts.has(a.id), a.id).toBe(true)
  })
  it('exprime les prix à la pièce pour les aliments comptés à la pièce', () => {
    const parId = new Map(aliments.map((a) => [a.id, a]))
    for (const p of prixRef.prix) {
      const a = parId.get(p.alimentId)
      if (a?.uniteBase === 'piece') expect(p.unitePrix, p.alimentId).toBe('piece')
      if (a?.uniteBase === 'g') expect(p.unitePrix, p.alimentId).toBe('kg')
      if (a?.uniteBase === 'ml') expect(p.unitePrix, p.alimentId).toBe('l')
    }
  })
})
