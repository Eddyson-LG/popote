/**
 * Ajustement du planning au budget : tant que la liste (placard compris) dépasse,
 * on remplace un plat par l'alternative qui fait le plus baisser le total réel de la liste
 * (formats vendus et pots d'épices compris), sans reprendre une recette déjà au menu.
 * Fonction pure, testée.
 */
import type { Repas } from '@/types'
import { candidats, coutPortion, normaliserRestes, type ContextePlanning } from './planning'

export function respecterBudget(
  plan: Repas[],
  ctx: ContextePlanning,
  budget: number,
  totalDe: (p: Repas[]) => number,
  maxEssais = 40,
): { plan: Repas[]; total: number } {
  const recettes = new Map(ctx.recettes.map((r) => [r.id, r]))
  let total = totalDe(plan)
  const essayes = new Set<string>()

  for (let essai = 0; essai < maxEssais && total > budget; essai++) {
    // On vise d'abord les plats les plus chers qu'on n'a pas encore tenté de remplacer.
    const cible = plan
      .filter((r) => !r.verrouille && !r.cuisine && !r.restes && !essayes.has(r.id))
      .map((r) => ({ r, c: (recettes.has(r.recetteId) ? coutPortion(recettes.get(r.recetteId)!, ctx) : 0) * r.portions }))
      .sort((a, b) => b.c - a.c)[0]?.r
    if (!cible) break
    essayes.add(cible.id)

    const occurrences = new Map<string, number>()
    for (const r of plan) if (!r.restes && r.id !== cible.id) occurrences.set(r.recetteId, (occurrences.get(r.recetteId) ?? 0) + 1)
    let meilleur: { plan: Repas[]; total: number } | null = null
    // 1er passage : uniquement des recettes nouvelles (variété) ; 2e : une recette déjà servie une fois.
    for (const maxDeja of [0, 1]) {
      for (const rec of candidats(ctx, cible.type)) {
        if (rec.id === cible.recetteId || (occurrences.get(rec.id) ?? 0) > maxDeja) continue
        const essaiPlan = normaliserRestes(plan.map((r) => (r.id === cible.id ? { ...r, recetteId: rec.id, portions: 1, restes: false } : r)))
        const t = totalDe(essaiPlan)
        if (t < (meilleur?.total ?? total)) meilleur = { plan: essaiPlan, total: t }
      }
      if (meilleur) break
    }
    if (meilleur) {
      plan = meilleur.plan
      total = meilleur.total
      // Le plan a changé : les plats déjà tentés peuvent de nouveau valoir le coup.
      essayes.clear()
      essayes.add(cible.id)
    }
  }
  return { plan, total }
}
