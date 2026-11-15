import type { Jour } from '@/types'

/** Date locale au format AAAA-MM-JJ (sans décalage UTC). */
export function isoJour(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

/** Lundi de la semaine de `d`, au format AAAA-MM-JJ. */
export function lundiDe(d: Date = new Date()): string {
  const copie = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const decalage = (copie.getDay() + 6) % 7
  copie.setDate(copie.getDate() - decalage)
  return isoJour(copie)
}

/** Jour de la semaine de `d` : 0 = lundi … 6 = dimanche. */
export function jourDe(d: Date = new Date()): Jour {
  return ((d.getDay() + 6) % 7) as Jour
}

/** Ajoute n jours à une date ISO AAAA-MM-JJ. */
export function ajouterJours(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number)
  return isoJour(new Date(a, m - 1, j + n))
}

export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const
export const JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const

/** « aujourd'hui », « hier », « il y a 3 j », « il y a 2 mois » : âge lisible d'un prix. */
export function age(isoDate: string, maintenant: Date = new Date()): string {
  const ms = maintenant.getTime() - new Date(isoDate).getTime()
  const jours = Math.floor(ms / 86_400_000)
  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return 'hier'
  if (jours < 31) return `il y a ${jours} j`
  const mois = Math.floor(jours / 30)
  if (mois < 12) return `il y a ${mois} mois`
  return `il y a ${Math.floor(mois / 12)} an${mois >= 24 ? 's' : ''}`
}

/**
 * Semaine « de travail » de l'appli : la semaine en cours, sauf le dimanche
 * où l'on prépare déjà la semaine suivante (jour classique de courses).
 */
export function semaineActive(d: Date = new Date()): string {
  return jourDe(d) === 6 ? ajouterJours(lundiDe(d), 7) : lundiDe(d)
}
