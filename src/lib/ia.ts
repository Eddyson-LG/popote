/**
 * Client Claude (API Anthropic) appelé directement depuis le navigateur avec la clé de l'utilisateur.
 * Référence : docs/API.md §3. Toutes les fonctions renvoient `null` en cas d'échec :
 * l'appelant bascule alors silencieusement sur le mode sans IA.
 */
import type { ZodType } from 'zod'
import { db } from './db'

/** Modèles configurables ici, et nulle part ailleurs. */
export const MODELES = {
  /** Petites tâches : lecture de tickets, correspondances, reformulations. */
  rapide: 'claude-haiku-5-5',
  /** Tâches plus riches : recettes, planning en langage naturel. */
  capable: 'claude-sonnet-5-5',
} as const
export type GammeModele = keyof typeof MODELES

/** Prix en dollars par million de tokens (docs/API.md §3.5). */
export const TARIFS: Record<string, { entree: number; sortie: number }> = {
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10 },
}

const URL_API = 'https://api.anthropic.com/v1'
const VERSION_API = '2026-10-21'

export type ErreurIA =
  | 'pas-de-cle'
  | 'ia-desactivee'
  | 'hors-ligne'
  | 'cle-invalide'
  | 'cors-organisation'
  | 'limite-depense'
  | 'trop-de-requetes'
  | 'surcharge'
  | 'reponse-invalide'
  | 'erreur'

export const MESSAGES_ERREUR: Record<ErreurIA, string> = {
  'pas-de-cle': 'Aucune clé API renseignée.',
  'ia-desactivee': 'L’IA est désactivée dans les réglages.',
  'hors-ligne': 'Pas de réseau.',
  'cle-invalide': 'Clé refusée : vérifie-la dans la Console Anthropic.',
  'cors-organisation': 'Ton organisation Anthropic interdit les appels depuis un navigateur. Crée une clé dans une organisation personnelle.',
  'limite-depense': 'Ta limite de dépense API est atteinte.',
  'trop-de-requetes': 'Trop de requêtes, réessaie dans une minute.',
  surcharge: 'Claude est surchargé, réessaie plus tard.',
  'reponse-invalide': 'Réponse inattendue de l’IA.',
  erreur: 'Erreur de l’IA.',
}

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; erreur: ErreurIA }

function entetes(cle: string): HeadersInit {
  return {
    authorization: `Bearer ${cle}`,
    'anthropic-version': VERSION_API,
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  }
}

async function classerErreur(rep: Response): Promise<ErreurIA> {
  let message = ''
  let code = ''
  try {
    const corps = await rep.json()
    message = String(corps?.error?.message ?? '')
    code = String(corps?.error?.details?.error_code ?? '')
  } catch {
    // corps illisible
  }
  if (rep.status === 401) return message.startsWith('CORS requests are not allowed') ? 'cors-organisation' : 'cle-invalide'
  if (rep.status === 400 && message.startsWith('You have reached your specified API usage limits')) return 'limite-depense'
  if (rep.status === 429) return code === 'enforced_spend_limit_reached' ? 'limite-depense' : 'trop-de-requetes'
  if (rep.status === 529 || rep.status >= 500) return 'surcharge'
  return 'erreur'
}

/** La clé à utiliser, ou la raison pour laquelle l'IA n'est pas disponible. */
export async function cleDisponible(): Promise<Resultat<string>> {
  const r = await db.reglages.get('moi')
  if (!r?.cleApi) return { ok: false, erreur: 'pas-de-cle' }
  if (!r.iaActive) return { ok: false, erreur: 'ia-desactivee' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, erreur: 'hors-ligne' }
  return { ok: true, valeur: r.cleApi }
}

/** Teste une clé sans consommer de tokens (GET /v1/models?limit=1). */
export async function testerCle(cle: string): Promise<Resultat<true>> {
  try {
    const rep = await fetch(`${URL_API}/models?limit=1`, { headers: entetes(cle) })
    if (rep.ok) return { ok: true, valeur: true }
    return { ok: false, erreur: await classerErreur(rep) }
  } catch {
    return { ok: false, erreur: 'hors-ligne' }
  }
}

export type BlocContenu =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } }

export interface DemandeJSON<T> {
  gamme: GammeModele
  system: string
  /** Contenu du message utilisateur (texte et/ou images). */
  contenu: string | BlocContenu[]
  /**
   * JSON Schema de la réponse (sortie structurée, docs/API.md §3.4) :
   * `additionalProperties: false` sur chaque objet, pas de min/max/minLength…
   */
  schemaJSON: Record<string, unknown>
  /** Validation Zod de la réponse (seconde barrière). */
  valider: ZodType<T>
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}

/**
 * Appel Messages avec sortie JSON stricte, validée par Zod.
 * Compte les tokens consommés dans les réglages (estimation de coût).
 */
export async function demanderJSON<T>(d: DemandeJSON<T>): Promise<Resultat<T>> {
  const cle = await cleDisponible()
  if (!cle.ok) return cle
  const modele = MODELES[d.gamme]
  const corps: Record<string, unknown> = {
    model: modele,
    max_tokens: d.maxTokens ?? 4096,
    system: d.system,
    messages: [{ role: 'user', content: d.contenu }],
    output_config: { effort: d.effort ?? 'low', format: { type: 'json_schema', schema: d.schemaJSON } },
  }
  let rep: Response
  try {
    rep = await fetch(`${URL_API}/messages`, { method: 'POST', headers: entetes(cle.valeur), body: JSON.stringify(corps) })
  } catch {
    return { ok: false, erreur: 'hors-ligne' }
  }
  if (!rep.ok) return { ok: false, erreur: await classerErreur(rep) }
  try {
    const json = await rep.json()
    await compterTokens(json?.usage)
    if (json?.stop_reason !== 'end_turn') return { ok: false, erreur: 'reponse-invalide' }
    const texte = (json?.content as { type: string; text?: string }[] | undefined)?.find((b) => b.type === 'text')?.text
    if (!texte) return { ok: false, erreur: 'reponse-invalide' }
    const v = d.valider.safeParse(JSON.parse(texte))
    return v.success ? { ok: true, valeur: v.data } : { ok: false, erreur: 'reponse-invalide' }
  } catch {
    return { ok: false, erreur: 'reponse-invalide' }
  }
}

async function compterTokens(usage: Record<string, number> | undefined) {
  if (!usage) return
  const entree = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  const sortie = usage.output_tokens ?? 0
  const r = await db.reglages.get('moi')
  if (r) await db.reglages.update('moi', { tokensEntree: r.tokensEntree + entree, tokensSortie: r.tokensSortie + sortie })
}

/** Coût estimé en dollars des tokens consommés (on suppose un usage réparti au tarif du modèle rapide si inconnu). */
export function coutEstimeDollars(tokensEntree: number, tokensSortie: number, modele: string = MODELES.rapide): number {
  const t = TARIFS[modele] ?? TARIFS[MODELES.rapide]
  return (tokensEntree * t.entree + tokensSortie * t.sortie) / 1_000_000
}

/** Image → base64 JPEG réduite (bord long ≤ 1568 px), sans préfixe data:. */
export async function imageEnBase64(fichier: Blob, bordMax = 1568): Promise<{ data: string; media_type: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(fichier)
  const echelle = Math.min(1, bordMax / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * echelle)
  canvas.height = Math.round(bitmap.height * echelle)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return { data: url.slice(url.indexOf(',') + 1), media_type: 'image/jpeg' }
}
