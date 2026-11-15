import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PopoteDB, TABLES } from '@/lib/db'
import { initialiserBase } from '@/lib/seed'
import { reglages } from '@/test/fixtures'
import {
  VERSION_SAUVEGARDE,
  construireSauvegarde,
  exporterBase,
  nomFichierSauvegarde,
  restaurerSauvegarde,
  validerSauvegarde,
} from './sauvegarde'

const CLE = 'sk-ant-api03-SECRET-NE-DOIT-PAS-SORTIR'

describe('construireSauvegarde', () => {
  it('contient app, version, date et toutes les tables', () => {
    const s = construireSauvegarde({ magasins: [{ id: 'lidl', enseigne: 'Lidl' }] }, new Date('2026-11-15T10:00:00Z'))
    expect(s.app).toBe('popote')
    expect(s.version).toBe(VERSION_SAUVEGARDE)
    expect(s.exporteLe).toBe('2026-11-15T10:00:00.000Z')
    expect(Object.keys(s.tables).sort()).toEqual([...TABLES].sort())
    expect(s.tables.magasins).toHaveLength(1)
    expect(s.tables.stock).toEqual([])
  })

  it('n’exporte JAMAIS la clé API', () => {
    const s = construireSauvegarde({ reglages: [reglages({ cleApi: CLE })] })
    expect(s.tables.reglages[0]).not.toHaveProperty('cleApi')
    expect(s.tables.reglages[0].budgetHebdo).toBe(50)
    expect(JSON.stringify(s)).not.toContain(CLE)
  })

  it('ne modifie pas les données d’origine', () => {
    const r = reglages({ cleApi: CLE })
    construireSauvegarde({ reglages: [r] })
    expect(r.cleApi).toBe(CLE)
  })
})

describe('validerSauvegarde', () => {
  const valide = () => JSON.stringify(construireSauvegarde({ reglages: [reglages()], magasins: [{ id: 'lidl', enseigne: 'Lidl' }] }))

  it('accepte une sauvegarde et donne un aperçu par table', () => {
    const r = validerSauvegarde(valide())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.apercu.magasins).toBe(1)
      expect(r.apercu.reglages).toBe(1)
      expect(r.apercu.recettes).toBe(0)
    }
  })

  it('refuse le JSON cassé, un autre fichier ou une structure invalide', () => {
    expect(validerSauvegarde('{pas du json').ok).toBe(false)
    expect(validerSauvegarde({ hello: 'world' }).ok).toBe(false)
    const s = JSON.parse(valide())
    s.tables.reglages = [{ id: 'quelquun-dautre' }]
    expect(validerSauvegarde(s).ok).toBe(false)
    s.tables.reglages = 'oups'
    expect(validerSauvegarde(s).ok).toBe(false)
  })

  it('refuse une version plus récente', () => {
    const s = JSON.parse(valide())
    s.version = VERSION_SAUVEGARDE + 1
    const r = validerSauvegarde(s)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toMatch(/plus récente/)
  })

  it('retire une clé API glissée à la main dans le fichier', () => {
    const s = JSON.parse(valide())
    s.tables.reglages[0].cleApi = 'sk-pirate'
    const r = validerSauvegarde(s)
    expect(r.ok && r.sauvegarde.tables.reglages[0]).not.toHaveProperty('cleApi')
  })

  it('considère les tables absentes comme vides', () => {
    const s = JSON.parse(valide())
    delete s.tables.stock
    const r = validerSauvegarde(s)
    expect(r.ok && r.apercu.stock).toBe(0)
  })
})

describe('nomFichierSauvegarde', () => {
  it('suit le format popote-sauvegarde-AAAA-MM-JJ.json', () => {
    expect(nomFichierSauvegarde(new Date(2026, 0, 5, 9))).toBe('popote-sauvegarde-2026-01-05.json')
  })
})

describe('aller-retour export → import', () => {
  let source: PopoteDB
  let cible: PopoteDB

  beforeEach(async () => {
    source = new PopoteDB(`export-source-${Math.random()}`)
    cible = new PopoteDB(`export-cible-${Math.random()}`)
    await initialiserBase(source)
    await initialiserBase(cible)
  })
  afterEach(async () => {
    await source.delete()
    await cible.delete()
  })

  it('restaure tout, garde la clé API locale et ne fuit pas celle de la source', async () => {
    await source.reglages.update('moi', { budgetHebdo: 42, cleApi: CLE })
    await source.stock.add({ nom: 'Riz', alimentId: 'riz-blanc', quantite: 500, unite: 'g', emplacement: 'placard', ajouteLe: '2026-11-10' })
    await source.depenses.add({ date: '2026-11-12', montant: 38.2, origine: 'liste' })
    await source.recettes.put({
      id: 'perso-1', nom: 'Ma recette', emoji: '🍲', types: ['diner'], tempsMinutes: 20, portions: 2,
      ingredients: [], etapes: [], equipement: [], gamelle: false, batch: false, peuSucre: true, tags: [], source: 'utilisateur',
    })

    // La cible a sa propre clé et des données qui doivent disparaître.
    await cible.reglages.update('moi', { cleApi: 'cle-du-mac' })
    await cible.repasDehors.add({ date: '2026-11-01', montant: 9, type: 'sandwich' })

    const json = JSON.stringify(await exporterBase(source))
    expect(json).not.toContain(CLE)

    const r = validerSauvegarde(json)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await restaurerSauvegarde(r.sauvegarde, cible)

    const reg = await cible.reglages.get('moi')
    expect(reg?.budgetHebdo).toBe(42)
    expect(reg?.cleApi).toBe('cle-du-mac')
    expect(await cible.stock.toArray()).toEqual(await source.stock.toArray())
    expect(await cible.depenses.count()).toBe(1)
    expect(await cible.repasDehors.count()).toBe(0)
    expect(await cible.recettes.get('perso-1')).toBeTruthy()
    for (const t of TABLES) {
      if (t === 'reglages') continue
      expect(await cible.table(t).count(), t).toBe(await source.table(t).count())
    }
  })

  it('sans clé locale, n’en crée pas', async () => {
    const r = validerSauvegarde(JSON.stringify(await exporterBase(source)))
    if (!r.ok) throw new Error(r.erreur)
    await restaurerSauvegarde(r.sauvegarde, cible)
    expect(await cible.reglages.get('moi')).not.toHaveProperty('cleApi')
  })
})
