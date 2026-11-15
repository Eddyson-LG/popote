/**
 * Chargement du contexte métier depuis la base locale, et actions centrales :
 * goûts → planning → liste. Les écrans appellent ces fonctions, jamais la logique pure directement.
 */
import prixRef from '@/data/prix-reference.json'
import type { Aliment, CibleGout, FichierPrixReference, Gout, ListeCourses, PrixAffiche, Repas, Verdict } from '@/types'
import { db } from './db'
import { ajouterJours, isoJour, jourDe, lundiDe, semaineActive } from './dates'
import { cout, meilleurPrix, type ResolveurPrix } from './prix'
import { calculerScore, cleGout, type CarteGouts } from './scoring'
import { respecterBudget } from '@/features/recettes/budget'
import { autreIdee, genererPlanning, graine, normaliserRestes, type ContextePlanning } from '@/features/recettes/planning'
import { genererListe, totaux } from '@/features/liste/generer'

const REF = prixRef as FichierPrixReference
const REF_PAR_ID = new Map(REF.prix.map((p) => [p.alimentId, p]))

/** Prix estimé (table de référence), toujours disponible. */
export function prixEstime(alimentId: string): PrixAffiche | null {
  const p = REF_PAR_ID.get(alimentId)
  return p ? { prixUnitaire: p.prixUnitaire, unitePrix: p.unitePrix, source: 'estimation', date: REF.dateReference, estime: true } : null
}

/**
 * Construit un résolveur de prix synchrone à partir de tout ce que la base connaît :
 * promos en cours, prix constatés (tickets, saisies, listes, Open Prices) et estimation.
 */
export async function chargerResolveurPrix(): Promise<ResolveurPrix> {
  const [obs, promos, aliments] = await Promise.all([db.prix.toArray(), db.promos.toArray(), db.aliments.toArray()])
  const parAliment = new Map(aliments.map((a) => [a.id, a]))
  const aujourdhui = isoJour()
  const candidats = new Map<string, PrixAffiche[]>()
  const ajouter = (cle: string, p: PrixAffiche) => candidats.set(cle, [...(candidats.get(cle) ?? []), p])

  for (const o of obs) {
    if (!o.alimentId) continue
    const a = parAliment.get(o.alimentId)
    if (!a || o.quantite <= 0) continue
    const p = versPrixAffiche(o.prix, o.quantite, o.unite, a)
    if (!p) continue
    const national = o.portee === 'national'
    const affiche: PrixAffiche = { ...p, source: o.source, date: o.date, magasinId: o.magasinId, estime: national, detail: national ? 'médiane France' : undefined }
    ajouter(o.alimentId, affiche)
    if (o.magasinId) ajouter(`${o.alimentId}@${o.magasinId}`, affiche)
  }
  for (const pr of promos) {
    if (!pr.alimentId || pr.fin < aujourdhui) continue
    const a = parAliment.get(pr.alimentId)
    if (!a) continue
    const ref = prixEstime(a.id)
    // Une promo saisie est un prix pour un conditionnement : on la ramène à l'unité de prix.
    const p = versPrixAffiche(pr.prix, a.formatVente.quantite, a.uniteBase, a)
    if (!p || !ref) continue
    const affiche: PrixAffiche = { ...p, source: 'promo', date: pr.ajouteLe, magasinId: pr.magasinId, estime: false }
    ajouter(`${a.id}@${pr.magasinId}`, affiche)
    // « Tous magasins » : la promo compte aussi (on ira la chercher là-bas).
    ajouter(a.id, affiche)
  }

  return (alimentId, magasinId) => {
    const local = magasinId ? candidats.get(`${alimentId}@${magasinId}`) ?? [] : []
    const global = (candidats.get(alimentId) ?? []).filter((p) => !magasinId || !p.magasinId || p.magasinId === magasinId || local.length === 0)
    return meilleurPrix([...local, ...global, prixEstime(alimentId)])
  }
}

/** Convertit « X € pour Q unités de base » en prix €/kg, €/L ou €/pièce. */
export function versPrixAffiche(
  prix: number,
  quantite: number,
  unite: Aliment['uniteBase'],
  aliment: Aliment,
): Pick<PrixAffiche, 'prixUnitaire' | 'unitePrix'> | null {
  if (quantite <= 0 || prix <= 0) return null
  if (unite === 'g') return { prixUnitaire: (prix / quantite) * 1000, unitePrix: 'kg' }
  if (unite === 'ml') return { prixUnitaire: (prix / quantite) * 1000, unitePrix: 'l' }
  if (aliment.uniteBase === 'piece') return { prixUnitaire: prix / quantite, unitePrix: 'piece' }
  return null
}

