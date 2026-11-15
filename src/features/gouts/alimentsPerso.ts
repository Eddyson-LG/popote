/**
 * Aliments ajoutés par l'utilisateur : création (fonction pure, testée) et enregistrement.
 * Un aliment perso peut être un coup de cœur, un aliment banni, ou juste disponible
 * pour la liste, le stock et les recettes générées par l'IA.
 */
import type { Aliment, CategorieAliment, Rayon, Unite, Verdict } from '@/types'
import { db } from '@/lib/db'
import { enregistrerGout, regenererListe } from '@/lib/contexte'

export interface SaisieAliment {
  nom: string
  emoji?: string
  categorie: CategorieAliment
  rayon: Rayon
  uniteBase: Unite
  /** Quantité du conditionnement habituel, dans l'unité choisie. */
  quantiteFormat: number
  /** Prix indicatif pour ce conditionnement (facultatif). */
  prixFormat?: number
  verdict?: Extract<Verdict, 'adore' | 'jamais'>
}

const sansAccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const slug = (s: string) => sansAccent(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'aliment'

/** Libellé du format : « paquet de 500 g », « bouteille de 1 L », « lot de 4 ». */
export function libelleFormat(q: number, u: Unite): string {
  if (u === 'piece') return q === 1 ? 'la pièce' : `lot de ${q}`
  if (u === 'g') return q >= 1000 ? `paquet de ${(q / 1000).toLocaleString('fr-FR')} kg` : `paquet de ${q} g`
  return q >= 1000 ? `bouteille de ${(q / 1000).toLocaleString('fr-FR')} L` : `bouteille de ${q} ml`
}

/** Crée l'aliment, avec un identifiant unique « perso-… ». Renvoie null si le nom existe déjà. */
export function creerAlimentPerso(s: SaisieAliment, existants: Aliment[]): Aliment | null {
  const nom = s.nom.trim().replace(/\s+/g, ' ')
  if (nom.length < 2 || !(s.quantiteFormat > 0)) return null
  if (existants.some((a) => sansAccent(a.nom) === sansAccent(nom))) return null
  const base = `perso-${slug(nom)}`
  let id = base
  for (let n = 2; existants.some((a) => a.id === id); n++) id = `${base}-${n}`
  return {
    id,
    nom: nom[0].toUpperCase() + nom.slice(1),
    emoji: s.emoji?.trim() ? [...s.emoji.trim()][0] : '🍽️',
    categorie: s.categorie,
    rayon: s.rayon,
    uniteBase: s.uniteBase,
    formatVente: { quantite: s.quantiteFormat, libelle: libelleFormat(s.quantiteFormat, s.uniteBase) },
    saisons: [],
    tags: [],
    synonymes: [sansAccent(nom)],
    perso: true,
  }
}

/** Enregistre l'aliment, son prix indicatif éventuel et ton avis. */
export async function ajouterAlimentPerso(s: SaisieAliment): Promise<Aliment | null> {
  const a = creerAlimentPerso(s, await db.aliments.toArray())
  if (!a) return null
  await db.aliments.put(a)
  if (s.prixFormat && s.prixFormat > 0)
    await db.prix.add({ cle: a.id, alimentId: a.id, prix: s.prixFormat, quantite: a.formatVente.quantite, unite: a.uniteBase, source: 'manuel', date: new Date().toISOString() })
  if (s.verdict) await enregistrerGout('aliment', a.id, { verdict: s.verdict })
  return a
}

/** Supprime un aliment perso (et l'avis associé). */
export async function supprimerAlimentPerso(id: string): Promise<void> {
  const a = await db.aliments.get(id)
  if (!a?.perso) return
  await db.transaction('rw', db.aliments, db.gouts, async () => {
    await db.aliments.delete(id)
    await db.gouts.delete(`aliment:${id}`)
  })
  await regenererListe()
}
