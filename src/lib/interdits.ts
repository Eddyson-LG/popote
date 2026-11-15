/**
 * Garde-fou des familles bannies (par défaut : fromage, purée, soupe).
 *
 * Il ne vise que les PLATS et les aliments de la famille elle-même (« pâtes au fromage », « purée »,
 * « velouté »), jamais les aliments qui en contiennent un peu (pesto, gnocchis, skyr…) : ceux-là,
 * c'est l'utilisateur qui décide, aliment par aliment, dans « Mes goûts ».
 *
 * Utilisé par les tests de données ET pour filtrer toute recette générée par l'IA.
 */
import type { Aliment, Recette, TagExclusion } from '@/types'

/** Mots qui désignent un plat ou un aliment de la famille, par tag d'exclusion. */
export const MOTS_PAR_FAMILLE: Partial<Record<TagExclusion, RegExp[]>> = {
  fromage: [
    /fromage/i, /gruy[eè]re/i, /emmental/i, /parmesan/i, /comt[eé]/i, /mozzarella/i, /ch[eè]vre/i,
    /\bf[eé]ta\b/i, /raclette/i, /cheddar/i, /roquefort/i, /camembert/i, /\bbrie\b/i, /ricotta/i,
    /mascarpone/i, /burrata/i, /reblochon/i, /\bbleu d/i, /gratin/i,
    /pecorino/i, /parmigiano/i, /\bgrana\b/i, /gorgonzola/i, /halloumi/i, /\btomme\b/i, /cancoillotte/i, /mimolette/i,
    /\bmunster\b/i, /\bmorbier\b/i, /saint-?nectaire/i, /cantal\b/i, /\bbeaufort\b/i, /provolone/i, /manchego/i, /\bgouda\b/i,
    /\bfondue\b/i, /tartiflette/i, /croque[- ]monsieur/i, /croque[- ]madame/i, /cheese/i, /\bquiche\b/i,
  ],
  puree: [/pur[eé]e/i, /mousseline/i, /[eé]cras[eé] de (?:pommes?|patates?|l[eé]gumes)/i],
  soupe: [
    /soupe/i, /velout[eé]/i, /potage/i, /gaspacho/i, /cr[eè]me de (?:l[eé]gumes|potiron|courge)/i,
    /minestrone/i, /harira/i, /chorba/i, /bortsch/i, /bisque/i, /\bramen\b/i, /\bpho\b/i,
  ],
}

export const EXCLUSIONS_PAR_DEFAUT: TagExclusion[] = ['fromage', 'puree', 'soupe']

/** Tous les motifs des familles demandées (par défaut : fromage, purée, soupe). */
export function motsInterdits(exclusions: TagExclusion[] = EXCLUSIONS_PAR_DEFAUT): RegExp[] {
  return exclusions.flatMap((t) => MOTS_PAR_FAMILLE[t] ?? [])
}

/** Compatibilité : motifs des trois familles bannies par défaut. */
export const MOTS_INTERDITS: RegExp[] = motsInterdits()

/** Raison du rejet, ou null si la recette est acceptable pour ces exclusions. */
export function violationInterdits(
  r: Pick<Recette, 'nom' | 'etapes' | 'tags' | 'ingredients'>,
  alimentsParId: Map<string, Aliment>,
  exclusions: TagExclusion[] = EXCLUSIONS_PAR_DEFAUT,
): string | null {
  // Les étapes disent souvent « 1 cuillère à soupe » : ce n'est pas une soupe.
  const texte = [r.nom, ...r.etapes, ...r.tags].join(' ').replace(/cuill[eè]res? [àa] soupe/gi, 'c. à s.')
  const mot = motsInterdits(exclusions).find((m) => m.test(texte))
  if (mot) return `mot interdit ${mot}`
  if (r.tags.some((t) => (exclusions as string[]).includes(t))) return 'tag interdit'
  const ing = r.ingredients.find((i) => alimentsParId.get(i.alimentId)?.tags.some((t) => exclusions.includes(t)))
  return ing ? `ingrédient interdit ${ing.alimentId}` : null
}