export async function chargerGouts(): Promise<CarteGouts> {
  const gouts = await db.gouts.toArray()
  return new Map(gouts.map((g) => [g.id, g]))
}

/** Enregistre un swipe ou une note et recalcule le score. */
export async function enregistrerGout(
  cible: CibleGout,
  refId: string,
  changement: { verdict?: Verdict | null; note?: Gout['note']; achat?: boolean },
): Promise<Gout> {
  const id = cleGout(cible, refId)
  const existant = await db.gouts.get(id)
  const g: Gout = existant ?? { id, cible, refId, achats: 0, score: 0, majLe: '' }
  if (changement.verdict !== undefined) g.verdict = changement.verdict ?? undefined
  if (changement.note !== undefined) g.note = changement.note
  if (changement.achat) g.achats += 1
  g.score = calculerScore(g)
  g.majLe = new Date().toISOString()
  await db.gouts.put(g)
  return g
}

async function contextePlanning(semaine: string, aleatoire: () => number): Promise<ContextePlanning> {
  const [recettes, aliments, gouts, reglages, stock, existants, prix, promos, precedents] = await Promise.all([
    db.recettes.toArray(),
    db.aliments.toArray(),
    chargerGouts(),
    db.reglages.get('moi'),
    db.stock.toArray(),
    db.repas.where('semaine').equals(semaine).toArray(),
    chargerResolveurPrix(),
    db.promos.where('fin').aboveOrEqual(isoJour()).toArray(),
    db.repas.where('semaine').anyOf(ajouterJours(semaine, -7), ajouterJours(semaine, -14)).toArray(),
  ])
  if (!reglages) throw new Error('Réglages absents')
  return {
    semaine,
    recettes,
    alimentsParId: new Map(aliments.map((a) => [a.id, a])),
    gouts,
    reglages,
    stock,
    prix,
    promos: new Set(promos.map((p) => p.alimentId).filter(Boolean) as string[]),
    existants,
    recentes: new Set(precedents.map((r) => r.recetteId)),
    aleatoire,
    // Semaine en cours : on ne planifie pas les jours déjà passés.
    jourDebut: semaine === lundiDe() ? jourDe() : 0,
  }
}

/**
 * Génère le planning de la semaine, puis vérifie le budget : tant que la liste dépasse,
 * on remplace le plat le plus cher par une alternative (au plus 12 essais).
 */
export interface OptionsPlanning {
  tempsMax?: number
  preferer?: string[]
  eviter?: string[]
  budgetDelta?: number
}

export async function planifierSemaine(semaine = semaineActive(), seed = Date.now(), options: OptionsPlanning = {}): Promise<Repas[]> {
  const aleatoire = graine(seed)
  const base = await contextePlanning(semaine, aleatoire)
  const ctx: ContextePlanning = {
    ...base,
    reglages: { ...base.reglages, tempsMaxMinutes: options.tempsMax ? Math.min(options.tempsMax, base.reglages.tempsMaxMinutes) : base.reglages.tempsMaxMinutes },
    preferences: { tags: options.preferer ?? [], eviter: options.eviter ?? [] },
  }
  const generes = normaliserRestes(genererPlanning(ctx))

  const recettes = new Map(ctx.recettes.map((r) => [r.id, r]))
  const budget = Math.max(15, ctx.reglages.budgetHebdo + (options.budgetDelta ?? 0))
  const achats = await db.achats.toArray()
  // Budget = ce que coûte vraiment la course (placard compris), moins ce qui est déjà payé cette semaine.
  const dejaPaye = await depenseValideeSemaine(semaine)
  const totalDe = (p: Repas[]) =>
    totaux(genererListe({ repas: aVenir(p, semaine), recettes, alimentsParId: ctx.alimentsParId, stock: ctx.stock, achats, prix: ctx.prix, gouts: ctx.gouts, reglages: ctx.reglages })).total
  const { plan } = respecterBudget(generes, ctx, Math.max(0, budget - dejaPaye), totalDe)

  await db.transaction('rw', db.repas, async () => {
    await db.repas.where('semaine').equals(semaine).delete()
    await db.repas.bulkPut(plan)
  })
  await regenererListe(semaine)
  return plan
}

/** Repas qui restent à faire : en semaine en cours, on ignore les jours passés. */
export function aVenir(repas: Repas[], semaine: string): Repas[] {
  if (semaine !== lundiDe()) return repas
  const j = jourDe()
  return repas.filter((r) => r.jour >= j)
}

/** Courses déjà payées pour une semaine (listes validées et tickets), rattachées par semaineActive(date). */
export async function depenseValideeSemaine(semaine: string): Promise<number> {
  const depenses = await db.depenses.where('date').aboveOrEqual(ajouterJours(semaine, -2)).toArray()
  return Math.round(depenses.filter((d) => semaineActive(new Date(d.date)) === semaine).reduce((s, d) => s + d.montant, 0) * 100) / 100
}

