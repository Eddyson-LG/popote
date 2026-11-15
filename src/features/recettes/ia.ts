/**
 * Fonctions IA du module recettes, toutes avec repli sans IA :
 *  - recettes personnalisées (Sonnet) ;
 *  - consigne de semaine en langage naturel (« cette semaine j'ai la flemme ») ;
 *  - idées « vide-frigo » à partir du stock.
 */
import { z } from 'zod'
import type { Aliment, Recette, Reglages, StockItem } from '@/types'
import { EQUIPEMENTS, TYPES_REPAS } from '@/types'
import { demanderJSON } from '@/lib/ia'
import { violationInterdits } from '@/lib/interdits'
import { alimentExclu, type CarteGouts } from '@/lib/scoring'
import { ajouterJours, isoJour } from '@/lib/dates'

// ─────────────────────────── Consigne de semaine ───────────────────────────

export interface Consigne {
  /** Temps max par repas pour cette génération. */
  tempsMax?: number
  /** Tags à favoriser (rapide, batch, sans-cuisson, vegetarien, economique…). */
  preferer: string[]
  /** Aliments à éviter cette semaine (ids). */
  eviter: string[]
  /** Variation de budget (ex. -10 pour « encore moins cher »). */
  budgetDelta?: number
  /** Ce que Popote a compris, à afficher. */
  resume: string
}

const sansAccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Interprétation par règles (mode sans IA, et filet de sécurité). Fonction pure testée. */
export function interpreterConsigneRegles(texte: string, aliments: Aliment[]): Consigne {
  const t = sansAccent(texte)
  const c: Consigne = { preferer: [], eviter: [], resume: '' }
  const compris: string[] = []
  if (/flemme|creve|fatigue|pas le temps|rapide|presse|vite/.test(t)) {
    c.tempsMax = 15
    c.preferer.push('rapide', 'sans-cuisson')
    compris.push('des repas rapides (15 min max)')
  }
  if (/batch|avance|une fois pour|meal ?prep|dimanche/.test(t)) {
    c.preferer.push('batch')
    compris.push('du batch cooking')
  }
  if (/pas cher|fauche|econom|serre|moins cher|budget/.test(t)) {
    c.budgetDelta = -10
    c.preferer.push('economique')
    compris.push('un budget plus serré')
  }
  if (/vegetarien|sans viande|veggie|vege\b/.test(t)) {
    c.preferer.push('vegetarien')
    compris.push('du végétarien')
  }
  // « pas de X » / « sans X » / « marre des X »
  for (const m of t.matchAll(/(?:pas de|sans|marre des?|plus de)\s+([a-z' -]{3,30})/g)) {
    const mot = m[1].trim().replace(/s\b/g, '')
    const a = aliments.find((x) => sansAccent(x.nom).startsWith(mot) || x.synonymes?.some((s) => sansAccent(s).startsWith(mot)))
    if (a && !c.eviter.includes(a.id)) {
      c.eviter.push(a.id)
      compris.push(`pas de ${a.nom.toLowerCase()}`)
    }
  }
  c.resume = compris.length ? `Compris : ${compris.join(', ')}.` : 'Je n’ai pas tout compris, je fais une semaine classique.'
  return c
}

const zConsigne = z.object({
  tempsMax: z.number().nullable(),
  preferer: z.array(z.string()),
  eviter: z.array(z.string()),
  budgetDelta: z.number().nullable(),
  resume: z.string(),
})

export async function interpreterConsigne(texte: string, aliments: Aliment[]): Promise<Consigne & { parIA: boolean }> {
  const regles = interpreterConsigneRegles(texte, aliments)
  const ids = aliments.map((a) => `${a.id}=${a.nom}`).join('; ')
  const r = await demanderJSON({
    gamme: 'rapide',
    system:
      "Tu interprètes la consigne d'un étudiant pour son planning de repas de la semaine. Réponds en JSON. " +
      'tempsMax : minutes max par repas ou null. preferer : parmi rapide, batch, sans-cuisson, vegetarien, economique, gamelle. ' +
      "eviter : identifiants d'aliments de la liste fournie uniquement. budgetDelta : variation en euros ou null. " +
      'resume : une phrase courte au tutoiement, ton de pote, qui commence par « Compris : ».',
    contenu: `Aliments (id=nom) : ${ids}\n\nConsigne : « ${texte.slice(0, 500)} »`,
    schemaJSON: {
      type: 'object',
      properties: {
        tempsMax: { type: ['number', 'null'] },
        preferer: { type: 'array', items: { type: 'string' } },
        eviter: { type: 'array', items: { type: 'string' } },
        budgetDelta: { type: ['number', 'null'] },
        resume: { type: 'string' },
      },
      required: ['tempsMax', 'preferer', 'eviter', 'budgetDelta', 'resume'],
      additionalProperties: false,
    },
    valider: zConsigne,
    maxTokens: 800,
  })
  if (!r.ok) return { ...regles, parIA: false }
  const idsValides = new Set(aliments.map((a) => a.id))
  return {
    tempsMax: r.valeur.tempsMax && r.valeur.tempsMax >= 5 ? Math.min(r.valeur.tempsMax, 30) : undefined,
    preferer: r.valeur.preferer.slice(0, 6),
    eviter: r.valeur.eviter.filter((id) => idsValides.has(id)),
    budgetDelta: r.valeur.budgetDelta ?? undefined,
    resume: r.valeur.resume,
    parIA: true,
  }
}

// ─────────────────────────── Recettes générées ───────────────────────────

const zRecetteIA = z.object({
  nom: z.string().min(2),
  emoji: z.string().min(1),
  types: z.array(z.enum(TYPES_REPAS)).min(1),
  tempsMinutes: z.number(),
  portions: z.number(),
  ingredients: z.array(z.object({ alimentId: z.string(), quantite: z.number() })).min(1),
  etapes: z.array(z.string()).min(1),
  equipement: z.array(z.enum(EQUIPEMENTS)),
  gamelle: z.boolean(),
  batch: z.boolean(),
  peuSucre: z.boolean(),
  tags: z.array(z.string()),
})
const zReponseRecettes = z.object({ recettes: z.array(zRecetteIA) })

const SCHEMA_RECETTES = {
  type: 'object',
  properties: {
    recettes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          emoji: { type: 'string' },
          types: { type: 'array', items: { type: 'string', enum: [...TYPES_REPAS] } },
          tempsMinutes: { type: 'integer' },
          portions: { type: 'integer' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: { alimentId: { type: 'string' }, quantite: { type: 'number' } },
              required: ['alimentId', 'quantite'],
              additionalProperties: false,
            },
          },
          etapes: { type: 'array', items: { type: 'string' } },
          equipement: { type: 'array', items: { type: 'string', enum: [...EQUIPEMENTS] } },
          gamelle: { type: 'boolean' },
          batch: { type: 'boolean' },
          peuSucre: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['nom', 'emoji', 'types', 'tempsMinutes', 'portions', 'ingredients', 'etapes', 'equipement', 'gamelle', 'batch', 'peuSucre', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['recettes'],
  additionalProperties: false,
} as const

const slug = (s: string) =>
  sansAccent(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

/**
 * Nettoie et valide une recette proposée par l'IA. Renvoie null si elle doit être rejetée.
 * Fonction pure testée : c'est le dernier rempart contre le fromage, la purée et la soupe.
 */
export function assainirRecetteIA(
  brute: z.infer<typeof zRecetteIA>,
  alimentsParId: Map<string, Aliment>,
  reglages: Pick<Reglages, 'exclusions' | 'alimentsExclus' | 'tempsMaxMinutes'>,
  gouts: CarteGouts,
): Recette | null {
  const ingredients = brute.ingredients
    .filter((i) => alimentsParId.has(i.alimentId) && i.quantite > 0)
    .map((i) => ({ alimentId: i.alimentId, quantite: Math.round(i.quantite * 10) / 10, unite: alimentsParId.get(i.alimentId)!.uniteBase }))
  // On refuse une recette dont des ingrédients ont été inventés (hors de notre liste).
  if (!ingredients.length || ingredients.length < brute.ingredients.length) return null
  const etapes = brute.etapes.map((e) => e.replace(/cuill[eè]res? [àa] soupe/gi, 'c. à s.').replace(/cuill[eè]res? [àa] caf[eé]/gi, 'c. à c.'))
  const r: Recette = {
    id: `ia-${slug(brute.nom)}`,
    nom: brute.nom.slice(0, 80),
    emoji: [...brute.emoji][0] ?? '🍽️',
    types: brute.types,
    tempsMinutes: Math.round(brute.tempsMinutes),
    portions: Math.max(1, Math.min(6, Math.round(brute.portions))),
    ingredients,
    etapes: etapes.slice(0, 12),
    equipement: brute.equipement,
    gamelle: brute.gamelle,
    batch: brute.batch,
    peuSucre: brute.peuSucre,
    tags: brute.tags.slice(0, 8).map(slug),
    source: 'ia',
  }
  if (r.tempsMinutes > Math.min(30, reglages.tempsMaxMinutes)) return null
  if (violationInterdits(r, alimentsParId)) return null
  if (r.ingredients.some((i) => alimentExclu(alimentsParId.get(i.alimentId), reglages, gouts))) return null
  return r
}

export async function genererRecettesIA(ctx: {
  aliments: Aliment[]
  reglages: Reglages
  gouts: CarteGouts
  nb: number
  consigne?: string
  stock?: StockItem[]
}): Promise<Recette[] | null> {
  const alimentsParId = new Map(ctx.aliments.map((a) => [a.id, a]))
  const autorises = ctx.aliments.filter((a) => !alimentExclu(a, ctx.reglages, ctx.gouts))
  const aimes = [...ctx.gouts.values()].filter((g) => g.cible === 'aliment' && g.score > 0.3).map((g) => alimentsParId.get(g.refId)?.nom).filter(Boolean)
  const stockTxt = ctx.stock?.length
    ? `\nÀ utiliser en priorité (stock, péremption proche d'abord) : ${ctx.stock
        .filter((s) => s.alimentId)
        .sort((a, b) => (a.peremption ?? '9').localeCompare(b.peremption ?? '9'))
        .slice(0, 20)
        .map((s) => s.alimentId)
        .join(', ')}`
    : ''
  const r = await demanderJSON({
    gamme: 'capable',
    effort: 'medium',
    system:
      'Tu crées des recettes simples et économiques pour un étudiant français de 21 ans qui vit seul, fait du sport et a un budget de ' +
      `${ctx.reglages.budgetHebdo} € par semaine. Règles ABSOLUES : jamais de fromage (sous aucune forme), jamais de purée, jamais de soupe ni de velouté. ` +
      `${ctx.reglages.tempsMaxMinutes} minutes maximum. Équipement disponible : ${ctx.reglages.equipement.join(', ')}. ` +
      "N'utilise QUE les identifiants d'aliments fournis (quantités dans l'unité indiquée : g, ml ou piece). " +
      'Étapes courtes au tutoiement. Pas de calories ni de chiffres nutritionnels. Allergies : ' +
      (ctx.reglages.allergies || 'aucune') +
      '.',
    contenu:
      `Aliments autorisés (id:unité) : ${autorises.map((a) => `${a.id}:${a.uniteBase}`).join(', ')}\n` +
      `Aliments qu'il aime : ${aimes.join(', ') || 'inconnu'}${stockTxt}\n` +
      `Propose ${ctx.nb} recettes variées (déjeuner, dîner ou gamelle transportable).` +
      (ctx.consigne ? `\nConsigne : ${ctx.consigne.slice(0, 300)}` : ''),
    schemaJSON: SCHEMA_RECETTES,
    valider: zReponseRecettes,
    maxTokens: 6000,
  })
  if (!r.ok) return null
  return r.valeur.recettes.map((b) => assainirRecetteIA(b, alimentsParId, ctx.reglages, ctx.gouts)).filter((x): x is Recette => !!x)
}

// ─────────────────────────── Vide-frigo ───────────────────────────

/**
 * Vide-frigo sans IA : les recettes qui utilisent le plus le stock,
 * en donnant la priorité aux produits qui périment bientôt. Fonction pure testée.
 */
export function videFrigoRegles(recettes: Recette[], stock: StockItem[], alimentsParId: Map<string, Aliment>, aujourdhui = isoJour()) {
  const enStock = new Set(stock.map((s) => s.alimentId).filter(Boolean) as string[])
  const bientot = new Set(stock.filter((s) => s.alimentId && s.peremption && s.peremption <= ajouterJours(aujourdhui, 3)).map((s) => s.alimentId!))
  return recettes
    .map((r) => {
      const utiles = r.ingredients.filter((i) => !['epice-herbe', 'condiment', 'matiere-grasse', 'sucre'].includes(alimentsParId.get(i.alimentId)?.categorie ?? ''))
      const dispo = utiles.filter((i) => enStock.has(i.alimentId))
      const manque = utiles.filter((i) => !enStock.has(i.alimentId)).map((i) => i.alimentId)
      const urgent = utiles.filter((i) => bientot.has(i.alimentId)).length
      return { recette: r, ratio: utiles.length ? dispo.length / utiles.length : 0, manque, urgent }
    })
    .filter((x) => x.ratio >= 0.5)
    .sort((a, b) => b.urgent - a.urgent || b.ratio - a.ratio || a.manque.length - b.manque.length)
    .slice(0, 6)
}
