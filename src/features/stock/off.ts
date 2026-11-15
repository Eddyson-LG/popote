/**
 * Client Open Food Facts (API v3, lecture d'un produit par code-barres) — voir docs/API.md §1.
 *
 * - Champs minimaux, timeout 8 s, au plus 15 lectures par minute (limite OFF par IP).
 * - Produit inconnu (HTTP 404) → null ; hors ligne, timeout, limite atteinte → null.
 * - Résultat mis en cache dans db.produits (clé : code-barres).
 * - Les fonctions pures (analyse de la réponse, quantités, correspondance aliment) sont testées.
 */
import type { Aliment, Produit, Unite } from '@/types'
import { db } from '@/lib/db'

const BASE = 'https://world.openfoodfacts.org/api/v3/product/'
const CHAMPS = [
  'code',
  'product_name',
  'product_name_fr',
  'brands',
  'image_front_small_url',
  'image_front_url',
  'nutriscore_grade',
  'categories_tags',
  'categories_tags_fr',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
].join(',')
/** En-tête d'identification proposé par docs/API.md §1.5 (User-Agent non modifiable depuis le navigateur). */
const X_USER_AGENT = 'Popote/0.1.0 (PWA perso, sans serveur)'
const TIMEOUT_MS = 8000
/** Un produit OFF en cache est relu au bout de 30 jours (photo, Nutri-Score peuvent évoluer). */
const FRAICHEUR_CACHE_MS = 30 * 86_400_000
const LIMITE_PAR_MINUTE = 15

// ─────────────────────────── Texte ───────────────────────────

/** Minuscules, sans accents, ponctuation → espaces. « Pâtes-Complètes » → « pates completes ». */
export function normaliserTexte(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Pluriels simples retirés mot à mot : « carottes » → « carotte », « choux » → « chou ». */
function singulier(s: string): string {
  return s
    .split(' ')
    .map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m))
    .join(' ')
}

/** Recherche d'aliments par nom ou synonyme, insensible à la casse et aux accents. */
export function rechercherAliments(aliments: Aliment[], requete: string, max = 8): Aliment[] {
  const q = normaliserTexte(requete)
  if (q.length < 2) return []
  const qs = singulier(q)
  const scores: { a: Aliment; s: number }[] = []
  for (const a of aliments) {
    const termes = [a.nom, ...(a.synonymes ?? [])].map(normaliserTexte)
    let s = 0
    for (const t of termes) {
      if (t === q) s = Math.max(s, 3)
      else if (t.startsWith(q) || singulier(t).startsWith(qs)) s = Math.max(s, 2)
      else if (t.includes(q) || singulier(t).includes(qs)) s = Math.max(s, 1)
    }
    if (s > 0) scores.push({ a, s })
  }
  return scores
    .sort((x, y) => y.s - x.s || x.a.nom.length - y.a.nom.length)
    .slice(0, max)
    .map((x) => x.a)
}

// ─────────────────────────── Codes-barres ───────────────────────────

/** Vérifie un EAN-8, UPC-A (12), EAN-13 ou GTIN-14 (clé de contrôle modulo 10). */
export function codeBarresValide(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false
  const chiffres = code.split('').map(Number)
  const cle = chiffres.pop()!
  const somme = chiffres.reverse().reduce((acc, c, i) => acc + c * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (somme % 10)) % 10 === cle
}

// ─────────────────────────── Quantités ───────────────────────────

const FACTEURS: Record<string, { unite: Unite; facteur: number }> = {
  mg: { unite: 'g', facteur: 0.001 },
  g: { unite: 'g', facteur: 1 },
  gr: { unite: 'g', facteur: 1 },
  kg: { unite: 'g', facteur: 1000 },
  ml: { unite: 'ml', facteur: 1 },
  cl: { unite: 'ml', facteur: 10 },
  dl: { unite: 'ml', facteur: 100 },
  l: { unite: 'ml', facteur: 1000 },
  lt: { unite: 'ml', facteur: 1000 },
}

