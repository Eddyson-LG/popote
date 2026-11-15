/**
 * Générateur de planning « sans IA » : règles + scoring (goûts × prix × variété × stock).
 * Fonction pure, testable, déterministe à graine égale.
 */
import type { Aliment, Jour, Recette, Reglages, Repas, StockItem, TypeRepas } from '@/types'
import { TYPES_REPAS } from '@/types'
import { cout, type ResolveurPrix } from '@/lib/prix'
import { facteurFrequence, recetteExclue, scoreRecette, type CarteGouts } from '@/lib/scoring'
import { ajouterJours, isoJour } from '@/lib/dates'

export interface ContextePlanning {
  semaine: string
  recettes: Recette[]
  alimentsParId: Map<string, Aliment>
  gouts: CarteGouts
  reglages: Reglages
  stock: StockItem[]
  prix: ResolveurPrix
  /** Aliments en promo cette semaine (remontent en priorité). */
  promos: Set<string>
  /** Repas déjà planifiés (les verrouillés et les cuisinés sont conservés). */
  existants: Repas[]
  /** Recettes servies les 2 semaines précédentes (variété). */
  recentes: Set<string>
  /** Générateur pseudo-aléatoire dans [0, 1). */
  aleatoire: () => number
  /** Date du jour (tests). */
  aujourdhui?: Date
  /** Premier jour à planifier (0 = lundi) : en milieu de semaine, les jours passés sont ignorés. */
  jourDebut?: number
  /** Consigne ponctuelle de la semaine (« j'ai la flemme »…). */
  preferences?: { tags: string[]; eviter: string[] }
}

/** Ordre des créneaux dans une journée. */
const ORDRE: TypeRepas[] = ['petit-dejeuner', 'dejeuner', 'gouter', 'diner', 'gamelle']
const PLATS: TypeRepas[] = ['dejeuner', 'diner', 'gamelle']
/** Catégories de placard : ne comptent pas comme « ingrédient réutilisé ». */
export const CATEGORIES_PLACARD = new Set(['epice-herbe', 'condiment', 'matiere-grasse'])

export const idRepas = (semaine: string, jour: Jour, type: TypeRepas) => `${semaine}:${jour}:${type}`

