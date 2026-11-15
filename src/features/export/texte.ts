/**
 * Mise en texte de la liste de courses : partage (Messages, WhatsApp…), Rappels d'iPhone,
 * et données groupées réutilisées par la page d'impression. Fonctions pures.
 */
import type { ItemListe, ListeCourses, Rayon } from '@/types'
import { RAYONS, RAYON_LIBELLES } from '@/types'
import { formatAchat, prix } from '@/lib/format'

export interface GroupeRayon {
  /** Rayon du magasin, ou « placard » (produits probablement déjà à la maison). */
  rayon: Rayon | 'placard'
  libelle: string
  items: ItemListe[]
}

export const LIBELLE_PLACARD = 'Placard — vérifie si t’en as'

/** Articles groupés dans l'ordre du parcours de magasin, placard à la fin. */
export function grouperParRayon(items: ItemListe[]): GroupeRayon[] {
  const groupes = new Map<Rayon | 'placard', ItemListe[]>()
  for (const i of items) {
    const k = i.placard ? 'placard' : i.rayon
    groupes.set(k, [...(groupes.get(k) ?? []), i])
  }
  return [...RAYONS, 'placard' as const]
    .filter((r) => groupes.has(r))
    .map((r) => ({
      rayon: r,
      libelle: r === 'placard' ? LIBELLE_PLACARD : RAYON_LIBELLES[r],
      items: [...groupes.get(r)!].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    }))
}

/** Montant d'un article : prix payé s'il est saisi, sinon prix estimé. */
const montant = (i: ItemListe) => i.prixPaye ?? i.prixEstime
const arrondi = (n: number) => Math.round(n * 100) / 100

/** Totaux des articles fournis : principal (hors placard) et placard à part. */
export function totauxExport(items: ItemListe[]): { principal: number; placard: number } {
  let principal = 0
  let placard = 0
  for (const i of items) {
    if (i.placard) placard += montant(i)
    else principal += montant(i)
  }
  return { principal: arrondi(principal), placard: arrondi(placard) }
}

/** « 16 novembre » à partir de l'identifiant de liste (lundi AAAA-MM-JJ). */
export function libelleSemaine(liste: ListeCourses): string {
  const d = new Date(`${liste.id}T12:00:00`)
  if (Number.isNaN(d.getTime())) return liste.id
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export interface OptionsTexte {
  /** Inclure aussi les articles déjà cochés (par défaut : non, on partage ce qu'il reste à acheter). */
  inclureCoches?: boolean
  /** Afficher les prix estimés et le total (par défaut : oui). */
  avecPrix?: boolean
  /** Afficher les emojis (par défaut : oui). */
  avecEmojis?: boolean
}

/** Articles retenus pour l'export selon les options. */
export function articlesAExporter(liste: ListeCourses, inclureCoches = false): ItemListe[] {
  return inclureCoches ? liste.items : liste.items.filter((i) => !i.coche)
}

/**
 * Texte lisible de la liste, groupé par rayon :
 *
 *   🛒 Ma liste Popote — semaine du 16 novembre
 *
 *   Fruits et légumes
 *   - 🥕 Carotte : filet de 1 kg (1,35 €)
 *   …
 *   Total estimé : 23,40 €
 */
export function listeEnTexte(liste: ListeCourses, options: OptionsTexte = {}): string {
  const { inclureCoches = false, avecPrix = true, avecEmojis = true } = options
  const items = articlesAExporter(liste, inclureCoches)
  const lignes: string[] = [`🛒 Ma liste Popote — semaine du ${libelleSemaine(liste)}`]

  if (!items.length) {
    lignes.push('', 'Rien à acheter, t’es large 😎')
    return lignes.join('\n')
  }

  for (const g of grouperParRayon(items)) {
    lignes.push('', g.rayon === 'placard' ? `${avecEmojis ? '🧂 ' : ''}${g.libelle}` : g.libelle)
    for (const i of g.items) {
      const emoji = avecEmojis && i.emoji ? `${i.emoji} ` : ''
      const coche = inclureCoches && i.coche ? ' ✓' : ''
      const tarif = avecPrix ? ` (${prix(montant(i))})` : ''
      lignes.push(`- ${emoji}${i.nom} : ${formatAchat(i.nbFormats, i.libelleFormat)}${tarif}${coche}`)
    }
  }

  if (avecPrix) {
    const t = totauxExport(items)
    lignes.push('', `Total estimé : ${prix(t.principal)}`)
    if (t.placard > 0) lignes.push(`+ ${prix(t.placard)} de placard si tu dois tout racheter`)
  }
  return lignes.join('\n')
}

/**
 * Une ligne par article non coché, sans puce ni ligne vide : collé dans un nouveau rappel
 * de l'app Rappels, chaque ligne devient un rappel distinct. Ordre du parcours de magasin.
 */
export function listeEnRappels(liste: ListeCourses): string {
  return grouperParRayon(articlesAExporter(liste))
    .flatMap((g) =>
      g.items.map((i) => {
        const format = formatAchat(i.nbFormats, i.libelleFormat)
        const nom = i.nom.replace(/\s+/g, ' ').trim()
        return g.rayon === 'placard' ? `${nom} (${format}, si besoin)` : `${nom} (${format})`
      }),
    )
    .join('\n')
}
