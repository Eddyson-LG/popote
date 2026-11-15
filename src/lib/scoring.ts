/**
 * Scoring des goûts : transforme swipes, notes et achats en un score entre -1 et +1,
 * puis en score de recette, et décide des exclusions.
 */
import type { Aliment, Gout, Recette, Reglages, Verdict } from '@/types'

export const POIDS_VERDICT: Record<Verdict, number> = {
  adore: 1,
  aime: 0.5,
  'pas-souvent': -0.35,
  'pas-aime': -0.6,
  jamais: -1,
}

const borne = (n: number) => Math.max(-1, Math.min(1, n))

/** Recalcule le score d'un goût à partir de ses signaux. */
export function calculerScore(g: Pick<Gout, 'verdict' | 'note' | 'achats'>): number {
  if (g.verdict === 'jamais') return -1
  const v = g.verdict ? POIDS_VERDICT[g.verdict] : 0
  const bonusAchats = Math.min((g.achats ?? 0) * 0.05, 0.3)
  if (g.note) {
    const n = (g.note - 3) / 2 // 1★ → -1, 3★ → 0, 5★ → +1
    const base = g.verdict ? 0.6 * n + 0.4 * v : n
    return borne(base + bonusAchats)
  }
  return borne(v + bonusAchats)
}

export type CarteGouts = Map<string, Gout>

export const cleGout = (cible: Gout['cible'], refId: string) => `${cible}:${refId}`

export function scoreAliment(gouts: CarteGouts, alimentId: string): number {
  return gouts.get(cleGout('aliment', alimentId))?.score ?? 0
}

/** Un aliment est exclu s'il porte un tag exclu, s'il est exclu à la main ou noté « jamais ». */
export function alimentExclu(
  aliment: Aliment | undefined,
  reglages: Pick<Reglages, 'exclusions' | 'alimentsExclus'>,
  gouts: CarteGouts,
): boolean {
  if (!aliment) return false
  if (reglages.alimentsExclus.includes(aliment.id)) return true
  if (aliment.tags.some((t) => reglages.exclusions.includes(t))) return true
  return gouts.get(cleGout('aliment', aliment.id))?.verdict === 'jamais'
}

/** Une recette est exclue si un ingrédient non optionnel est exclu, si elle porte un tag exclu ou si elle est notée « jamais ». */
export function recetteExclue(
  recette: Recette,
  alimentsParId: Map<string, Aliment>,
  reglages: Pick<Reglages, 'exclusions' | 'alimentsExclus'>,
  gouts: CarteGouts,
): boolean {
  if (gouts.get(cleGout('recette', recette.id))?.verdict === 'jamais') return true
  if (recette.tags.some((t) => (reglages.exclusions as string[]).includes(t))) return true
  return recette.ingredients.some((i) => !i.optionnel && alimentExclu(alimentsParId.get(i.alimentId), reglages, gouts))
}

/**
 * Score de préférence d'une recette (-1 … +1) :
 * son propre goût (swipe / note) s'il existe, mélangé à la moyenne de ses ingrédients.
 */
export function scoreRecette(recette: Recette, gouts: CarteGouts): number {
  const ings = recette.ingredients.filter((i) => !i.optionnel)
  const moyenne = ings.length ? ings.reduce((s, i) => s + scoreAliment(gouts, i.alimentId), 0) / ings.length : 0
  // Un ingrédient détesté pèse plus lourd qu'une moyenne.
  const pire = Math.min(0, ...ings.map((i) => scoreAliment(gouts, i.alimentId)))
  const ingredients = 0.7 * moyenne + 0.3 * pire
  const propre = gouts.get(cleGout('recette', recette.id))
  if (propre && (propre.verdict || propre.note)) return borne(0.65 * propre.score + 0.35 * ingredients)
  return borne(ingredients)
}

/** Facteur de fréquence : « pas trop souvent » divise la probabilité d'apparition. */
export function facteurFrequence(recette: Recette, gouts: CarteGouts): number {
  const propre = gouts.get(cleGout('recette', recette.id))
  if (propre?.verdict === 'pas-souvent') return 0.35
  const ingPasSouvent = recette.ingredients.some((i) => gouts.get(cleGout('aliment', i.alimentId))?.verdict === 'pas-souvent')
  return ingPasSouvent ? 0.6 : 1
}
