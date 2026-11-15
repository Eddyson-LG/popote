/**
 * Chargement des données de départ dans la base locale, au premier lancement
 * et à chaque nouvelle version des fichiers JSON.
 */
import alimentsJson from '@/data/aliments.json'
import recettesJson from '@/data/recettes.json'
import type { Aliment, Recette } from '@/types'
import { db, type PopoteDB } from './db'
import { magasinsParDefaut, reglagesParDefaut } from './defaults'

export const ALIMENTS = alimentsJson as Aliment[]
export const RECETTES_BASE = recettesJson as Recette[]

/** Empreinte simple des données de départ : change quand les JSON changent. */
function empreinte(): string {
  return `${ALIMENTS.length}-${RECETTES_BASE.length}-${JSON.stringify(ALIMENTS).length}-${JSON.stringify(RECETTES_BASE).length}`
}

export async function initialiserBase(base: PopoteDB = db): Promise<void> {
  await base.transaction('rw', [base.aliments, base.recettes, base.reglages, base.magasins, base.meta], async () => {
    const version = await base.meta.get('seed')
    const cible = empreinte()
    if (version?.valeur !== cible) {
      await base.aliments.bulkPut(ALIMENTS)
      // On remplace les recettes de base, sans toucher aux recettes IA ou perso.
      await base.recettes.where('source').equals('base').delete()
      await base.recettes.bulkPut(RECETTES_BASE)
      await base.meta.put({ cle: 'seed', valeur: cible })
    }
    if (!(await base.reglages.get('moi'))) await base.reglages.put(reglagesParDefaut())
    if ((await base.magasins.count()) === 0) await base.magasins.bulkPut(magasinsParDefaut())
  })
}

/** Efface toutes les données de l'utilisateur et recharge les données de départ. */
export async function reinitialiser(base: PopoteDB = db): Promise<void> {
  await base.transaction('rw', base.tables, async () => {
    await Promise.all(base.tables.map((t) => t.clear()))
  })
  await initialiserBase(base)
}
