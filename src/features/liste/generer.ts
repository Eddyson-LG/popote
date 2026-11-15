/**
 * Génération automatique de la liste de courses à partir de 4 sources :
 * planning, achats habituels, stock (déduit) et objectifs (fruits, alternatives peu sucrées).
 * Fonction pure, testable.
 */
import type { Achat, Aliment, ItemListe, Recette, Repas, StockItem } from '@/types'
import { RAYONS } from '@/types'
import { cout, type ResolveurPrix } from '@/lib/prix'
import { CATEGORIES_PLACARD } from '@/features/recettes/planning'
import type { CarteGouts } from '@/lib/scoring'
import { alimentExclu } from '@/lib/scoring'
import type { Reglages } from '@/types'
import { isoJour } from '@/lib/dates'

export interface ContexteListe {
  repas: Repas[]
  recettes: Map<string, Recette>
  alimentsParId: Map<string, Aliment>
  stock: StockItem[]
  achats: Achat[]
  prix: ResolveurPrix
  gouts: CarteGouts
  reglages: Reglages
  magasinId?: string
  maintenant?: Date
  /** alimentId d'origine → remplaçant moins cher choisi par l'utilisateur. */
  substitutions?: Record<string, string>
}

/** Besoins agrégés par aliment pour les repas non cuisinés (les restes ne coûtent rien de plus). */
export function besoinsDuPlanning(ctx: Pick<ContexteListe, 'repas' | 'recettes'>): Map<string, number> {
  const besoins = new Map<string, number>()
  for (const r of ctx.repas) {
    if (r.cuisine || r.restes) continue
    const rec = ctx.recettes.get(r.recetteId)
    if (!rec) continue
    const facteur = r.portions / rec.portions
    for (const i of rec.ingredients) {
      if (i.optionnel) continue
      besoins.set(i.alimentId, (besoins.get(i.alimentId) ?? 0) + i.quantite * facteur)
    }
  }
  return besoins
}

/** Quantité en stock par aliment (même unité de base). */
export function quantitesEnStock(stock: StockItem[], alimentsParId: Map<string, Aliment>, aujourdhui?: string): Map<string, number> {
  const q = new Map<string, number>()
  for (const s of stock) {
    if (!s.alimentId) continue
    // Un produit périmé ne compte plus comme disponible.
    if (aujourdhui && s.peremption && s.peremption < aujourdhui) continue
    const a = alimentsParId.get(s.alimentId)
    if (!a || a.uniteBase !== s.unite) continue
    q.set(s.alimentId, (q.get(s.alimentId) ?? 0) + s.quantite)
  }
  return q
}

/** Arrondi au format vendu : 230 g de pâtes → 1 paquet de 500 g. */
export function arrondirAuFormat(besoin: number, a: Aliment): { nbFormats: number; quantiteAchetee: number } {
  const f = a.formatVente.quantite
  const nbFormats = Math.max(1, Math.ceil(besoin / f - 1e-9))
  return { nbFormats, quantiteAchetee: nbFormats * f }
}

/**
 * Achats habituels : aliments achetés au moins 3 fois sur les 8 dernières semaines,
 * dont le dernier achat date d'au moins l'intervalle moyen.
 */
export function achatsHabituels(achats: Achat[], maintenant = new Date()): string[] {
  const limite = maintenant.getTime() - 56 * 86_400_000
  const parAliment = new Map<string, number[]>()
  for (const a of achats) {
    if (!a.alimentId) continue
    const t = new Date(a.date).getTime()
    if (t < limite) continue
    parAliment.set(a.alimentId, [...(parAliment.get(a.alimentId) ?? []), t])
  }
  const res: string[] = []
  for (const [id, dates] of parAliment) {
    if (dates.length < 3) continue
    dates.sort((x, y) => x - y)
    const intervalle = (dates[dates.length - 1] - dates[0]) / (dates.length - 1)
    if (maintenant.getTime() - dates[dates.length - 1] >= intervalle * 0.8) res.push(id)
  }
  return res
}

function item(a: Aliment, besoin: number, raison: ItemListe['raison'], ctx: ContexteListe): ItemListe {
  const { nbFormats, quantiteAchetee } = arrondirAuFormat(besoin, a)
  const p = ctx.prix(a.id, ctx.magasinId)
  return {
    id: a.id,
    alimentId: a.id,
    nom: a.nom,
    emoji: a.emoji,
    rayon: a.rayon,
    quantiteBesoin: Math.round(besoin * 10) / 10,
    unite: a.uniteBase,
    nbFormats,
    libelleFormat: a.formatVente.libelle,
    prixEstime: Math.round(cout(quantiteAchetee, a, p) * 100) / 100,
    sourcePrix: p?.source ?? 'estimation',
    datePrix: p?.date ?? new Date(0).toISOString(),
    detailPrix: p?.detail,
    magasinId: ctx.magasinId,
    raison,
    placard: CATEGORIES_PLACARD.has(a.categorie) || undefined,
    coche: false,
  }
}

