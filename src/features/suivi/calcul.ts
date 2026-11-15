/**
 * Calculs du suivi des économies (fonctions pures, testées). Aucun chiffre nutritionnel.
 */
import type { Depense, Repas, RepasDehors } from '@/types'
import { ajouterJours, isoJour, lundiDe } from '@/lib/dates'

export interface Bilan {
  depenseSemaine: number
  depenseMois: number
  dehorsSemaine: number
  dehorsMois: number
  /** Gamelles et repas faits maison ce mois (hors restes comptés une fois chacun). */
  gamellesMois: number
  repasMaisonMois: number
  /** Économie estimée vs acheter dehors : (prix d'un repas dehors − coût maison) × repas maison. */
  economieMois: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function bilan(
  ctx: { depenses: Depense[]; dehors: RepasDehors[]; repas: Repas[]; coutPortion: (recetteId: string) => number; prixRepasDehors: number },
  maintenant = new Date(),
): Bilan {
  const lundi = lundiDe(maintenant)
  const debutMois = isoJour(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1))
  const jour = (iso: string) => iso.slice(0, 10)
  const semaine = (iso: string) => jour(iso) >= lundi && jour(iso) < ajouterJours(lundi, 7)
  const mois = (iso: string) => jour(iso) >= debutMois

  const somme = <T,>(t: T[], f: (x: T) => number) => t.reduce((s, x) => s + f(x), 0)
  // Repas maison = repas planifiés marqués cuisinés ce mois (déjeuners, dîners, gamelles).
  const maison = ctx.repas.filter((r) => r.cuisine && r.cuisineLe && mois(r.cuisineLe) && ['dejeuner', 'diner', 'gamelle'].includes(r.type))
  const economie = somme(maison, (r) => Math.max(0, ctx.prixRepasDehors - ctx.coutPortion(r.recetteId)))

  return {
    depenseSemaine: r2(somme(ctx.depenses.filter((d) => semaine(d.date)), (d) => d.montant)),
    depenseMois: r2(somme(ctx.depenses.filter((d) => mois(d.date)), (d) => d.montant)),
    dehorsSemaine: r2(somme(ctx.dehors.filter((d) => semaine(d.date)), (d) => d.montant)),
    dehorsMois: r2(somme(ctx.dehors.filter((d) => mois(d.date)), (d) => d.montant)),
    gamellesMois: maison.filter((r) => r.type === 'gamelle').length,
    repasMaisonMois: maison.length,
    economieMois: r2(economie),
  }
}

/** Message motivant, ton de pote, jamais moralisateur. */
export function messageMotivant(b: Bilan, prixRepasDehors: number): string {
  if (b.gamellesMois > 0)
    return `${b.gamellesMois} gamelle${b.gamellesMois > 1 ? 's' : ''} ce mois = ${Math.round(b.gamellesMois * prixRepasDehors)} € de sandwichs évités 🔥`
  if (b.repasMaisonMois > 0) return `${b.repasMaisonMois} repas maison ce mois, ${Math.round(b.economieMois)} € gardés dans ta poche 💪`
  return 'Ta première gamelle t’attend. 5 balles d’économisées à la clé 🔥'
}
