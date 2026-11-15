import { db } from '@/lib/db'
import { chargerResolveurPrix } from '@/lib/contexte'
import { coutPortion } from '@/features/recettes/planning'
import { bilan, type Bilan } from './calcul'

/** Charge le bilan des économies depuis la base. */
export async function chargerBilan(): Promise<Bilan & { prixRepasDehors: number; budgetHebdo: number }> {
  const [depenses, dehors, repas, recettes, aliments, prix, reglages] = await Promise.all([
    db.depenses.toArray(),
    db.repasDehors.toArray(),
    db.repas.filter((r) => r.cuisine).toArray(),
    db.recettes.toArray(),
    db.aliments.toArray(),
    chargerResolveurPrix(),
    db.reglages.get('moi'),
  ])
  const alimentsParId = new Map(aliments.map((a) => [a.id, a]))
  const parId = new Map(recettes.map((r) => [r.id, r]))
  const prixRepasDehors = reglages?.prixRepasDehors ?? 5
  const b = bilan({
    depenses,
    dehors,
    repas,
    prixRepasDehors,
    coutPortion: (id) => (parId.has(id) ? coutPortion(parId.get(id)!, { alimentsParId, prix }) : 0),
  })
  return { ...b, prixRepasDehors, budgetHebdo: reglages?.budgetHebdo ?? 50 }
}

export async function noterRepasDehors(montant: number, type: 'sandwich' | 'resto' | 'fast-food' | 'autre' = 'sandwich') {
  await db.repasDehors.add({ date: new Date().toISOString(), montant, type })
}
