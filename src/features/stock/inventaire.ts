/**
 * Logique du stock : regroupement par emplacement, alerte de péremption, valeurs par défaut,
 * et actions Dexie (ajout, modification, suppression).
 */
import type { Aliment, Emplacement, Produit, StockItem, Unite } from '@/types'
import { db } from '@/lib/db'
import { ajouterJours, isoJour } from '@/lib/dates'
import { normaliserTexte } from './off'

export const EMPLACEMENTS: Emplacement[] = ['frigo', 'congelateur', 'placard']

export const EMPLACEMENT_LIBELLES: Record<Emplacement, { nom: string; emoji: string }> = {
  frigo: { nom: 'Frigo', emoji: '🧊' },
  congelateur: { nom: 'Congélateur', emoji: '❄️' },
  placard: { nom: 'Placard', emoji: '🥫' },
}

/** Seuil de l'alerte « à consommer vite », en jours. */
export const SEUIL_VITE_JOURS = 3

/** Jours restants avant la date de péremption (négatif si dépassée). */
export function joursRestants(peremption: string, aujourdhui: string = isoJour()): number {
  const [a1, m1, j1] = aujourdhui.split('-').map(Number)
  const [a2, m2, j2] = peremption.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000)
}

export type EtatPeremption = 'perime' | 'vite' | 'ok' | 'inconnue'

export function etatPeremption(item: Pick<StockItem, 'peremption'>, aujourdhui: string = isoJour()): EtatPeremption {
  if (!item.peremption) return 'inconnue'
  const j = joursRestants(item.peremption, aujourdhui)
  if (j < 0) return 'perime'
  if (j <= SEUIL_VITE_JOURS) return 'vite'
  return 'ok'
}

/** « aujourd'hui », « demain », « dans 5 j », « depuis 2 j ». */
export function libellePeremption(peremption: string, aujourdhui: string = isoJour()): string {
  const j = joursRestants(peremption, aujourdhui)
  if (j < -1) return `périmé depuis ${-j} j`
  if (j === -1) return 'périmé depuis hier'
  if (j === 0) return "à finir aujourd'hui"
  if (j === 1) return 'à finir demain'
  return `encore ${j} j`
}

/** Tri : péremption la plus proche d'abord, sans date à la fin, puis par nom. */
function comparer(a: StockItem, b: StockItem): number {
  return (a.peremption ?? '9999-99-99').localeCompare(b.peremption ?? '9999-99-99') || a.nom.localeCompare(b.nom, 'fr')
}

/** Regroupe le stock par emplacement (frigo, congélateur, placard), groupes vides exclus. */
export function grouperParEmplacement(items: StockItem[]): { emplacement: Emplacement; items: StockItem[] }[] {
  return EMPLACEMENTS.map((emplacement) => ({
    emplacement,
    items: items.filter((i) => i.emplacement === emplacement).sort(comparer),
  })).filter((g) => g.items.length > 0)
}

/** Articles à consommer vite (≤ 3 jours) ou périmés, du plus urgent au moins urgent. */
export function aConsommerVite(items: StockItem[], aujourdhui: string = isoJour()): StockItem[] {
  return items.filter((i) => ['vite', 'perime'].includes(etatPeremption(i, aujourdhui))).sort(comparer)
}

/** Emplacement probable d'un aliment de base. */
export function emplacementPourAliment(a: Pick<Aliment, 'rayon' | 'categorie'>): Emplacement {
  if (a.rayon === 'surgeles') return 'congelateur'
  if (a.rayon === 'frais' || a.rayon === 'boucherie-poisson') return 'frigo'
  if (a.rayon === 'fruits-legumes' && (a.categorie === 'legume' || a.categorie === 'epice-herbe')) return 'frigo'
  return 'placard'
}

/** Emplacement probable d'un produit scanné sans aliment connu, d'après sa catégorie. */
export function emplacementPourCategorie(categorie?: string): Emplacement {
  const c = normaliserTexte(categorie ?? '')
  if (/surgel|glace/.test(c)) return 'congelateur'
  if (/yaourt|fromage|lait|creme|beurre|viande|poisson|jambon|charcut|oeuf|frais|dessert lacte/.test(c)) return 'frigo'
  return 'placard'
}

/** Date de péremption suggérée à partir de la conservation indicative de l'aliment. */
export function peremptionSuggeree(a?: Pick<Aliment, 'conservationJours'>, aujourdhui: string = isoJour()): string | undefined {
  return a?.conservationJours ? ajouterJours(aujourdhui, a.conservationJours) : undefined
}

/** Ligne de stock pour un aliment de base, avec ses valeurs par défaut. */
export function itemDepuisAliment(a: Aliment, aujourdhui: string = isoJour()): StockItem {
  return {
    alimentId: a.id,
    nom: a.nom,
    quantite: a.formatVente.quantite,
    unite: a.uniteBase,
    emplacement: emplacementPourAliment(a),
    peremption: peremptionSuggeree(a, aujourdhui),
    ajouteLe: new Date().toISOString(),
  }
}

/** Ligne de stock pour un produit scanné. */
export function itemDepuisProduit(p: Produit, aliment?: Aliment, aujourdhui: string = isoJour()): StockItem {
  const q: { quantite: number; unite: Unite } = p.quantiteNormalisee ?? { quantite: 1, unite: 'piece' }
  const item: StockItem = {
    codeBarres: p.codeBarres,
    nom: p.marque ? `${p.nom} (${p.marque})` : p.nom,
    quantite: q.quantite,
    unite: q.unite,
    emplacement: aliment ? emplacementPourAliment(aliment) : emplacementPourCategorie(p.categorie),
    ajouteLe: new Date().toISOString(),
  }
  if (p.alimentId) item.alimentId = p.alimentId
  // Pour un produit emballé, la conservation de l'aliment brut n'est qu'un ordre d'idée : on la propose quand même.
  const per = peremptionSuggeree(aliment, aujourdhui)
  if (per) item.peremption = per
  return item
}

// ─────────────────────────── Actions ───────────────────────────

export async function ajouterAuStock(item: StockItem): Promise<number> {
  return (await db.stock.add(item)) as number
}

export async function majStock(id: number, changement: Partial<Omit<StockItem, 'id'>>): Promise<void> {
  await db.stock.update(id, changement)
}

/** Efface la date de péremption (Dexie : propriété mise à undefined = supprimée). */
export async function effacerPeremption(id: number): Promise<void> {
  await db.stock.update(id, { peremption: undefined })
}

export async function supprimerStock(id: number): Promise<void> {
  await db.stock.delete(id)
}