/** Ordre de tri : rayon (parcours de magasin), placard en dernier, puis nom. */
export function trierParRayon(items: ItemListe[]): ItemListe[] {
  return [...items].sort(
    (a, b) =>
      Number(!!a.placard) - Number(!!b.placard) ||
      RAYONS.indexOf(a.rayon) - RAYONS.indexOf(b.rayon) ||
      a.nom.localeCompare(b.nom, 'fr'),
  )
}

export function genererListe(ctx: ContexteListe): ItemListe[] {
  const besoins = besoinsDuPlanning(ctx)
  for (const [de, vers] of Object.entries(ctx.substitutions ?? {})) {
    const q = besoins.get(de)
    const a = ctx.alimentsParId.get(de)
    const b = ctx.alimentsParId.get(vers)
    if (q === undefined || !a || !b || a.uniteBase !== b.uniteBase) continue
    besoins.delete(de)
    besoins.set(vers, (besoins.get(vers) ?? 0) + q)
  }
  const stock = quantitesEnStock(ctx.stock, ctx.alimentsParId, isoJour(ctx.maintenant ?? new Date()))
  const items = new Map<string, ItemListe>()

  // 1. Planning, moins le stock.
  for (const [id, q] of besoins) {
    const a = ctx.alimentsParId.get(id)
    if (!a) continue
    const reste = q - (stock.get(id) ?? 0)
    if (reste <= 0.0001) continue
    items.set(id, item(a, reste, 'planning', ctx))
  }

  // 2. Achats habituels absents du stock.
  for (const id of achatsHabituels(ctx.achats, ctx.maintenant)) {
    if (items.has(id) || (stock.get(id) ?? 0) > 0) continue
    const a = ctx.alimentsParId.get(id)
    if (!a || alimentExclu(a, ctx.reglages, ctx.gouts)) continue
    items.set(id, item(a, a.formatVente.quantite, 'habitude', ctx))
  }

  // 3. Objectifs : au moins un fruit de saison pour les goûters / petits-déjeuners.
  const aDesFruits = [...items.values()].some((i) => ctx.alimentsParId.get(i.alimentId ?? '')?.categorie === 'fruit')
  const stockFruits = ctx.stock.some((s) => s.alimentId && ctx.alimentsParId.get(s.alimentId)?.categorie === 'fruit')
  if (!aDesFruits && !stockFruits) {
    const banane = ctx.alimentsParId.get('banane')
    if (banane && !alimentExclu(banane, ctx.reglages, ctx.gouts)) items.set('banane', item(banane, 5, 'objectif', ctx))
  }

  return trierParRayon([...items.values()])
}

/** Totaux : principal (hors placard) et placard. */
/**
 * Totaux de la liste : `total` = tout ce qu'il reste à acheter (placard compris : c'est ce que coûte vraiment la course),
 * avec le détail principal / placard.
 */
export function totaux(items: ItemListe[]): { total: number; principal: number; placard: number; coche: number } {
  let principal = 0
  let placard = 0
  let coche = 0
  for (const i of items) {
    const montant = i.prixPaye ?? i.prixEstime
    if (i.placard) placard += montant
    else principal += montant
    if (i.coche) coche += montant
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return { total: r(principal + placard), principal: r(principal), placard: r(placard), coche: r(coche) }
}

/**
 * Substitutions moins chères pour un article : aliments de la même catégorie et du même rayon,
 * non exclus, moins chers au format, triés par économie.
 */
export function substitutions(it: ItemListe, ctx: ContexteListe, max = 3): { aliment: Aliment; economie: number }[] {
  const a = it.alimentId ? ctx.alimentsParId.get(it.alimentId) : undefined
  if (!a) return []
  const res: { aliment: Aliment; economie: number }[] = []
  for (const b of ctx.alimentsParId.values()) {
    if (b.id === a.id || b.categorie !== a.categorie || b.uniteBase !== a.uniteBase) continue
    if (alimentExclu(b, ctx.reglages, ctx.gouts)) continue
    const remplacant = item(b, it.quantiteBesoin, it.raison, ctx)
    const economie = it.prixEstime - remplacant.prixEstime
    if (economie > 0.2) res.push({ aliment: b, economie: Math.round(economie * 100) / 100 })
  }
  return res.sort((x, y) => y.economie - x.economie).slice(0, max)
}
