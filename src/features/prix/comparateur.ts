/**
 * Comparateur de magasins : combien coûte la liste dans chaque magasin,
 * et vaut-il le coup de la répartir entre deux magasins ?
 * Fonctions pures (testées).
 */
import type { Aliment, ItemListe, Magasin } from '@/types'
import { cout, type ResolveurPrix } from '@/lib/prix'

export interface TotalMagasin {
  magasin: Magasin
  total: number
  /** Part des articles dont le prix vient vraiment de ce magasin (0 à 1). */
  couverture: number
}

function coutItem(i: ItemListe, a: Aliment | undefined, prix: ResolveurPrix, magasinId: string): { montant: number; local: boolean } {
  if (!a || !i.alimentId) return { montant: i.prixEstime, local: false }
  const p = prix(i.alimentId, magasinId)
  return { montant: cout(i.nbFormats * a.formatVente.quantite, a, p), local: p?.magasinId === magasinId }
}

export function comparerMagasins(items: ItemListe[], magasins: Magasin[], alimentsParId: Map<string, Aliment>, prix: ResolveurPrix): TotalMagasin[] {
  const principaux = items.filter((i) => !i.placard && !i.coche)
  return magasins
    .map((m) => {
      let total = 0
      let locaux = 0
      for (const i of principaux) {
        const c = coutItem(i, i.alimentId ? alimentsParId.get(i.alimentId) : undefined, prix, m.id)
        total += c.montant
        if (c.local) locaux++
      }
      return { magasin: m, total: Math.round(total * 100) / 100, couverture: principaux.length ? locaux / principaux.length : 0 }
    })
    .sort((a, b) => a.total - b.total)
}

export interface Repartition {
  magasins: [Magasin, Magasin]
  total: number
  economie: number
  /** alimentId → magasinId choisi. */
  affectation: Record<string, string>
}

/**
 * Meilleure répartition entre deux magasins : chaque article va au moins cher des deux.
 * Proposée seulement si l'économie dépasse le seuil réglé (3 € par défaut).
 */
export function meilleureRepartition(
  items: ItemListe[],
  magasins: Magasin[],
  alimentsParId: Map<string, Aliment>,
  prix: ResolveurPrix,
  seuil: number,
): Repartition | null {
  const totaux = comparerMagasins(items, magasins, alimentsParId, prix)
  if (totaux.length < 2) return null
  const meilleurSeul = totaux[0].total
  const principaux = items.filter((i) => !i.placard && !i.coche)
  let meilleure: Repartition | null = null
  for (let x = 0; x < magasins.length; x++)
    for (let y = x + 1; y < magasins.length; y++) {
      const [a, b] = [magasins[x], magasins[y]]
      let total = 0
      const affectation: Record<string, string> = {}
      for (const i of principaux) {
        const al = i.alimentId ? alimentsParId.get(i.alimentId) : undefined
        const ca = coutItem(i, al, prix, a.id).montant
        const cb = coutItem(i, al, prix, b.id).montant
        total += Math.min(ca, cb)
        if (i.alimentId) affectation[i.alimentId] = ca <= cb ? a.id : b.id
      }
      total = Math.round(total * 100) / 100
      const economie = Math.round((meilleurSeul - total) * 100) / 100
      if (economie >= seuil && (!meilleure || total < meilleure.total)) meilleure = { magasins: [a, b], total, economie, affectation }
    }
  return meilleure
}
