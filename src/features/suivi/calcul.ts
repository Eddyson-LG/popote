/**
 * Calculs du suivi des économies (fonctions pures, testées). Aucun chiffre nutritionnel.
 */
import type { Depense, Repas, RepasDehors } from '@/types'
import { isoJour, lundiDe, semaineActive } from '@/lib/dates'

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
  // Une course faite le dimanche compte pour la semaine qu'elle prépare (même règle que le planning).
  const active = semaineActive(maintenant)
  const debutMois = isoJour(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1))
  const jour = (iso: string) => iso.slice(0, 10)
  const semaine = (iso: string) => semaineActive(new Date(iso)) === active
  const mois = (iso: string) => jour(iso) >= debutMois

  const somme = <T,>(t: T[], f: (x: T) => number) => t.reduce((s, x) => s + f(x), 0)
  // Repas maison = repas planifiés marqués cuisinés ce mois (déjeuners, dîners, gamelles).
  const maison = ctx.repas.filter((r) => r.cuisine && r.cuisineLe && mois(r.cuisineLe) && ['dejeuner', 'diner', 'gamelle'].includes(r.type))
  const economie = somme(maison, (r) => Math.max(0, ctx.prixRepasDehors - ctx.coutPortion(r.recetteId)))

  return {
    depenseSemaine: r2(somme(ctx.depenses.filter((d) => semaine(d.date)), (d) => d.montant)),
    depenseMois: r2(somme(ctx.depenses.filter((d) => mois(d.date)), (d) => d.montant)),
    // Un repas pris dehors compte pour la semaine civile où il a été mangé.
    dehorsSemaine: r2(somme(ctx.dehors.filter((d) => lundiDe(new Date(d.date)) === lundiDe(maintenant)), (d) => d.montant)),
    dehorsMois: r2(somme(ctx.dehors.filter((d) => mois(d.date)), (d) => d.montant)),
    gamellesMois: maison.filter((r) => r.type === 'gamelle').length,
    repasMaisonMois: maison.length,
    economieMois: r2(economie),
  }
}

/** Message motivant, ton de pote, jamais moralisateur. */
export function messageMotivant(b: Bilan, prixRepasDehors: number): string {
  void prixRepasDehors
  const euros = Math.round(b.economieMois)
  if (b.gamellesMois > 0) return `${b.repasMaisonMois} repas maison ce mois, dont ${b.gamellesMois} gamelle${b.gamellesMois > 1 ? 's' : ''} = ${euros} € économisés 🔥`
  if (b.repasMaisonMois > 0) return `${b.repasMaisonMois} repas maison ce mois, ${euros} € gardés dans ta poche 💪`
  return 'Ta première gamelle t’attend. 5 balles d’économisées à la clé 🔥'
}