function versNombre(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim().replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function arrondir(q: number): number {
  return Math.round(q * 100) / 100
}

/**
 * Quantité en g ou ml à partir de `product_quantity` + `product_quantity_unit`,
 * avec repli sur le texte `quantity` (« 400 g », « 1,5 L », « 6 x 125 g »).
 * Unité absente : OFF exprime `product_quantity` en g (ou ml pour les liquides), on suppose g
 * sauf si le texte indique un volume.
 */
export function normaliserQuantite(
  productQuantity: unknown,
  unite: unknown,
  texte?: unknown,
): { quantite: number; unite: Unite } | undefined {
  const n = versNombre(productQuantity)
  const depuisTexte = typeof texte === 'string' ? lireQuantiteTexte(texte) : undefined
  if (n !== null && n > 0) {
    const u = typeof unite === 'string' ? unite.trim().toLowerCase() : ''
    const f = FACTEURS[u]
    if (f) return { quantite: arrondir(n * f.facteur), unite: f.unite }
    if (!u) return { quantite: arrondir(n), unite: depuisTexte?.unite ?? 'g' }
  }
  return depuisTexte
}

/** Lit un texte de quantité libre. Renvoie undefined si illisible. */
export function lireQuantiteTexte(texte: string): { quantite: number; unite: Unite } | undefined {
  const t = texte.toLowerCase().replace(/,/g, '.')
  const multiple = t.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mg|kg|gr|g|ml|cl|dl|lt|l)\b/)
  if (multiple) {
    const f = FACTEURS[multiple[3]]
    return { quantite: arrondir(Number(multiple[1]) * Number(multiple[2]) * f.facteur), unite: f.unite }
  }
  const simple = t.match(/(\d+(?:\.\d+)?)\s*(mg|kg|gr|g|ml|cl|dl|lt|l)\b/)
  if (simple) {
    const f = FACTEURS[simple[2]]
    const q = Number(simple[1]) * f.facteur
    if (q > 0) return { quantite: arrondir(q), unite: f.unite }
  }
  return undefined
}

// ─────────────────────────── Correspondance aliment ───────────────────────────

/**
 * Catégories OFF anglaises (taxonomie stable) → aliment de base, pour les cas fréquents
 * où le nom du produit ne contient pas le nom de l'aliment (« Panzani n°5 » → pâtes).
 * Ordre : du plus spécifique au plus général.
 */
const CATEGORIES_EN: [string, string][] = [
  ['en:whole-wheat-pastas', 'pates-completes'],
  ['en:spaghetti', 'spaghetti'],
  ['en:gnocchi', 'gnocchis'],
  ['en:pastas', 'pates'],
  ['en:basmati-rices', 'riz-basmati'],
  ['en:brown-rices', 'riz-complet'],
  ['en:rices', 'riz-blanc'],
  ['en:couscous', 'semoule'],
  ['en:bulgur', 'boulgour'],
  ['en:quinoa', 'quinoa'],
  ['en:rolled-oats', 'flocons-avoine'],
  ['en:red-lentils', 'lentilles-corail'],
  ['en:green-lentils', 'lentilles-vertes'],
  ['en:chickpeas', 'pois-chiches-boite'],
  ['en:red-kidney-beans', 'haricots-rouges-boite'],
  ['en:white-beans', 'haricots-blancs-boite'],
  ['en:canned-tunas', 'thon-boite'],
  ['en:tunas', 'thon-boite'],
  ['en:canned-sardines', 'sardine-boite'],
  ['en:sardines', 'sardine-boite'],
  ['en:mackerels', 'maquereau-boite'],
  ['en:hummus', 'houmous'],
  ['en:tofu', 'tofu'],
  ['en:eggs', 'oeuf'],
  ['en:greek-style-yogurts', 'yaourt-grec'],
  ['en:skyr', 'skyr'],
  ['en:plain-yogurts', 'yaourt-nature'],
  ['en:creme-fraiche', 'creme-fraiche'],
  ['en:butters', 'beurre'],
  ['en:oat-based-drinks', 'boisson-avoine'],
  ['en:coconut-milks', 'lait-coco'],
  ['en:milks', 'lait'],
  ['en:extra-virgin-olive-oils', 'huile-olive'],
  ['en:olive-oils', 'huile-olive'],
  ['en:sunflower-oils', 'huile-tournesol'],
  ['en:soy-sauces', 'sauce-soja'],
  ['en:mustards', 'moutarde'],
  ['en:ketchup', 'ketchup'],
  ['en:mayonnaises', 'mayonnaise'],
  ['en:tomato-pastes', 'concentre-tomate'],
  ['en:tomato-sauces', 'coulis-tomate'],
  ['en:pestos', 'pesto-basilic'],
  ['en:bouillon-cubes', 'bouillon-cube'],
  ['en:honeys', 'miel'],
  ['en:hazelnut-spreads', 'pate-a-tartiner'],
  ['en:jams', 'confiture'],
  ['en:dark-chocolates', 'chocolat-noir'],
  ['en:maple-syrups', 'sirop-erable'],
  ['en:peanut-butters', 'beurre-cacahuete'],
  ['en:orange-juices', 'jus-orange'],
  ['en:wholemeal-breads', 'pain-complet'],
  ['en:sandwich-breads', 'pain-de-mie'],
  ['en:baguettes', 'baguette'],
  ['en:tortillas', 'tortilla'],
  ['en:wheat-flours', 'farine'],
  ['en:mueslis', 'muesli-sans-sucre'],
  ['en:compotes', 'compote-sans-sucre'],
  ['en:frozen-spinachs', 'epinards-surgeles'],
  ['en:frozen-green-beans', 'haricots-verts-surgeles'],
  ['en:frozen-peas', 'petits-pois-surgeles'],
  ['en:surimi', 'surimi'],
  ['en:lardons', 'lardons'],
  ['en:white-hams', 'jambon-blanc'],
  ['en:chorizo', 'chorizo'],
  ['en:coffees', 'cafe'],
  ['en:teas', 'the'],
]

