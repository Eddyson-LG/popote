/**
 * Données de démo, chargeables en un bouton pour tester sans tout remplir :
 * goûts, stock (dont des produits qui périment), prix constatés dans 3 magasins,
 * promos, dépenses, repas dehors, puis planning + liste de la semaine.
 */
import type { Gout, PrixObservation, Verdict } from '@/types'
import { db } from './db'
import { ajouterJours, isoJour } from './dates'
import { calculerScore } from './scoring'
import { reinitialiser } from './seed'
import { planifierSemaine } from './contexte'

const GOUTS: [string, Verdict][] = [
  ['poulet-filet', 'adore'], ['riz-basmati', 'adore'], ['oeuf', 'aime'], ['banane', 'adore'], ['pates', 'aime'],
  ['lentilles-corail', 'aime'], ['pois-chiches-boite', 'aime'], ['carotte', 'aime'], ['courgette', 'aime'], ['tomate', 'aime'],
  ['thon-boite', 'aime'], ['poivron-rouge', 'aime'], ['tofu', 'pas-souvent'], ['aubergine', 'pas-aime'], ['chou-fleur', 'pas-aime'],
  ['betterave-cuite', 'jamais'], ['endive', 'jamais'], ['sardine-boite', 'pas-souvent'],
]

/** Écart de prix par magasin, pour que le comparateur ait de quoi comparer. */
const FACTEUR: Record<string, number> = { lidl: 0.9, leclerc: 0.97, carrefour: 1.08 }

export async function chargerDemo(): Promise<void> {
  await reinitialiser()
  const maintenant = new Date().toISOString()
  const aujourdhui = isoJour()
  const aliments = await db.aliments.toArray()
  const parId = new Map(aliments.map((a) => [a.id, a]))
  const { default: prixRef } = await import('@/data/prix-reference.json')

  await db.reglages.update('moi', { onboardingFait: true })
  await db.magasins.bulkPut([
    { id: 'lidl', enseigne: 'Lidl', ville: 'Le Luc', actif: true },
    { id: 'leclerc', enseigne: 'Leclerc', ville: 'Draguignan', actif: true },
    { id: 'carrefour', enseigne: 'Carrefour', ville: 'Les Arcs', actif: true },
  ])

  await db.gouts.bulkPut(
    GOUTS.map(([id, verdict]): Gout => {
      const g: Gout = { id: `aliment:${id}`, cible: 'aliment', refId: id, verdict, achats: 0, score: 0, majLe: maintenant }
      return { ...g, score: calculerScore(g) }
    }),
  )

  const stock = [
    ['huile-olive', 'placard'], ['sel', 'placard'], ['poivre', 'placard'], ['cumin', 'placard'], ['sauce-soja', 'placard'],
    ['riz-blanc', 'placard'], ['oeuf', 'frigo', 1], ['tomate', 'frigo', 2], ['courgette', 'frigo', 5], ['epinards-surgeles', 'congelateur'],
  ] as const
  await db.stock.bulkAdd(
    stock.flatMap(([id, emplacement, jours]) => {
      const a = parId.get(id)
      return a ? [{ alimentId: id, nom: a.nom, quantite: a.formatVente.quantite, unite: a.uniteBase, emplacement, peremption: jours !== undefined ? ajouterJours(aujourdhui, jours) : undefined, ajouteLe: maintenant }] : []
    }),
  )

  // Prix « constatés » (comme après des tickets) pour une vingtaine d'aliments, dans 3 magasins.
  const obs: PrixObservation[] = []
  for (const p of prixRef.prix.slice(0, 80)) {
    const a = parId.get(p.alimentId)
    if (!a || ['epice-herbe', 'condiment'].includes(a.categorie)) continue
    for (const [magasinId, f] of Object.entries(FACTEUR)) {
      const parBase = p.unitePrix === 'piece' ? p.prixUnitaire : p.prixUnitaire / 1000
      obs.push({
        cle: a.id, alimentId: a.id, magasinId, prix: Math.round(parBase * a.formatVente.quantite * f * 100) / 100, quantite: a.formatVente.quantite,
        unite: a.uniteBase, source: 'ticket', date: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      })
    }
  }
  await db.prix.bulkAdd(obs)

  await db.promos.bulkAdd([
    { magasinId: 'lidl', alimentId: 'poulet-filet', libelle: 'Filet de poulet', prix: 3.49, prixNormal: 4.99, fin: ajouterJours(aujourdhui, 4), ajouteLe: maintenant },
    { magasinId: 'leclerc', alimentId: 'banane', libelle: 'Bananes', prix: 0.15, prixNormal: 0.25, fin: ajouterJours(aujourdhui, 2), ajouteLe: maintenant },
  ])
  await db.depenses.bulkAdd([
    { date: new Date(Date.now() - 9 * 86_400_000).toISOString(), montant: 41.2, magasinId: 'lidl', origine: 'ticket' },
    { date: new Date(Date.now() - 2 * 86_400_000).toISOString(), montant: 12.6, magasinId: 'leclerc', origine: 'liste' },
  ])
  await db.repasDehors.add({ date: new Date(Date.now() - 3 * 86_400_000).toISOString(), montant: 6.5, type: 'sandwich' })

  await planifierSemaine()
}
