/**
 * Sauvegarde / restauration complète de la base locale en JSON.
 * La clé API Claude (reglages.cleApi) n'est JAMAIS exportée, et n'est jamais écrasée à l'import.
 */
import { z } from 'zod'
import { db, TABLES, type NomTable, type PopoteDB } from '@/lib/db'
import { initialiserBase } from '@/lib/seed'

export const VERSION_SAUVEGARDE = 1

export type DonneesTables = Record<NomTable, Record<string, unknown>[]>

export interface Sauvegarde {
  app: 'popote'
  version: number
  /** Date ISO de l'export. */
  exporteLe: string
  tables: DonneesTables
}

export const LIBELLES_TABLES: Record<NomTable, string> = {
  aliments: 'Aliments',
  recettes: 'Recettes',
  gouts: 'Goûts',
  stock: 'Stock',
  produits: 'Produits scannés',
  prix: 'Prix relevés',
  promos: 'Promos',
  magasins: 'Magasins',
  listes: 'Listes de courses',
  repas: 'Repas planifiés',
  achats: 'Achats',
  repasDehors: 'Repas dehors',
  depenses: 'Dépenses',
  reglages: 'Réglages',
  meta: 'Infos techniques',
}

/** Retire la clé API d'une ligne de réglages (et toute clé « cleApi » de premier niveau). */
function sansCleApi(ligne: Record<string, unknown>): Record<string, unknown> {
  const { cleApi: _retiree, ...reste } = ligne
  void _retiree
  return reste
}

function videTables(): DonneesTables {
  return Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DonneesTables
}

/** Assemble la sauvegarde à partir du contenu des tables, sans la clé API. */
export function construireSauvegarde(donnees: Partial<Record<NomTable, unknown[]>>, maintenant = new Date()): Sauvegarde {
  const tables = videTables()
  for (const t of TABLES) {
    const lignes = (donnees[t] ?? []).filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    tables[t] = t === 'reglages' ? lignes.map(sansCleApi) : lignes.map((l) => ({ ...l }))
  }
  return { app: 'popote', version: VERSION_SAUVEGARDE, exporteLe: maintenant.toISOString(), tables }
}

// ─────────────── Validation ───────────────

const avecIdTexte = z.looseObject({ id: z.string().min(1) })
const avecIdAuto = z.looseObject({ id: z.number().int().optional() })

const SCHEMAS_TABLES = {
  aliments: z.looseObject({ id: z.string().min(1), nom: z.string(), rayon: z.string(), uniteBase: z.string() }),
  recettes: z.looseObject({ id: z.string().min(1), nom: z.string(), ingredients: z.array(z.unknown()) }),
  gouts: avecIdTexte,
  stock: avecIdAuto,
  produits: z.looseObject({ codeBarres: z.string().min(1) }),
  prix: avecIdAuto,
  promos: avecIdAuto,
  magasins: avecIdTexte,
  listes: z.looseObject({ id: z.string().min(1), items: z.array(z.looseObject({ id: z.string(), nom: z.string() })) }),
  repas: avecIdTexte,
  achats: avecIdAuto,
  repasDehors: avecIdAuto,
  depenses: avecIdAuto,
  reglages: z.looseObject({ id: z.literal('moi') }),
  meta: z.looseObject({ cle: z.string().min(1) }),
} satisfies Record<NomTable, z.ZodType>

const SCHEMA_SAUVEGARDE = z.object({
  app: z.literal('popote'),
  version: z.number().int().min(1),
  exporteLe: z.string(),
  tables: z.object(
    Object.fromEntries(TABLES.map((t) => [t, z.array(SCHEMAS_TABLES[t]).optional()])) as {
      [K in NomTable]: z.ZodOptional<z.ZodArray<(typeof SCHEMAS_TABLES)[K]>>
    },
  ),
})

export type ResultatValidation =
  | { ok: true; sauvegarde: Sauvegarde; apercu: Record<NomTable, number> }
  | { ok: false; erreur: string }

/** Vérifie qu'un contenu (texte JSON ou objet) est une sauvegarde Popote utilisable. */
export function validerSauvegarde(json: unknown): ResultatValidation {
  let brut = json
  if (typeof json === 'string') {
    try {
      brut = JSON.parse(json)
    } catch {
      return { ok: false, erreur: 'Ce fichier n’est pas du JSON lisible.' }
    }
  }
  const r = SCHEMA_SAUVEGARDE.safeParse(brut)
  if (!r.success) {
    const pb = r.error.issues[0]
    const ou = pb?.path.length ? ` (${pb.path.join(' › ')})` : ''
    return { ok: false, erreur: `Ce fichier ne ressemble pas à une sauvegarde Popote${ou}.` }
  }
  if (r.data.version > VERSION_SAUVEGARDE)
    return { ok: false, erreur: 'Cette sauvegarde vient d’une version plus récente de Popote. Mets l’appli à jour d’abord.' }

  // Les tables absentes sont considérées vides ; la clé API éventuelle est retirée par sécurité.
  const sauvegarde = construireSauvegarde(r.data.tables as Partial<Record<NomTable, unknown[]>>)
  sauvegarde.exporteLe = r.data.exporteLe
  sauvegarde.version = r.data.version
  const apercu = Object.fromEntries(TABLES.map((t) => [t, sauvegarde.tables[t].length])) as Record<NomTable, number>
  return { ok: true, sauvegarde, apercu }
}

// ─────────────── Accès base ───────────────

/** Lit toutes les tables de la base. */
export async function lireDonnees(base: PopoteDB = db): Promise<DonneesTables> {
  const tables = videTables()
  for (const t of TABLES) tables[t] = await base.table(t).toArray()
  return tables
}

/** Exporte la base complète (sans clé API). */
export async function exporterBase(base: PopoteDB = db, maintenant = new Date()): Promise<Sauvegarde> {
  return construireSauvegarde(await lireDonnees(base), maintenant)
}

/**
 * Remplace toutes les données par celles de la sauvegarde, dans une seule transaction.
 * La clé API présente sur l'appareil est conservée. Les données de départ sont ensuite
 * complétées si besoin (réglages manquants, aliments d'une version plus récente).
 */
export async function restaurerSauvegarde(sauvegarde: Sauvegarde, base: PopoteDB = db): Promise<void> {
  await base.transaction('rw', base.tables, async () => {
    const cleApi = (await base.reglages.get('moi'))?.cleApi
    for (const t of TABLES) {
      const table = base.table(t)
      await table.clear()
      let lignes = sauvegarde.tables[t] ?? []
      if (t === 'reglages') lignes = lignes.map((l) => (cleApi ? { ...sansCleApi(l), cleApi } : sansCleApi(l)))
      if (lignes.length) await table.bulkPut(lignes)
    }
  })
  await initialiserBase(base)
}

/** « popote-sauvegarde-2026-11-15.json » (date locale). */
export function nomFichierSauvegarde(maintenant = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `popote-sauvegarde-${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}.json`
}