export interface IndicesProduit {
  nom?: string
  /** Tags OFF bruts (« en:pastas », « fr:pates-alimentaires »). */
  categoriesTags?: string[]
  /** Libellés français (« Pâtes alimentaires »). */
  categoriesFr?: string[]
}

/**
 * Cherche l'aliment de base correspondant à un produit (fonction pure) :
 * 1. le nom du produit contient le nom (ou un synonyme) d'un aliment, mot pour mot ;
 * 2. sinon, une catégorie française contient un aliment ;
 * 3. sinon, une catégorie anglaise connue (table CATEGORIES_EN).
 * À égalité, le terme le plus long (le plus spécifique) l'emporte : « pâtes complètes » > « pâtes ».
 */
export function correspondreAliment(indices: IndicesProduit, aliments: Aliment[]): string | undefined {
  const ids = new Set(aliments.map((a) => a.id))
  const enMots = (s: string) => ` ${singulier(normaliserTexte(s))} `
  const nom = indices.nom ? enMots(indices.nom) : ''
  const cats = [
    ...(indices.categoriesFr ?? []),
    ...(indices.categoriesTags ?? []).filter((t) => t.startsWith('fr:')).map((t) => t.slice(3)),
  ].map(enMots)

  const meilleur = (textes: string[]): string | undefined => {
    let best: { id: string; score: number } | undefined
    for (const a of aliments) {
      const termes = [a.nom, a.nom.replace(/\(.*?\)/g, ''), ...(a.synonymes ?? [])]
      for (const brut of termes) {
        const t = singulier(normaliserTexte(brut))
        if (t.length < 3) continue
        for (const texte of textes) {
          const pos = texte.indexOf(` ${t} `)
          if (pos < 0) continue
          // Plus long d'abord ; bonus si le terme ouvre le texte (« Lait demi-écrémé » plutôt que « … au lait »).
          const score = t.length * 10 + (pos === 0 ? 5 : 0)
          if (!best || score > best.score) best = { id: a.id, score }
        }
      }
    }
    return best?.id
  }

  if (nom) {
    const parNom = meilleur([nom])
    if (parNom) return parNom
  }
  if (cats.length) {
    const parCat = meilleur(cats)
    if (parCat) return parCat
  }
  const tags = new Set(indices.categoriesTags ?? [])
  for (const [tag, id] of CATEGORIES_EN) if (tags.has(tag) && ids.has(id)) return id
  return undefined
}

// ─────────────────────────── Analyse de la réponse ───────────────────────────

const NUTRISCORES = ['a', 'b', 'c', 'd', 'e'] as const

