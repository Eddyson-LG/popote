/**
 * Enregistrement d'un ticket corrigé : prix constatés, achats, goûts et dépense.
 * Les calculs de quantité sont des fonctions pures (testées) ; seule `enregistrerTicket` touche la base.
 */
import type { Aliment, Magasin, Unite } from '@/types'
import { db } from '@/lib/db'
import { enregistrerGout } from '@/lib/contexte'
import { cleLibelle } from './correspondance'
import { sansAccents } from './parseur'

const CLE_APPRIS = 'tickets.correspondances'

const nombre = (s: string) => Number(s.replace(',', '.'))

/** Contenance lue dans un libellé : « PDT 2.5KG » → 2500 g, « LAIT 6X1L » → 6000 ml, « YAOURT 4X125G » → 500 g. */
export function contenanceDuLibelle(libelle: string): { quantite: number; unite: 'g' | 'ml' } | undefined {
  const t = sansAccents(libelle).toUpperCase()
  const m = /(?:(\d{1,2})\s?X\s?)?(\d+(?:[.,]\d+)?)\s?(KG|GR?|L|CL|ML)\b/.exec(t)
  if (!m) return undefined
  const lot = m[1] ? Number(m[1]) : 1
  const v = nombre(m[2])
  const facteur = { KG: 1000, G: 1, GR: 1, L: 1000, CL: 10, ML: 1 }[m[3] as 'KG' | 'G' | 'GR' | 'L' | 'CL' | 'ML']
  const q = lot * v * facteur
  if (!(q > 0)) return undefined
  return { quantite: Math.round(q), unite: ['KG', 'G', 'GR'].includes(m[3]) ? 'g' : 'ml' }
}

/** Nombre de pièces d'un lot lu dans le libellé : « OEUFS X12 », « YAOURT 4X125G », « 6 OEUFS ». */
export function piecesDuLibelle(libelle: string): number | undefined {
  const t = sansAccents(libelle).toUpperCase()
  const m = /(?:^|\s)X\s?(\d{1,2})\b|\b(\d{1,2})\s?X\s?\d|\b(\d{1,2})\s?(?:OEUFS?|PCES?|PIECES?|POTS?|SACHETS?|TRANCHES?)\b/.exec(t)
  const n = m ? Number(m[1] ?? m[2] ?? m[3]) : undefined
  return n && n > 0 ? n : undefined
}

export interface LigneAEnregistrer {
  libelle: string
  prix: number
  quantite?: number
  poidsKg?: number
  alimentId?: string
  /** true si l'utilisateur a choisi l'aliment lui-même (on retient la correction). */
  alimentManuel?: boolean
}

/** Quantité achetée sur une ligne, dans l'unité de base de l'aliment (repli : son format de vente). */
export function quantiteAchetee(ligne: Pick<LigneAEnregistrer, 'libelle' | 'quantite' | 'poidsKg'>, aliment: Aliment): { quantite: number; unite: Unite } {
  const n = ligne.quantite && ligne.quantite > 0 ? ligne.quantite : 1
  const unite = aliment.uniteBase
  const contenance = contenanceDuLibelle(ligne.libelle)
  if (unite === 'g') {
    if (ligne.poidsKg) return { quantite: Math.round(ligne.poidsKg * 1000), unite }
    if (contenance?.unite === 'g') return { quantite: contenance.quantite * n, unite }
  } else if (unite === 'ml') {
    if (contenance?.unite === 'ml') return { quantite: contenance.quantite * n, unite }
  } else {
    if (ligne.poidsKg && aliment.poidsPieceG) return { quantite: Math.max(1, Math.round((ligne.poidsKg * 1000) / aliment.poidsPieceG)) * n, unite }
    const pieces = piecesDuLibelle(ligne.libelle)
    if (pieces) return { quantite: pieces * n, unite }
  }
  return { quantite: aliment.formatVente.quantite * n, unite }
}

/** Magasin de la base correspondant à une enseigne lue (comparaison sans accents ni casse). */
export function magasinPourEnseigne(enseigne: string | undefined, magasins: Magasin[]): Magasin | undefined {
  if (!enseigne) return undefined
  const n = (s: string) => sansAccents(s).toLowerCase().replace(/[^a-z]/g, '')
  const e = n(enseigne)
  return magasins.find((m) => n(m.enseigne) === e) ?? magasins.find((m) => n(m.enseigne).includes(e) || e.includes(n(m.enseigne)))
}

/** « 2026-11-14 » → date ISO complète (midi local, pour ne pas changer de jour en UTC). */
export function dateIsoTicket(jour: string | undefined, maintenant = new Date()): string {
  const m = jour ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour) : null
  if (!m) return maintenant.toISOString()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toISOString()
}

export async function chargerAppris(): Promise<Record<string, string>> {
  const m = await db.meta.get(CLE_APPRIS)
  return (m?.valeur as Record<string, string> | undefined) ?? {}
}

export interface TicketAEnregistrer {
  /** AAAA-MM-JJ */
  date?: string
  magasinId?: string
  /** Total payé ; 0 ou absent → somme des lignes. */
  total?: number
  lignes: LigneAEnregistrer[]
}

export async function enregistrerTicket(t: TicketAEnregistrer): Promise<{ montant: number; prix: number }> {
  const date = dateIsoTicket(t.date)
  const ids = [...new Set(t.lignes.map((l) => l.alimentId).filter(Boolean) as string[])]
  const aliments = new Map((await db.aliments.bulkGet(ids)).filter(Boolean).map((a) => [a!.id, a!]))
  const somme = t.lignes.reduce((s, l) => s + (Number.isFinite(l.prix) ? l.prix : 0), 0)
  const montant = Math.round((t.total && t.total > 0 ? t.total : somme) * 100) / 100
  const achetes: string[] = []
  let nbPrix = 0

  await db.transaction('rw', [db.prix, db.achats, db.depenses, db.meta], async () => {
    for (const l of t.lignes) {
      const a = l.alimentId ? aliments.get(l.alimentId) : undefined
      if (!a || !(l.prix > 0)) continue
      const q = quantiteAchetee(l, a)
      await db.prix.add({ cle: a.id, alimentId: a.id, magasinId: t.magasinId, prix: l.prix, quantite: q.quantite, unite: q.unite, source: 'ticket', date })
      await db.achats.add({ alimentId: a.id, date, quantite: q.quantite, unite: q.unite, prix: l.prix, magasinId: t.magasinId })
      achetes.push(a.id)
      nbPrix++
    }
    if (montant > 0) await db.depenses.add({ date, montant, magasinId: t.magasinId, origine: 'ticket' })

    // On retient les associations choisies à la main pour les prochains tickets.
    const corrections = t.lignes.filter((l) => l.alimentManuel && l.alimentId && cleLibelle(l.libelle))
    if (corrections.length) {
      const m = await db.meta.get(CLE_APPRIS)
      const appris = { ...((m?.valeur as Record<string, string> | undefined) ?? {}) }
      for (const l of corrections) appris[cleLibelle(l.libelle)] = l.alimentId!
      await db.meta.put({ cle: CLE_APPRIS, valeur: appris })
    }
  })
  for (const id of achetes) await enregistrerGout('aliment', id, { achat: true })
  return { montant, prix: nbPrix }
}