/** Remplace un repas par une autre idée (et remet les restes d'aplomb). */
export async function changerRepas(repas: Repas): Promise<void> {
  const ctx = await contextePlanning(repas.semaine, graine(Date.now()))
  const plan = await db.repas.where('semaine').equals(repas.semaine).toArray()
  const alt = autreIdee(ctx, plan, repas)
  if (!alt) return
  const nouveau = normaliserRestes(plan.map((r) => (r.id === alt.id ? alt : r)))
  await db.repas.bulkPut(nouveau)
  await regenererListe(repas.semaine)
}

/** Met une recette précise sur un créneau (choix manuel). */
export async function choisirRecette(repas: Repas, recetteId: string): Promise<void> {
  const plan = await db.repas.where('semaine').equals(repas.semaine).toArray()
  const nouveau = normaliserRestes(plan.map((r) => (r.id === repas.id ? { ...r, recetteId, restes: false } : r)))
  await db.repas.bulkPut(nouveau)
  await regenererListe(repas.semaine)
}

/**
 * Recalcule la liste de la semaine en conservant ce qui a déjà été coché,
 * les prix payés et les articles ajoutés à la main.
 */
export async function regenererListe(semaine = semaineActive(), magasinId?: string): Promise<ListeCourses> {
  const [repas, recettes, aliments, stock, achats, prix, gouts, reglages, existante] = await Promise.all([
    db.repas.where('semaine').equals(semaine).toArray(),
    db.recettes.toArray(),
    db.aliments.toArray(),
    db.stock.toArray(),
    db.achats.toArray(),
    chargerResolveurPrix(),
    chargerGouts(),
    db.reglages.get('moi'),
    db.listes.get(semaine),
  ])
  if (!reglages) throw new Error('Réglages absents')
  const magasin = magasinId ?? existante?.magasinId
  const items = genererListe({
    repas: aVenir(repas, semaine),
    recettes: new Map(recettes.map((r) => [r.id, r])),
    alimentsParId: new Map(aliments.map((a) => [a.id, a])),
    stock,
    achats,
    prix,
    gouts,
    reglages,
    magasinId: magasin,
    substitutions: existante?.substitutions,
  })
  const anciens = new Map((existante?.items ?? []).map((i) => [i.id, i]))
  const fusion = items.map((i) => {
    const a = anciens.get(i.id)
    return a ? { ...i, coche: a.coche, prixPaye: a.prixPaye } : i
  })
  const manuels = (existante?.items ?? []).filter((i) => i.raison === 'manuel' && !fusion.some((f) => f.id === i.id))
  const maintenant = new Date().toISOString()
  const liste: ListeCourses = {
    id: semaine,
    creeLe: existante?.creeLe ?? maintenant,
    majLe: maintenant,
    items: [...fusion, ...manuels],
    magasinId: magasin,
    validee: existante?.validee ?? false,
    substitutions: existante?.substitutions,
  }
  await db.listes.put(liste)
  return liste
}

/** Marque un repas comme cuisiné : décrémente le stock des ingrédients utilisés. */
export async function marquerCuisine(repas: Repas, cuisine = true): Promise<void> {
  const rec = await db.recettes.get(repas.recetteId)
  await db.transaction('rw', db.repas, db.stock, async () => {
    await db.repas.update(repas.id, { cuisine, cuisineLe: cuisine ? new Date().toISOString() : undefined })
    // Les restes ne consomment rien : c'est la préparation d'origine qui a tout utilisé.
    if (!cuisine || !rec || repas.restes) return
    const facteur = repas.portions / rec.portions
    for (const ing of rec.ingredients) {
      let besoin = ing.quantite * facteur
      const lignes = (await db.stock.where('alimentId').equals(ing.alimentId).toArray())
        .filter((s) => s.unite === ing.unite)
        .sort((a, b) => (a.peremption ?? '9999').localeCompare(b.peremption ?? '9999'))
      for (const l of lignes) {
        if (besoin <= 0) break
        const pris = Math.min(l.quantite, besoin)
        besoin -= pris
        if (l.quantite - pris <= 0.001) await db.stock.delete(l.id!)
        else await db.stock.update(l.id!, { quantite: l.quantite - pris })
      }
    }
  })
}

export async function verrouillerRepas(repas: Repas, verrouille: boolean): Promise<void> {
  await db.repas.update(repas.id, { verrouille })
}