function chaine(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function tableauChaines(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

/** N'accepte que des photos https du domaine images OFF. */
function imageSure(v: unknown): string | undefined {
  const url = chaine(v)
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('openfoodfacts.org') ? u.href : undefined
  } catch {
    return undefined
  }
}

/** « en:sweet-spreads » → « Sweet spreads » (repli si aucun libellé français). */
function libelleTag(tag: string): string {
  const s = tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Transforme le JSON d'une réponse OFF v3 en Produit (fonction pure).
 * Renvoie null si le produit est absent ou sans nom exploitable.
 */
export function analyserReponseOff(
  json: unknown,
  codeDemande: string,
  aliments: Aliment[],
  maintenant: Date = new Date(),
): Produit | null {
  if (!json || typeof json !== 'object') return null
  const r = json as { status?: unknown; product?: unknown }
  if (r.status === 'failure' || !r.product || typeof r.product !== 'object') return null
  const p = r.product as Record<string, unknown>
  const nom = chaine(p.product_name_fr) ?? chaine(p.product_name)
  if (!nom) return null

  const categoriesTags = tableauChaines(p.categories_tags)
  // tags_lc=fr : les libellés non traduits gardent leur préfixe de langue (« en:… ») → on les écarte.
  const categoriesFr = tableauChaines(p.categories_tags_fr).filter((c) => !/^[a-z]{2}:/.test(c))
  const derniereCat = categoriesFr.at(-1) ?? (categoriesTags.length ? libelleTag(categoriesTags.at(-1)!) : undefined)
  const grade = chaine(p.nutriscore_grade)?.toLowerCase()
  const nutriscore = NUTRISCORES.find((n) => n === grade)
  const marque = chaine(p.brands)?.split(',')[0].trim()

  const produit: Produit = {
    codeBarres: chaine(p.code) ?? codeDemande,
    nom,
    source: 'open-food-facts',
    majLe: maintenant.toISOString(),
  }
  if (marque) produit.marque = marque
  const image = imageSure(p.image_front_small_url) ?? imageSure(p.image_front_url)
  if (image) produit.imageUrl = image
  if (nutriscore) produit.nutriscore = nutriscore
  if (derniereCat) produit.categorie = derniereCat
  const quantiteTexte = chaine(p.quantity)
  if (quantiteTexte) produit.quantiteTexte = quantiteTexte
  const qn = normaliserQuantite(p.product_quantity, p.product_quantity_unit, p.quantity)
  if (qn) produit.quantiteNormalisee = qn
  const alimentId = correspondreAliment({ nom, categoriesTags, categoriesFr }, aliments)
  if (alimentId) produit.alimentId = alimentId
  return produit
}

// ─────────────────────────── Réseau ───────────────────────────

export type ResultatRecherche =
  | { statut: 'trouve'; produit: Produit; depuisCache: boolean }
  | { statut: 'inconnu' }
  | { statut: 'hors-ligne' }
  | { statut: 'limite' }

/** Horodatages des dernières lectures (fenêtre glissante d'une minute). */
const appels: number[] = []

function quotaDisponible(maintenant = Date.now()): boolean {
  while (appels.length && maintenant - appels[0] > 60_000) appels.shift()
  return appels.length < LIMITE_PAR_MINUTE
}

/**
 * Recherche détaillée : distingue produit inconnu, hors ligne et limite de débit,
 * pour que l'écran puisse l'expliquer. Le cache Dexie est consulté en premier.
 */
export async function rechercherProduitDetaille(code: string, f: typeof fetch = fetch): Promise<ResultatRecherche> {
  const propre = code.replace(/\D/g, '')
  const enCache = await db.produits.get(propre)
  const frais = enCache && (enCache.source === 'manuel' || Date.now() - new Date(enCache.majLe).getTime() < FRAICHEUR_CACHE_MS)
  if (enCache && frais) return { statut: 'trouve', produit: enCache, depuisCache: true }
  const repli = (statut: 'hors-ligne' | 'limite'): ResultatRecherche =>
    enCache ? { statut: 'trouve', produit: enCache, depuisCache: true } : { statut }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return repli('hors-ligne')
  if (!quotaDisponible()) return repli('limite')
  appels.push(Date.now())

  const controleur = new AbortController()
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS)
  try {
    const url = `${BASE}${encodeURIComponent(propre)}?fields=${CHAMPS}&tags_lc=fr&lc=fr&cc=fr`
    const rep = await f(url, { signal: controleur.signal, headers: { 'X-User-Agent': X_USER_AGENT } })
    if (rep.status === 404) return { statut: 'inconnu' }
    if (rep.status === 429 || rep.status === 503) return repli('limite')
    if (!rep.ok) return repli('hors-ligne')
    const json: unknown = await rep.json()
    const aliments = await db.aliments.toArray()
    const produit = analyserReponseOff(json, propre, aliments)
    if (!produit) return { statut: 'inconnu' }
    // On garde une correspondance choisie à la main auparavant.
    if (enCache?.alimentId && !produit.alimentId) produit.alimentId = enCache.alimentId
    await db.produits.put(produit)
    return { statut: 'trouve', produit, depuisCache: false }
  } catch {
    // Réseau coupé, timeout (AbortError), JSON invalide : traité comme hors ligne.
    return repli('hors-ligne')
  } finally {
    clearTimeout(minuteur)
  }
}

/** Produit par code-barres (cache local puis Open Food Facts). Inconnu ou hors ligne → null. */
export async function rechercherProduit(code: string): Promise<Produit | null> {
  const r = await rechercherProduitDetaille(code)
  return r.statut === 'trouve' ? r.produit : null
}

/** Enregistre un produit saisi à la main (produit inconnu d'OFF ou hors ligne). */
export async function enregistrerProduitManuel(code: string, nom: string, aliments: Aliment[]): Promise<Produit> {
  const produit: Produit = { codeBarres: code.replace(/\D/g, ''), nom: nom.trim(), source: 'manuel', majLe: new Date().toISOString() }
  const alimentId = correspondreAliment({ nom }, aliments)
  if (alimentId) produit.alimentId = alimentId
  await db.produits.put(produit)
  return produit
}

/** Pour les tests : vide la fenêtre de limite de débit. */
export function _reinitialiserQuota(): void {
  appels.length = 0
}
