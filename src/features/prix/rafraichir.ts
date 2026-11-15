/**
 * Rafraîchissement automatique des prix : à l'ouverture si le réseau est là,
 * puis toutes les X heures (Reglages.rafraichissementHeures).
 */
import { db } from '@/lib/db'
import { recupererOpenPrices } from './openPrices'

let enCours: Promise<number> | null = null

export function rafraichirPrixSiBesoin(force = false): Promise<number> {
  if (enCours) return enCours
  enCours = (async () => {
    try {
      const r = await db.reglages.get('moi')
      if (!r || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0
      const age = r.prixMajLe ? Date.now() - new Date(r.prixMajLe).getTime() : Infinity
      if (!force && age < r.rafraichissementHeures * 3_600_000) return 0
      const [aliments, produits, magasins] = await Promise.all([db.aliments.toArray(), db.produits.toArray(), db.magasins.toArray()])
      const obs = await recupererOpenPrices({
        alimentsParId: new Map(aliments.map((a) => [a.id, a])),
        produits: new Map(produits.map((p) => [p.codeBarres, p])),
        magasins,
      })
      await db.transaction('rw', db.prix, db.reglages, async () => {
        // Les prix Open Prices sont remplacés à chaque rafraîchissement ; les tickets et saisies restent.
        if (obs.length) {
          await db.prix.where('source').equals('open-prices').delete()
          await db.prix.bulkAdd(obs)
        }
        await db.reglages.update('moi', { prixMajLe: new Date().toISOString() })
      })
      return obs.length
    } catch {
      return 0
    } finally {
      enCours = null
    }
  })()
  return enCours
}

/** Lance le rafraîchissement périodique (appelé une fois au démarrage). */
let demarre = false
export function demarrerRafraichissement(): () => void {
  if (demarre) return () => {}
  demarre = true
  rafraichirPrixSiBesoin()
  const enLigne = () => rafraichirPrixSiBesoin()
  window.addEventListener('online', enLigne)
  const id = window.setInterval(() => rafraichirPrixSiBesoin(), 30 * 60_000)
  return () => {
    window.removeEventListener('online', enLigne)
    window.clearInterval(id)
    demarre = false
  }
}
