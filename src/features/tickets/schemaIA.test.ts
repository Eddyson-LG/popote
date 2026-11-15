import { describe, expect, it } from 'vitest'
import { reponseTicketIA, SCHEMA_TICKET_JSON, versTicketLu } from './schemaIA'

const valide = {
  enseigne: 'Lidl',
  date: '2026-11-14',
  lignes: [
    { libelle: 'BANANE CAT1', prix: 1.52, quantite: 1, poidsKg: 0.875 },
    { libelle: 'LAIT 1L', prix: 5.34, quantite: 6, poidsKg: 0 },
    { libelle: 'REMISE', prix: -0.5, quantite: 1, poidsKg: 0 },
    { libelle: '  ', prix: 1, quantite: 1, poidsKg: 0 },
  ],
  total: 6.36,
}

describe('validation Zod de la réponse IA', () => {
  it('accepte une réponse valide et la convertit', () => {
    const r = reponseTicketIA.safeParse(valide)
    expect(r.success).toBe(true)
    const t = versTicketLu(r.data!)
    expect(t.enseigne).toBe('Lidl')
    expect(t.lignes).toHaveLength(3)
    expect(t.lignes[0]).toEqual({ libelle: 'BANANE CAT1', prix: 1.52, quantite: undefined, poidsKg: 0.875 })
    expect(t.lignes[1].quantite).toBe(6)
    expect(t.lignes[2].prix).toBe(-0.5)
  })
  it('valeurs vides → undefined', () => {
    const t = versTicketLu(reponseTicketIA.parse({ enseigne: '', date: '', lignes: [], total: 0 }))
    expect(t).toEqual({ enseigne: undefined, date: undefined, total: undefined, lignes: [] })
  })
  it.each([
    ['champ en trop', { ...valide, magasin: 'x' }],
    ['champ manquant', { enseigne: 'Lidl', date: '', lignes: [] }],
    ['date mal formée', { ...valide, date: '14/11/2026' }],
    ['prix texte', { ...valide, lignes: [{ libelle: 'A', prix: '1,29', quantite: 1, poidsKg: 0 }] }],
    ['prix absurde', { ...valide, lignes: [{ libelle: 'A', prix: 99999, quantite: 1, poidsKg: 0 }] }],
    ['ligne avec champ en trop', { ...valide, lignes: [{ libelle: 'A', prix: 1, quantite: 1, poidsKg: 0, html: '<b>' }] }],
    ['total négatif', { ...valide, total: -3 }],
    ['pas un objet', 'du texte'],
  ])('refuse : %s', (_, v) => {
    expect(reponseTicketIA.safeParse(v).success).toBe(false)
  })
})

describe('schéma JSON envoyé à l’API', () => {
  it('additionalProperties false partout, tous les champs requis, aucun min/max', () => {
    const verifier = (s: Record<string, unknown>) => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false)
        const props = s.properties as Record<string, Record<string, unknown>>
        expect([...(s.required as string[])].sort()).toEqual(Object.keys(props).sort())
        Object.values(props).forEach(verifier)
      }
      if (s.type === 'array') verifier(s.items as Record<string, unknown>)
    }
    verifier(SCHEMA_TICKET_JSON)
    expect(JSON.stringify(SCHEMA_TICKET_JSON)).not.toMatch(/minimum|maximum|minLength|maxLength|multipleOf/)
  })
})