/** Générateur pseudo-aléatoire simple et reproductible (mulberry32). */
export function graine(n: number): () => number {
  let a = n >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Coût d'une portion de recette, en euros (prix estimés ou constatés). */
export function coutPortion(r: Recette, ctx: Pick<ContextePlanning, 'alimentsParId' | 'prix'>): number {
  let total = 0
  for (const i of r.ingredients) {
    if (i.optionnel) continue
    const a = ctx.alimentsParId.get(i.alimentId)
    if (!a) continue
    total += cout(i.quantite, a, ctx.prix(a.id))
  }
  return total / r.portions
}

/** La recette est-elle faisable avec l'équipement et le temps de l'utilisateur ? */
export function recetteFaisable(r: Recette, reglages: Reglages): boolean {
  if (r.tempsMinutes > reglages.tempsMaxMinutes) return false
  return r.equipement.every((e) => reglages.equipement.includes(e) || e === 'bouilloire')
}

export function convient(r: Recette, type: TypeRepas): boolean {
  if (type === 'gamelle') return r.gamelle && (r.types.includes('gamelle') || r.types.includes('diner') || r.types.includes('dejeuner'))
  return r.types.includes(type)
}

function saisonCourante(d: Date) {
  const m = d.getMonth()
  return m < 2 || m === 11 ? 'hiver' : m < 5 ? 'printemps' : m < 8 ? 'ete' : 'automne'
}

/** Liste des créneaux à remplir pour la semaine, dans l'ordre chronologique. */
export function creneauxDeLaSemaine(reglages: Reglages): { jour: Jour; type: TypeRepas }[] {
  const res: { jour: Jour; type: TypeRepas }[] = []
  for (let j = 0; j < 7; j++)
    for (const type of ORDRE) if (reglages.creneaux[type]?.includes(j as Jour)) res.push({ jour: j as Jour, type })
  return res
}

/**
 * Score d'une recette candidate pour un créneau.
 * Plus c'est haut, mieux c'est. Exporté pour les tests et l'écran « autre idée ».
 */
export function scoreCandidat(
  r: Recette,
  ctx: ContextePlanning,
  etat: { dejaCetteSemaine: Map<string, number>; ingredientsSemaine: Set<string>; coutMedian: number },
): number {
  const gout = scoreRecette(r, ctx.gouts)
  const c = coutPortion(r, ctx)
  const prixNorm = etat.coutMedian > 0 ? Math.max(-1, Math.min(1.5, (c - etat.coutMedian) / etat.coutMedian)) : 0

  const utiles = r.ingredients.filter((i) => {
    const a = ctx.alimentsParId.get(i.alimentId)
    return !i.optionnel && a && !CATEGORIES_PLACARD.has(a.categorie)
  })
  const reutilise = utiles.length ? utiles.filter((i) => etat.ingredientsSemaine.has(i.alimentId)).length / utiles.length : 0

  const enStock = new Set(ctx.stock.map((s) => s.alimentId).filter(Boolean) as string[])
  const bientot = new Set(
    ctx.stock
      .filter((s) => s.alimentId && s.peremption && s.peremption <= ajouterJours(isoJour(ctx.aujourdhui ?? new Date()), 3))
      .map((s) => s.alimentId as string),
  )
  const stock = utiles.length ? utiles.filter((i) => enStock.has(i.alimentId)).length / utiles.length : 0
  const urgence = utiles.some((i) => bientot.has(i.alimentId)) ? 0.5 : 0
  const promo = utiles.some((i) => ctx.promos.has(i.alimentId)) ? 0.25 : 0

  const saison = saisonCourante(ctx.aujourdhui ?? new Date())
  const horsSaison = utiles.some((i) => {
    const a = ctx.alimentsParId.get(i.alimentId)
    return a && a.saisons.length > 0 && !a.saisons.includes(saison)
  })

  const repetitions = etat.dejaCetteSemaine.get(r.id) ?? 0
  const bonusConsigne = ctx.preferences?.tags.some((t) => r.tags.includes(t) || (t === 'batch' && r.batch) || (t === 'gamelle' && r.gamelle)) ? 0.45 : 0
  return (
    bonusConsigne +
    1.0 * gout -
    1.1 * prixNorm +
    0.35 * reutilise +
    0.35 * stock +
    urgence +
    promo -
    (horsSaison ? 0.3 : 0) -
    1.6 * repetitions -
    (ctx.recentes.has(r.id) ? 0.35 : 0)
  )
}

function mediane(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Tirage pondéré parmi les meilleurs candidats (variété sans sacrifier la qualité). */
function tirer<T>(cands: { item: T; score: number; poids: number }[], aleatoire: () => number): T | undefined {
  const top = [...cands].sort((a, b) => b.score - a.score).slice(0, 5)
  if (!top.length) return undefined
  const meilleur = top[0].score
  const poids = top.map((c) => Math.exp((c.score - meilleur) * 3) * c.poids)
  const total = poids.reduce((s, p) => s + p, 0)
  let x = aleatoire() * total
  for (let i = 0; i < top.length; i++) {
    x -= poids[i]
    if (x <= 0) return top[i].item
  }
  return top[top.length - 1].item
}

/** Recettes candidates pour un créneau, avant scoring. */
export function candidats(ctx: ContextePlanning, type: TypeRepas): Recette[] {
  const eviter = new Set(ctx.preferences?.eviter ?? [])
  return ctx.recettes.filter(
    (r) =>
      convient(r, type) &&
      recetteFaisable(r, ctx.reglages) &&
      !recetteExclue(r, ctx.alimentsParId, ctx.reglages, ctx.gouts) &&
      !r.ingredients.some((i) => !i.optionnel && eviter.has(i.alimentId)),
  )
}

/**
 * Génère (ou complète) le planning d'une semaine.
 * - garde les repas verrouillés et déjà cuisinés ;
 * - une recette « batch » couvre aussi 1 ou 2 plats suivants (restes, en gamelle par exemple).
 */
export function genererPlanning(ctx: ContextePlanning): Repas[] {
  const creneaux = creneauxDeLaSemaine(ctx.reglages)
  const gardes = new Map(
    ctx.existants.filter((r) => r.semaine === ctx.semaine && (r.verrouille || r.cuisine)).map((r) => [`${r.jour}:${r.type}`, r]),
  )
  const resultat = new Map<string, Repas>(gardes)
  const dejaCetteSemaine = new Map<string, number>()
  const ingredientsSemaine = new Set<string>()

  const enregistrer = (r: Repas) => {
    resultat.set(`${r.jour}:${r.type}`, r)
    if (!r.restes) dejaCetteSemaine.set(r.recetteId, (dejaCetteSemaine.get(r.recetteId) ?? 0) + 1)
    const rec = ctx.recettes.find((x) => x.id === r.recetteId)
    rec?.ingredients.forEach((i) => ingredientsSemaine.add(i.alimentId))
  }
  gardes.forEach(enregistrer)

  // Si une consigne (temps réduit) ne laisse aucune recette pour un créneau, on relâche le temps pour ce créneau.
  const parType = new Map<TypeRepas, Recette[]>(
    TYPES_REPAS.map((t) => {
      const c = candidats(ctx, t)
      return [t, c.length ? c : candidats({ ...ctx, reglages: { ...ctx.reglages, tempsMaxMinutes: 30 } }, t)]
    }),
  )
  const medianes = new Map<TypeRepas, number>(
    TYPES_REPAS.map((t) => [t, mediane((parType.get(t) ?? []).map((r) => coutPortion(r, ctx)))]),
  )

  for (const { jour, type } of creneaux) {
    const cle = `${jour}:${type}`
    if (resultat.has(cle) || jour < (ctx.jourDebut ?? 0)) continue
    const liste = parType.get(type) ?? []
    const choix = tirer(
      liste.map((r) => ({
        item: r,
        score: scoreCandidat(r, ctx, { dejaCetteSemaine, ingredientsSemaine, coutMedian: medianes.get(type) ?? 0 }),
        poids: facteurFrequence(r, ctx.gouts),
      })),
      ctx.aleatoire,
    )
    if (!choix) continue

    const repas: Repas = {
      id: idRepas(ctx.semaine, jour, type),
      semaine: ctx.semaine,
      jour,
      type,
      recetteId: choix.id,
      portions: 1,
      verrouille: false,
      cuisine: false,
    }
    enregistrer(repas)

    // Batch cooking : la même préparation couvre les plats suivants (2 jours max).
    if (choix.batch && PLATS.includes(type)) {
      let restes = 0
      const max = Math.max(0, Math.min(choix.portions, 3) - 1)
      for (const suivant of creneaux) {
        if (restes >= max) break
        const ecart = suivant.jour - jour
        if (ecart < 0 || ecart > 2 || (ecart === 0 && ORDRE.indexOf(suivant.type) <= ORDRE.indexOf(type))) continue
        if (!PLATS.includes(suivant.type) || resultat.has(`${suivant.jour}:${suivant.type}`)) continue
        if (!convient(choix, suivant.type)) continue
        enregistrer({
          id: idRepas(ctx.semaine, suivant.jour, suivant.type),
          semaine: ctx.semaine,
          jour: suivant.jour,
          type: suivant.type,
          recetteId: choix.id,
          portions: 1,
          verrouille: false,
          cuisine: false,
          restes: true,
        })
        restes++
      }
      repas.portions = 1 + restes
    }
  }

  return [...resultat.values()].sort((a, b) => a.jour - b.jour || ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type))
}

/** « Autre idée » : remplace un repas par une autre recette du même créneau. */
export function autreIdee(ctx: ContextePlanning, planning: Repas[], cible: Repas): Repas | null {
  const autres = planning.filter((r) => r.id !== cible.id)
  const dejaCetteSemaine = new Map<string, number>()
  const ingredientsSemaine = new Set<string>()
  for (const r of autres) {
    if (!r.restes) dejaCetteSemaine.set(r.recetteId, (dejaCetteSemaine.get(r.recetteId) ?? 0) + 1)
    ctx.recettes.find((x) => x.id === r.recetteId)?.ingredients.forEach((i) => ingredientsSemaine.add(i.alimentId))
  }
  const liste = candidats(ctx, cible.type).filter((r) => r.id !== cible.recetteId)
  const coutMedian = mediane(liste.map((r) => coutPortion(r, ctx)))
  const choix = tirer(
    liste.map((r) => ({
      item: r,
      score: scoreCandidat(r, ctx, { dejaCetteSemaine, ingredientsSemaine, coutMedian }),
      poids: facteurFrequence(r, ctx.gouts),
    })),
    ctx.aleatoire,
  )
  if (!choix) return null
  return { ...cible, recetteId: choix.id, portions: 1, restes: false, verrouille: false, cuisine: false }
}

/**
 * Remet d'aplomb les restes après une modification :
 * un repas « restes » sans préparation d'origine (même recette, 0 à 2 jours avant)
 * redevient un repas normal, et chaque préparation compte ses portions de restes.
 */
export function normaliserRestes(planning: Repas[]): Repas[] {
  const tri = [...planning].sort((a, b) => a.jour - b.jour || ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type))
  const portions = new Map<string, number>()
  const res = tri.map((r) => ({ ...r }))
  for (const r of res) {
    if (!r.restes) {
      portions.set(r.id, 1)
      continue
    }
    const origine = [...res]
      .reverse()
      .find(
        (o) =>
          !o.restes &&
          o.recetteId === r.recetteId &&
          r.jour - o.jour >= 0 &&
          r.jour - o.jour <= 2 &&
          (o.jour < r.jour || ORDRE.indexOf(o.type) < ORDRE.indexOf(r.type)),
      )
    if (origine) portions.set(origine.id, (portions.get(origine.id) ?? 1) + 1)
    else {
      r.restes = false
      portions.set(r.id, 1)
    }
  }
  for (const r of res) if (!r.restes && !r.cuisine) r.portions = portions.get(r.id) ?? 1
  return res
}