/** Remplace un article par un autre aliment moins cher, et recalcule la liste. */
export async function substituer(semaine: string, de: string, vers: string): Promise<void> {
  const l = await db.listes.get(semaine)
  if (!l) return
  await db.listes.update(semaine, { substitutions: { ...(l.substitutions ?? {}), [de]: vers } })
  await regenererListe(semaine)
}

/** Ajoute un article à la main. */
export async function ajouterArticle(semaine: string, alimentId: string): Promise<void> {
  const [l, a] = await Promise.all([db.listes.get(semaine), db.aliments.get(alimentId)])
  if (!l || !a) return
  if (l.items.some((i) => i.id === a.id)) return
  const resolveur = await chargerResolveurPrix()
  const p = resolveur(a.id, l.magasinId)
  await db.listes.update(semaine, {
    items: [
      ...l.items,
      {
        id: a.id, alimentId: a.id, nom: a.nom, emoji: a.emoji, rayon: a.rayon, quantiteBesoin: a.formatVente.quantite, unite: a.uniteBase,
        nbFormats: 1, libelleFormat: a.formatVente.libelle, prixEstime: Math.round(cout(a.formatVente.quantite, a, p) * 100) / 100,
        sourcePrix: p?.source ?? 'estimation', datePrix: p?.date ?? new Date(0).toISOString(), magasinId: l.magasinId, raison: 'manuel', coche: false,
      },
    ],
  })
}

export async function majArticle(semaine: string, id: string, changement: Partial<import('@/types').ItemListe>): Promise<void> {
  const l = await db.listes.get(semaine)
  if (!l) return
  await db.listes.update(semaine, { items: l.items.map((i) => (i.id === id ? { ...i, ...changement } : i)), majLe: new Date().toISOString() })
}

/**
 * Valide les courses : les articles cochés partent dans le stock, les achats et les prix payés
 * alimentent l'historique et les goûts, et la dépense est enregistrée.
 */
export async function validerCourses(semaine: string): Promise<{ montant: number; articles: number }> {
  const l = await db.listes.get(semaine)
  if (!l) return { montant: 0, articles: 0 }
  const coches = l.items.filter((i) => i.coche)
  const maintenant = new Date().toISOString()
  const aliments = new Map((await db.aliments.bulkGet(coches.map((i) => i.alimentId ?? ''))).filter(Boolean).map((a) => [a!.id, a!]))
  let montant = 0
  await db.transaction('rw', [db.stock, db.achats, db.prix, db.depenses, db.listes, db.gouts], async () => {
    for (const i of coches) {
      const a = i.alimentId ? aliments.get(i.alimentId) : undefined
      const q = a ? i.nbFormats * a.formatVente.quantite : i.quantiteBesoin
      const paye = i.prixPaye ?? i.prixEstime
      montant += paye
      await db.stock.add({
        alimentId: i.alimentId, codeBarres: i.codeBarres, nom: i.nom, quantite: q, unite: i.unite,
        emplacement: a?.rayon === 'surgeles' ? 'congelateur' : a && ['frais', 'boucherie-poisson'].includes(a.rayon) ? 'frigo' : a?.categorie === 'legume' ? 'frigo' : 'placard',
        peremption: a?.conservationJours ? ajouterJours(isoJour(), a.conservationJours) : undefined,
        ajouteLe: maintenant,
      })
      await db.achats.add({ alimentId: i.alimentId, codeBarres: i.codeBarres, date: maintenant, quantite: q, unite: i.unite, prix: i.prixPaye, magasinId: l.magasinId })
      if (i.prixPaye && i.alimentId)
        await db.prix.add({ cle: i.alimentId, alimentId: i.alimentId, magasinId: l.magasinId, prix: i.prixPaye, quantite: q, unite: i.unite, source: 'liste', date: maintenant })
    }
    await db.depenses.add({ date: maintenant, montant: Math.round(montant * 100) / 100, magasinId: l.magasinId, origine: 'liste' })
    await db.listes.update(semaine, { validee: true, items: l.items.filter((i) => !i.coche) })
  })
  for (const i of coches) if (i.alimentId) await enregistrerGout('aliment', i.alimentId, { achat: true })
  return { montant: Math.round(montant * 100) / 100, articles: coches.length }
}

/** « J'en ai déjà » : un article de placard part dans le stock et sort de la liste. */
export async function jEnAiDeja(semaine: string, item: import('@/types').ItemListe): Promise<void> {
  const a = item.alimentId ? await db.aliments.get(item.alimentId) : undefined
  await db.stock.add({
    alimentId: item.alimentId,
    nom: item.nom,
    quantite: a ? a.formatVente.quantite : item.quantiteBesoin,
    unite: item.unite,
    emplacement: 'placard',
    ajouteLe: new Date().toISOString(),
  })
  await regenererListe(semaine)
}
