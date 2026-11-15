/**
 * Correspondance « libellé de ticket » → aliment de la base.
 * Fonction pure. Les libellés sont abrégés et en majuscules (« PDT 2.5KG », « BANANE CAT1 ») :
 * on compare des mots normalisés, en acceptant les abréviations (préfixes) et les pluriels.
 */
import type { Aliment } from '@/types'
import { sansAccents } from './parseur'

export type Confiance = 'haute' | 'moyenne' | 'faible'

export interface Correspondance {
  aliment: Aliment
  /** Score entre 0 et 1. */
  score: number
  confiance: Confiance
}

/** Mots vides et mentions de ticket qui ne disent rien du produit. */
const MOTS_BRUIT = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'a', 'et', 'en', 'd', 'l',
  'cat', 'cat1', 'cat2', 'bio', 'vrac', 'extra', 'fr', 'france', 'origine', 'ue', 'uht', 'sachet', 'boite', 'bte', 'pack', 'lot',
  'barquette', 'barq', 'filet', 'kg', 'g', 'gr', 'l', 'cl', 'ml', 'pce', 'pces', 'piece', 'pieces', 'pc', 'x', 'unite', 'u',
  'marque', 'repere', 'eco', 'prix', 'promo', 'nouveau', 'nature', 'classique', 'format', 'familial', 'maxi', 'mini',
])

/** Normalise un texte en liste de mots significatifs. */
export function mots(texte: string): string[] {
  return sansAccents(texte)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((m) => m.length >= 2 && !MOTS_BRUIT.has(m) && !/\d/.test(m))
    .map(singulier)
}

function singulier(m: string): string {
  if (m.length > 3 && (m.endsWith('s') || m.endsWith('x'))) return m.slice(0, -1)
  return m
}

/** Ressemblance entre deux mots : égalité, abréviation (préfixe de 3 lettres ou plus). */
function ressemblance(a: string, b: string): number {
  if (a === b) return 1
  const [court, long] = a.length <= b.length ? [a, b] : [b, a]
  if (court.length >= 3 && long.startsWith(court)) return 0.6 + 0.3 * (court.length / long.length)
  return 0
}

/** Score d'un libellé (mots) contre un nom candidat (mots). */
function scoreContre(libelle: string[], candidat: string[]): number {
  if (!libelle.length || !candidat.length) return 0
  const utilises = new Set<number>()
  let somme = 0
  for (const c of candidat) {
    let meilleur = 0
    let idx = -1
    libelle.forEach((l, i) => {
      if (utilises.has(i)) return
      const r = ressemblance(l, c)
      if (r > meilleur) {
        meilleur = r
        idx = i
      }
    })
    if (idx >= 0) utilises.add(idx)
    somme += meilleur
  }
  const precision = somme / candidat.length // les mots du candidat sont-ils dans le libellé ?
  const couverture = utilises.size / libelle.length // le libellé est-il expliqué par le candidat ?
  // Un mot du candidat absent du libellé est rédhibitoire (« pomme de terre » ≠ « pommes »).
  const penalite = candidat.length > 1 && precision < 0.99 ? 0.6 : 1
  return (0.75 * precision + 0.25 * couverture) * penalite
}

export function confianceDe(score: number): Confiance {
  return score >= 0.8 ? 'haute' : score >= 0.6 ? 'moyenne' : 'faible'
}

/** Score minimal pour proposer une association automatique. */
export const SEUIL_ASSOCIATION = 0.55

/** Index précalculé des noms (nom, id, synonymes) de chaque aliment. */
export interface IndexAliments {
  entrees: { aliment: Aliment; noms: string[][] }[]
}

export function indexerAliments(aliments: Aliment[]): IndexAliments {
  return {
    entrees: aliments.map((a) => ({
      aliment: a,
      noms: [a.nom, a.id.replace(/-/g, ' '), ...(a.synonymes ?? [])].map(mots).filter((m) => m.length > 0),
    })),
  }
}

/** Les meilleures correspondances d'un libellé, de la plus probable à la moins probable. */
export function chercherAliments(libelle: string, index: IndexAliments, max = 5): Correspondance[] {
  const ml = mots(libelle)
  if (!ml.length) return []
  const res: Correspondance[] = []
  for (const { aliment, noms } of index.entrees) {
    let score = 0
    for (const n of noms) score = Math.max(score, scoreContre(ml, n))
    if (score > 0.3) res.push({ aliment, score: Math.round(score * 100) / 100, confiance: confianceDe(score) })
  }
  return res.sort((a, b) => b.score - a.score || a.aliment.nom.length - b.aliment.nom.length).slice(0, max)
}

/**
 * Aliment associé automatiquement à une ligne, ou null si rien n'est assez sûr.
 * `appris` contient les corrections déjà faites par l'utilisateur (libellé normalisé → alimentId).
 */
export function associer(
  libelle: string,
  index: IndexAliments,
  appris: Record<string, string> = {},
): Correspondance | null {
  const cle = cleLibelle(libelle)
  const connu = cle ? appris[cle] : undefined
  if (connu) {
    const e = index.entrees.find((x) => x.aliment.id === connu)
    if (e) return { aliment: e.aliment, score: 1, confiance: 'haute' }
  }
  const [premier] = chercherAliments(libelle, index, 1)
  return premier && premier.score >= SEUIL_ASSOCIATION ? premier : null
}

/** Clé stable d'un libellé pour mémoriser une correction (« PDT 2.5KG » → « pdt »). */
export function cleLibelle(libelle: string): string {
  return mots(libelle).join(' ')
}
