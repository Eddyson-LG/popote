/**
 * Parseur de tickets de caisse (texte brut issu de l'OCR local).
 * Fonction pure : aucune dépendance au DOM ni à la base.
 *
 * Formats gérés (Lidl, Leclerc, Carrefour, Intermarché…) :
 * - « LIBELLE            1,29 A » (code TVA final facultatif) ;
 * - quantités : « LIBELLE x2   2,58 », « LIBELLE  2 x 1,29  2,58 », ou une ligne de détail
 *   « 2 x 1,29 » avant (Leclerc) ou après (Lidl) l'article ;
 * - pesées : « 0,875 kg x 1,74 EUR/kg » avant ou après l'article ;
 * - remises : « REMISE -0,50 », « 0,50- », rattachées à l'article qui précède ;
 * - total : « TOTAL », « A PAYER », « TOTAL A PAYER » (repli : montant CB / espèces) ;
 * - date JJ/MM/AAAA, JJ.MM.AA, JJ-MM-AAAA ; enseigne reconnue dans l'en-tête.
 */
import type { LigneTicket, TicketLu } from './types'

export function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** « 1,29 » / « 1.29 » / « 1 ,29 » → 1.29 */
export function lireNombre(s: string): number {
  return Number(s.replace(/\s/g, '').replace(',', '.'))
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Montant en fin de ligne, suivi éventuellement de « € », « EUR » et d'un code TVA (A, B, 1, *, T1…). */
const PRIX_FIN = /(-\s?)?(\d{1,4})\s?[,.]\s?(\d{2})\s?(-)?\s*(?:€|EUR|E)?\s*(?:[A-D]|\d{1,2}|\*{1,2}|T\d)?\s*$/i
/** Ligne de détail de quantité : « 2 x 1,29 » (+ total de ligne facultatif). */
const DETAIL_QTE = /^(\d{1,3})\s*[xX*]\s*(\d{1,4}\s?[,.]\s?\d{2})\s*(?:€|EUR)?(?:\s*(?:\/\s*U(?:N|NITE)?|PCE?S?))?(?:\s+(-?\d{1,4}\s?[,.]\s?\d{2}))?\s*(?:€|EUR)?\s*(?:[A-D]|\d|\*)?\s*$/i
/** Pesée : « 0,875 kg x 1,74 EUR/kg » (+ total de ligne facultatif). */
const PESEE = /(\d{1,3}\s?[,.]\s?\d{1,3})\s?KG\s*[xX*@]\s*(\d{1,4}\s?[,.]\s?\d{2})\s*(?:€|EUR|E)?\s*\/\s*KG(?:\s+(\d{1,4}\s?[,.]\s?\d{2}))?/i
/** Quantité dans le libellé, juste avant le prix : « … 2 x 1,29 » ou « … x2 ». */
const QTE_INLINE_PU = /\s(\d{1,3})\s?[xX*]\s?(\d{1,4}[,.]\d{2})\s*(?:€|EUR)?$/
/** « x2 », « x 6 », « * 3 » ; mais « X12 » collé en majuscules est un lot (OEUFS X12), pas une quantité. */
const QTE_INLINE = /\s(?:[X*]\s|x\s?)(\d{1,2})$/
const DATE = /(?<!\d)([0-3]?\d)\s?[/.-]\s?([01]?\d)\s?[/.-]\s?(\d{4}|\d{2})(?!\d)/

const MOT_TOTAL = /\b(TOTAL|A PAYER|NET A PAYER|MONTANT DU|A REGLER)\b/
const PAS_UN_TOTAL = /SOUS|TVA|\bHT\b|REMISE|ECONOMI|AVANTAGE|POINT|FIDEL|CAGNOTTE|ARTICLE|REDUC/
const MOT_PAIEMENT = /^(CB|C\.B\.?|CARTE (BANCAIRE|BLEUE|CB|VISA)|PAIEMENT|VISA|MASTERCARD|ESPECES|ESP|SANS CONTACT|TITRE RESTAURANT|TICKET RESTAURANT|REGLEMENT)\b/
/** Libellé d'une ligne de remise (le mot-clé est en tête, pour ne pas confondre avec « LAIT PROMO »). */
const MOT_REMISE = /^(REMISE|REDUC|BON\b|COUPON|AVANTAGE|LIDL PLUS|ECONOMIE|OFFRE|PROMO|RISTOURNE|CAGNOTTE)|-\s?\d{1,2}\s?%/
/** Lignes qui ne sont jamais des articles. */
const MOT_IGNORE = new RegExp(
  [
    '^EUR$', '^EUROS?$', 'SOUS[ -]?TOTAL', '\\bTVA\\b', '\\bHT\\b', '\\bTTC\\b', 'RENDU', 'MONNAIE', 'SIRET', 'SIREN', '\\bTEL\\b', 'TELEPHONE',
    'WWW\\.', 'HTTP', '\\bMERCI\\b', 'A BIENTOT', 'CAISSE', 'CAISSIER', 'CAISSIERE', 'TICKET', 'TRANSACTION', 'AUTORISATION', '\\bTERMINAL\\b',
    'ARTICLES?\\b', 'SOLDE', 'CUMUL', 'NUMERO', '\\bN°', '\\bMAGASIN\\b', 'HORAIRES', '\\bOUVERT', 'CONSERVEZ', 'ECHANGE', '\\bRCS\\b', '\\bNAF\\b', '\\bAPE\\b',
  ].join('|'),
)

const ENSEIGNES: [string, RegExp][] = [
  ['Leclerc', /\bE\s?\.?\s?LECLERC\b|\bLECLERC\b/],
  ['Lidl', /\bL[I1|]D[L1I|]\b/],
  ['Carrefour', /\bCARREFOUR\b/],
  ['Intermarché', /\bINTERMARCHE\b|\bITM\b/],
  ['Auchan', /\bAUCHAN\b/],
  ['Super U', /\b(SUPER|HYPER|MARCHE)\s?U\b|\bU\s?EXPRESS\b|\bSYSTEME\s?U\b|\bMAGASINS?\s?U\b/],
  ['Casino', /\bCASINO\b/],
  ['Monoprix', /\bMONOPRIX\b/],
  ['Franprix', /\bFRANPRIX\b/],
  ['Aldi', /\bALDI\b/],
  ['Netto', /\bNETTO\b/],
  ['Leader Price', /\bLEADER\s?PRICE\b/],
  ['Grand Frais', /\bGRAND\s?FRAIS\b/],
  ['Biocoop', /\bBIOCOOP\b/],
  ['Cora', /\bCORA\b/],
  ['Spar', /\bSPAR\b/],
  ['Picard', /\bPICARD\b/],
]

/** Enseigne canonique trouvée dans le texte (l'en-tête est prioritaire). */
export function detecterEnseigne(texte: string): string | undefined {
  const norm = sansAccents(texte).toUpperCase()
  const entete = norm.split('\n').slice(0, 10).join('\n')
  for (const zone of [entete, norm]) {
    for (const [nom, re] of ENSEIGNES) if (re.test(zone)) return nom
  }
  return undefined
}

/** Première date valide du texte, au format AAAA-MM-JJ. */
export function detecterDate(texte: string): string | undefined {
  for (const ligne of texte.split('\n')) {
    const iso = dateDeLigne(ligne)
    if (iso) return iso
  }
  return undefined
}

function dateDeLigne(ligne: string): string | undefined {
  const m = DATE.exec(ligne)
  if (!m) return undefined
  const j = Number(m[1])
  const mo = Number(m[2])
  const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (j < 1 || j > 31 || mo < 1 || mo > 12 || a < 2000 || a > 2099) return undefined
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`
}

/** Corrige les confusions OCR les plus courantes dans les nombres (O → 0). */
function corrigerChiffres(l: string): string {
  return l.replace(/(?<=\d[,.]?)[Oo]|[Oo](?=[,.]\d)/g, '0')
}

function nettoyerLibelle(s: string): string {
  return s
    .replace(/^\d{6,}\s+/, '') // code EAN en tête
    .replace(/[*#|_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, '')
}

const assezDeLettres = (s: string) => (s.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0) >= 2

/** Analyse le texte d'un ticket : enseigne, date, lignes d'articles et total. */
export function parserTicket(texte: string): TicketLu {
  const lignes: LigneTicket[] = []
  let total: number | undefined
  let totalPaiement: number | undefined
  let attenteTotal = false
  let fin = false
  /** Libellé d'une ligne sans prix, en attente d'une ligne de détail (Leclerc, Carrefour). */
  let enAttente: string | undefined
  /** Dernier article, tant qu'aucune autre ligne ne s'est intercalée (pour les détails Lidl). */
  let dernier: LigneTicket | undefined

  for (const brute of texte.split(/\r?\n/)) {
    const ligne = corrigerChiffres(brute.normalize('NFC').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim())
    const norm = sansAccents(ligne).toUpperCase()
    if (!ligne || /^[-=_*.\s]+$/.test(ligne)) {
      enAttente = undefined
      continue
    }
    const prixFin = PRIX_FIN.exec(norm)
    const montant = prixFin ? arrondi(lireNombre(`${prixFin[2]}.${prixFin[3]}`)) * (prixFin[1] || prixFin[4] ? -1 : 1) : undefined

    if (attenteTotal) {
      attenteTotal = false
      if (montant !== undefined && !assezDeLettres(norm.slice(0, prixFin!.index))) {
        total = Math.abs(montant)
        fin = true
        continue
      }
    }

    // Une ligne de date (souvent avec l'heure) n'est jamais un article.
    if (dateDeLigne(ligne)) {
      enAttente = dernier = undefined
      continue
    }

    if (MOT_TOTAL.test(norm) && !PAS_UN_TOTAL.test(norm)) {
      if (montant !== undefined) {
        // « A PAYER » l'emporte sur un « TOTAL » vu plus tôt.
        if (total === undefined || /PAYER|REGLER/.test(norm)) total = Math.abs(montant)
        fin = true
      } else attenteTotal = true
      enAttente = dernier = undefined
      continue
    }

    if (MOT_PAIEMENT.test(norm)) {
      if (montant !== undefined && totalPaiement === undefined) totalPaiement = Math.abs(montant)
      fin = true
      continue
    }
    if (fin) continue
    if (MOT_IGNORE.test(norm)) {
      enAttente = dernier = undefined
      continue
    }

    // Pesée : « 0,875 kg x 1,74 EUR/kg [1,52] »
    const pesee = PESEE.exec(norm)
    if (pesee) {
      const poidsKg = lireNombre(pesee[1])
      const prixAuKg = lireNombre(pesee[2])
      const avant = nettoyerLibelle(ligne.slice(0, pesee.index))
      const totalLigne = pesee[3] ? lireNombre(pesee[3]) : undefined
      if (assezDeLettres(avant)) {
        // Tout sur une ligne : « COURGETTE 0,412 kg x 2,49 €/kg 1,03 »
        dernier = { libelle: avant, prix: totalLigne ?? arrondi(poidsKg * prixAuKg), poidsKg, prixAuKg }
        lignes.push(dernier)
        enAttente = undefined
      } else if (enAttente) {
        dernier = { libelle: enAttente, prix: totalLigne ?? arrondi(poidsKg * prixAuKg), poidsKg, prixAuKg }
        lignes.push(dernier)
        enAttente = undefined
      } else if (dernier && dernier.poidsKg === undefined) {
        dernier.poidsKg = poidsKg
        dernier.prixAuKg = prixAuKg
        dernier = undefined
      }
      continue
    }

    // Détail de quantité : « 2 x 1,29 [2,58] »
    const detail = DETAIL_QTE.exec(norm)
    if (detail) {
      const n = Number(detail[1])
      const pu = lireNombre(detail[2])
      const totalLigne = detail[3] ? lireNombre(detail[3]) : undefined
      if (enAttente) {
        dernier = { libelle: enAttente, prix: totalLigne ?? arrondi(n * pu), quantite: n }
        lignes.push(dernier)
        enAttente = undefined
      } else if (dernier && dernier.quantite === undefined) {
        dernier.quantite = n
        dernier = undefined
      }
      continue
    }

    if (montant === undefined) {
      // Ligne sans prix : peut-être le libellé d'un article détaillé à la ligne suivante.
      const lib = nettoyerLibelle(ligne)
      enAttente = assezDeLettres(lib) ? lib : undefined
      dernier = undefined
      continue
    }

    let libelle = nettoyerLibelle(ligne.slice(0, prixFin!.index))
    if (!assezDeLettres(libelle)) {
      // Prix seul sur sa ligne : il complète le libellé en attente.
      if (!enAttente) continue
      libelle = enAttente
    }
    enAttente = undefined

    if (montant < 0 || MOT_REMISE.test(sansAccents(libelle).toUpperCase())) {
      const r = Math.abs(montant)
      if (dernier && dernier.prix > 0) {
        dernier.prix = arrondi(dernier.prix - r)
        dernier.remise = arrondi((dernier.remise ?? 0) + r)
      } else lignes.push({ libelle, prix: -r })
      dernier = undefined
      continue
    }

    const article: LigneTicket = { libelle, prix: montant }
    const pu = QTE_INLINE_PU.exec(libelle)
    const qx = pu ? null : QTE_INLINE.exec(libelle)
    if (pu) {
      article.quantite = Number(pu[1])
      article.libelle = nettoyerLibelle(libelle.slice(0, pu.index))
    } else if (qx) {
      article.quantite = Number(qx[1])
      article.libelle = nettoyerLibelle(libelle.slice(0, qx.index))
    }
    lignes.push(article)
    dernier = article
  }

  return {
    enseigne: detecterEnseigne(texte),
    date: detecterDate(texte),
    lignes,
    total: total ?? totalPaiement,
  }
}
