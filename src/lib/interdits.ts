/**
 * Garde-fou « jamais de fromage, de purée ni de soupe » : utilisé par les tests de données
 * ET pour filtrer toute recette générée par l'IA avant de l'enregistrer.
 */
import type { Aliment, Recette } from '@/types'

export const MOTS_INTERDITS: RegExp[] = [
  /fromage/i, /gruy[eè]re/i, /emmental/i, /parmesan/i, /comt[eé]/i, /mozzarella/i, /ch[eè]vre/i,
  /\bf[eé]ta\b/i, /raclette/i, /cheddar/i, /roquefort/i, /camembert/i, /\bbrie\b/i, /ricotta/i,
  /mascarpone/i, /burrata/i, /reblochon/i, /\bbleu d/i, /gratin/i, /pesto/i,
  /pur[eé]e/i, /soupe/i, /velout[eé]/i, /potage/i, /gaspacho/i, /cr[eè]me de (?:l[eé]gumes|potiron|courge)/i,
]

/** Raison du rejet, ou null si la recette est acceptable. */
export function violationInterdits(r: Pick<Recette, 'nom' | 'etapes' | 'tags' | 'ingredients'>, alimentsParId: Map<string, Aliment>): string | null {
  const texte = [r.nom, ...r.etapes, ...r.tags].join(' ')
  const mot = MOTS_INTERDITS.find((m) => m.test(texte))
  if (mot) return `mot interdit ${mot}`
  if (r.tags.some((t) => ['fromage', 'puree', 'soupe'].includes(t))) return 'tag interdit'
  const ing = r.ingredients.find((i) => alimentsParId.get(i.alimentId)?.tags.some((t) => ['fromage', 'puree', 'soupe'].includes(t)))
  return ing ? `ingrédient interdit ${ing.alimentId}` : null
}
