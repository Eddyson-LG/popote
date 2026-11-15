/**
 * Source Open Prices (prix collaboratifs Open Food Facts, licence ODbL). Référence : docs/API.md §2.
 *
 * Deux usages :
 *  1. prix LOCAUX autour de l'utilisateur (rayon autour de Taradeau) → prix constatés ;
 *  2. si rien de local : médiane NATIONALE récente par catégorie → estimation (portee 'national').
 * La couverture du Var étant très faible (§2.5), le 2 est en pratique le plus utile.
 */
import type { Aliment, Magasin, PrixObservation, Produit } from '@/types'
import { ajouterJours, isoJour } from '@/lib/dates'

const BASE = 'https://prices.openfoodfacts.org/api/v1'
const ENTETES = { accept: 'application/json', 'x-user-agent': 'Popote/1.0 (PWA perso)' }
/** Centre approximatif de la zone de l'utilisateur (Taradeau, Var). */
export const ZONE = { lat: 43.455, lon: 6.425, rayonKm: 30 }

/**
 * Correspondance aliment Popote → catégorie Open Food Facts (prix sans code-barres, au kg ou à la pièce).
 * Seuls les produits vendus en vrac sont concernés.
 */
export const CATEGORIES_OFF: Record<string, string> = {
  carotte: 'en:carrots',
  oignon: 'en:onions',
  'pomme-de-terre': 'en:potatoes',
  courgette: 'en:zucchini',
  aubergine: 'en:aubergines',
  tomate: 'en:tomatoes',
  'poivron-rouge': 'en:red-bell-peppers',
  concombre: 'en:cucumbers',
  poireau: 'en:leeks',
  brocoli: 'en:broccoli',
  'chou-fleur': 'en:cauliflowers',
  banane: 'en:bananas',
  pomme: 'en:apples',
  poire: 'en:pears',
  orange: 'en:oranges',
  clementine: 'en:clementines',
  citron: 'en:lemons',
  kiwi: 'en:kiwis',
  'champignon-paris': 'en:button-mushrooms',
  avocat: 'en:avocados',
}

interface PrixOP {
  type: 'PRODUCT' | 'CATEGORY'
  product_code: string | null
  category_tag: string | null
  price: number
  currency: string
  price_per: 'UNIT' | 'KILOGRAM' | 'LITER' | null
  date: string
  location_osm_id?: number | null
  location_osm_type?: string | null
  product?: { product_quantity?: number | null; product_quantity_unit?: string | null } | null
}

async function lire(url: string, timeoutMs = 8000): Promise<PrixOP[]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const rep = await fetch(url, { headers: ENTETES, signal: ctrl.signal })
    if (!rep.ok) return []
    const json = await rep.json()
    return Array.isArray(json?.items) ? (json.items as PrixOP[]) : []
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

const alimentDeCategorie = new Map(Object.entries(CATEGORIES_OFF).map(([a, c]) => [c, a]))

/**
 * Convertit un prix Open Prices en observation Popote, ou null s'il est inexploitable.
 * Fonction pure (testée).
 */
export function versObservation(
  p: PrixOP,
  ctx: { alimentsParId: Map<string, Aliment>; produits: Map<string, Produit>; magasins: Magasin[] },
  portee: 'local' | 'national',
): PrixObservation | null {
  if (p.currency !== 'EUR' || !(p.price > 0)) return null
  let alimentId: string | undefined
  let codeBarres: string | undefined
  if (p.type === 'CATEGORY' && p.category_tag) alimentId = alimentDeCategorie.get(p.category_tag)
  if (p.type === 'PRODUCT' && p.product_code) {
    codeBarres = p.product_code
    alimentId = ctx.produits.get(p.product_code)?.alimentId
  }
  const a = alimentId ? ctx.alimentsParId.get(alimentId) : undefined
  if (!a) return null

  let quantite: number
  let unite = a.uniteBase
  if (p.price_per === 'KILOGRAM') {
    if (a.uniteBase === 'piece') {
      if (!a.poidsPieceG) return null
      quantite = 1000 / a.poidsPieceG
    } else quantite = 1000
  } else if (p.price_per === 'LITER') quantite = 1000
  else if (p.price_per === 'UNIT' && a.uniteBase === 'piece') quantite = 1
  else {
    // Prix à l'article : on utilise la quantité du produit (500 g, 1 L…).
    const q = p.product?.product_quantity
    const u = (p.product?.product_quantity_unit ?? '').toLowerCase()
    if (!q || q <= 0) return null
    if (u === 'g' && a.uniteBase === 'g') quantite = q
    else if (u === 'kg' && a.uniteBase === 'g') quantite = q * 1000
    else if ((u === 'ml' || u === 'g') && a.uniteBase === 'ml') quantite = q
    else if ((u === 'l' || u === 'kg') && a.uniteBase === 'ml') quantite = q * 1000
    else return null
    unite = a.uniteBase
  }
  const magasin = p.location_osm_id ? ctx.magasins.find((m) => m.osmId === p.location_osm_id) : undefined
  return {
    cle: a.id,
    alimentId: a.id,
    codeBarres,
    magasinId: portee === 'local' ? magasin?.id : undefined,
    prix: p.price,
    quantite,
    unite,
    source: 'open-prices',
    date: new Date(`${p.date}T12:00:00`).toISOString(),
    portee,
  }
}

/** Médiane d'observations ramenées à un prix pour la même quantité de référence. */
export function medianeObservations(obs: PrixObservation[]): PrixObservation | null {
  if (!obs.length) return null
  const ref = obs[0].quantite
  const prixRamenes = obs.map((o) => (o.prix / o.quantite) * ref).sort((a, b) => a - b)
  const m = prixRamenes[Math.floor(prixRamenes.length / 2)]
  const plusRecente = obs.reduce((x, y) => (x.date > y.date ? x : y))
  return { ...obs[0], prix: Math.round(m * 100) / 100, date: plusRecente.date, magasinId: undefined }
}

/** Récupère les prix Open Prices utiles (local d'abord, puis médianes nationales par catégorie). */
export async function recupererOpenPrices(ctx: {
  alimentsParId: Map<string, Aliment>
  produits: Map<string, Produit>
  magasins: Magasin[]
}): Promise<PrixObservation[]> {
  const depuis = ajouterJours(isoJour(), -180)
  const locaux = await lire(
    `${BASE}/prices?lat=${ZONE.lat}&lon=${ZONE.lon}&radius_km=${ZONE.rayonKm}&currency=EUR&date__gte=${depuis}&order_by=-date&size=100`,
  )
  const res = locaux.map((p) => versObservation(p, ctx, 'local')).filter((o): o is PrixObservation => !!o)
  const couverts = new Set(res.map((o) => o.alimentId))

  // Médianes nationales sur 90 jours pour les catégories sans prix local (requêtes une par une, sobres).
  const depuisNational = ajouterJours(isoJour(), -90)
  for (const [alimentId, tag] of Object.entries(CATEGORIES_OFF)) {
    if (couverts.has(alimentId) || !ctx.alimentsParId.has(alimentId)) continue
    const items = await lire(`${BASE}/prices?type=CATEGORY&category_tag=${encodeURIComponent(tag)}&currency=EUR&date__gte=${depuisNational}&order_by=-date&size=30`)
    const obs = items.map((p) => versObservation(p, ctx, 'national')).filter((o): o is PrixObservation => !!o)
    // On ne garde la médiane que si elle repose sur au moins 3 prix.
    const m = obs.length >= 3 ? medianeObservations(obs) : null
    if (m) res.push(m)
  }
  return res
}
