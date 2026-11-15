/** Types internes au module Tickets (ne font pas partie du contrat partagé src/types). */

/** Une ligne d'article lue sur un ticket. */
export interface LigneTicket {
  /** Libellé tel qu'imprimé (souvent abrégé, en majuscules). */
  libelle: string
  /** Montant payé pour la ligne, remise déjà déduite (négatif pour une remise isolée). */
  prix: number
  /** Nombre d'articles (« 2 x 1,29 », « x2 »). */
  quantite?: number
  /** Poids pesé, en kg (« 0,875 kg x 1,74 €/kg »). */
  poidsKg?: number
  /** Prix au kg imprimé, si présent. */
  prixAuKg?: number
  /** Montant de remise appliqué à cette ligne (positif), si une ligne de remise la suivait. */
  remise?: number
}

export type MethodeLecture = 'ia' | 'ocr' | 'manuel'

/** Résultat brut d'une lecture de ticket, avant correction. */
export interface TicketLu {
  /** Enseigne canonique (« Lidl », « Leclerc »…), si reconnue. */
  enseigne?: string
  /** Date du ticket, AAAA-MM-JJ. */
  date?: string
  lignes: LigneTicket[]
  /** Total à payer imprimé. */
  total?: number
}
