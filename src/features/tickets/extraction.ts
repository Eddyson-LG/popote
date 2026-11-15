/**
 * Lecture d'un ticket : d'abord Claude vision si une clé est disponible,
 * sinon (pas de clé, hors ligne, erreur, réponse vide) repli silencieux sur l'OCR local.
 */
import { cleDisponible, demanderJSON, imageEnBase64, type ErreurIA } from '@/lib/ia'
import { parserTicket } from './parseur'
import { reponseTicketIA, SCHEMA_TICKET_JSON, SYSTEME_TICKET, versTicketLu } from './schemaIA'
import type { ProgresOCR } from './ocr'
import type { MethodeLecture, TicketLu } from './types'

export interface Lecture {
  ticket: TicketLu
  methode: Exclude<MethodeLecture, 'manuel'>
  /** Raison pour laquelle l'IA n'a pas servi alors qu'une clé existe (affichée discrètement). */
  erreurIA?: ErreurIA
  /** Texte brut de l'OCR (affichable pour vérification, jamais interprété comme du HTML). */
  texteBrut?: string
}

export type Etape = { type: 'ia' } | { type: 'ocr'; etape: Parameters<ProgresOCR>[0]; progres: number }

export async function lireAvecIA(fichier: Blob): Promise<{ ok: true; ticket: TicketLu } | { ok: false; erreur: ErreurIA }> {
  let image: Awaited<ReturnType<typeof imageEnBase64>>
  try {
    image = await imageEnBase64(fichier)
  } catch {
    return { ok: false, erreur: 'erreur' }
  }
  const r = await demanderJSON({
    gamme: 'rapide',
    system: SYSTEME_TICKET,
    contenu: [
      { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
      { type: 'text', text: 'Voici mon ticket de caisse. Extrais-en le contenu.' },
    ],
    schemaJSON: SCHEMA_TICKET_JSON,
    valider: reponseTicketIA,
    maxTokens: 4096,
    effort: 'low',
  })
  if (!r.ok) return r
  const ticket = versTicketLu(r.valeur)
  return ticket.lignes.length ? { ok: true, ticket } : { ok: false, erreur: 'reponse-invalide' }
}

export async function lireAvecOCR(fichier: Blob, progres?: ProgresOCR): Promise<{ ticket: TicketLu; texte: string }> {
  const { lireTexte } = await import('./ocr')
  const texte = await lireTexte(fichier, progres)
  return { ticket: parserTicket(texte), texte }
}

export async function lireTicket(fichier: Blob, suivi?: (e: Etape) => void): Promise<Lecture> {
  const cle = await cleDisponible()
  let erreurIA: ErreurIA | undefined
  if (cle.ok) {
    suivi?.({ type: 'ia' })
    const r = await lireAvecIA(fichier)
    if (r.ok) return { ticket: r.ticket, methode: 'ia' }
    erreurIA = r.erreur
  }
  const { ticket, texte } = await lireAvecOCR(fichier, (etape, progres) => suivi?.({ type: 'ocr', etape, progres }))
  return { ticket, methode: 'ocr', erreurIA, texteBrut: texte }
}
