/**
 * Cœur de la couche de prix : conversions d'unités, choix du meilleur prix connu,
 * coût d'une quantité. Les fournisseurs (Open Prices, tickets, manuel, promos,
 * estimation) vivent dans src/features/prix et renvoient des PrixAffiche.
 */
import type { Aliment, PrixAffiche, Unite, UnitePrix } from '@/types'

/** Prix pour UNE unité de base (1 g, 1 ml ou 1 pièce) à partir d'un prix €/kg, €/L ou €/pièce. */
export function prixParUniteBase(p: Pick<PrixAffiche, 'prixUnitaire' | 'unitePrix'>, uniteBase: Unite, aliment?: Aliment): number {
  const parBase = conversion(p.unitePrix, uniteBase, aliment)
  return parBase === null ? NaN : p.prixUnitaire * parBase
}

/** Combien d'« unités de prix » dans une unité de base (ex. 1 g = 0,001 kg). null si incompatible. */
function conversion(unitePrix: UnitePrix, uniteBase: Unite, aliment?: Aliment): number | null {
  if (unitePrix === 'kg' && uniteBase === 'g') return 1 / 1000
  if (unitePrix === 'l' && uniteBase === 'ml') return 1 / 1000
  if (unitePrix === 'piece' && uniteBase === 'piece') return 1
  // Pièce ↔ poids : possible si on connaît le poids d'une pièce.
  if (unitePrix === 'kg' && uniteBase === 'piece' && aliment?.poidsPieceG) return aliment.poidsPieceG / 1000
  if (unitePrix === 'piece' && uniteBase === 'g' && aliment?.poidsPieceG) return 1 / aliment.poidsPieceG
  // Liquides : 1 ml ≈ 1 g.
  if (unitePrix === 'kg' && uniteBase === 'ml') return 1 / 1000
  if (unitePrix === 'l' && uniteBase === 'g') return 1 / 1000
  return null
}

/** Coût d'une quantité d'un aliment, en euros. */
export function cout(quantite: number, aliment: Aliment, p: PrixAffiche | null): number {
  if (!p) return 0
  const u = prixParUniteBase(p, aliment.uniteBase, aliment)
  return Number.isFinite(u) ? quantite * u : 0
}

/** Priorité des sources quand deux prix ont le même âge. */
const PRIORITE: Record<PrixAffiche['source'], number> = {
  promo: 6,
  liste: 5,
  ticket: 5,
  manuel: 5,
  'open-prices': 3,
  estimation: 0,
}

/**
 * Choisit le prix à afficher parmi plusieurs sources :
 * une promo en cours l'emporte, sinon un prix constaté de moins de 90 jours
 * (le plus récent, à source égale), sinon le plus récent, sinon l'estimation.
 */
export function meilleurPrix(candidats: (PrixAffiche | null | undefined)[], maintenant = new Date()): PrixAffiche | null {
  const liste = candidats.filter((c): c is PrixAffiche => !!c && Number.isFinite(c.prixUnitaire) && c.prixUnitaire > 0)
  if (!liste.length) return null
  const promo = liste.find((c) => c.source === 'promo')
  if (promo) return promo
  const constates = liste.filter((c) => !c.estime)
  const frais = constates.filter((c) => maintenant.getTime() - new Date(c.date).getTime() < 90 * 86_400_000)
  // Estimations « vivantes » (médiane nationale Open Prices) avant la table de référence, quelle que soit sa date.
  const medianes = liste.filter((c) => c.estime && c.source !== 'estimation')
  const reference = liste.filter((c) => c.source === 'estimation')
  const pool = frais.length ? frais : constates.length ? constates : medianes.length ? medianes : reference
  return [...pool].sort((a, b) => {
    const d = new Date(b.date).getTime() - new Date(a.date).getTime()
    // Même jour : on départage par la fiabilité de la source.
    return Math.abs(d) < 86_400_000 ? PRIORITE[b.source] - PRIORITE[a.source] : d
  })[0]
}

/** Libellé de la source d'un prix, pour l'affichage. */
export const LIBELLE_SOURCE: Record<PrixAffiche['source'], string> = {
  'open-prices': 'Open Prices',
  ticket: 'ticket',
  manuel: 'saisi',
  liste: 'payé',
  promo: 'promo',
  estimation: 'estimé',
}

/** Fonction qui donne le prix d'un aliment (synchrone : les prix sont résolus à l'avance). */
export type ResolveurPrix = (alimentId: string, magasinId?: string) => PrixAffiche | null

/** « estimé · il y a 3 j », « Open Prices (médiane France) · hier » : source + âge, partout pareil. */
export function sourceEtAge(source: PrixAffiche['source'], date: string, detail?: string, ageDe: (d: string) => string = (d) => d): string {
  return `${LIBELLE_SOURCE[source]}${detail ? ` (${detail})` : ''} · ${ageDe(date)}`
}
