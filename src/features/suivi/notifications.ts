/**
 * Notifications locales. Le Web Push « serveur » (VAPID) exige un back-end que Popote n'a pas :
 * on affiche donc des notifications locales à l'ouverture de l'appli (PWA installée, iOS 16.4+),
 * et les mêmes alertes restent visibles sur l'accueil (repli universel).
 */
import { db } from '@/lib/db'
import { ajouterJours, isoJour } from '@/lib/dates'

export function notificationsDisponibles(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

export async function demanderPermission(): Promise<boolean> {
  if (!notificationsDisponibles()) return false
  const r = await Notification.requestPermission()
  await db.reglages.update('moi', { notifications: r === 'granted' })
  return r === 'granted'
}

/** Alertes du jour : promos sur des produits aimés, produits à consommer vite. Fonction exportée pour les tests. */
export async function alertesDuJour(): Promise<{ id: string; titre: string; corps: string }[]> {
  const aujourdhui = isoJour()
  const [promos, gouts, stock] = await Promise.all([db.promos.where('fin').aboveOrEqual(aujourdhui).toArray(), db.gouts.toArray(), db.stock.toArray()])
  const aime = new Set(gouts.filter((g) => g.score > 0.2).map((g) => g.refId))
  const res: { id: string; titre: string; corps: string }[] = []
  for (const p of promos)
    if (p.alimentId && aime.has(p.alimentId)) res.push({ id: `promo-${p.id}`, titre: 'Promo sur un truc que t’aimes 🏷️', corps: `${p.libelle} à ${p.prix.toFixed(2).replace('.', ',')} € jusqu’au ${p.fin.split('-').reverse().slice(0, 2).join('/')}` })
  const vite = stock.filter((s) => s.peremption && s.peremption <= ajouterJours(aujourdhui, 1))
  if (vite.length) res.push({ id: `peremption-${aujourdhui}`, titre: 'À manger vite ⏰', corps: vite.slice(0, 3).map((s) => s.nom).join(', ') + (vite.length > 3 ? '…' : '') })
  return res
}

/** Envoie les alertes pas encore notifiées (une fois chacune). */
export async function notifierAlertes(): Promise<void> {
  const r = await db.reglages.get('moi')
  if (!r?.notifications || !notificationsDisponibles() || Notification.permission !== 'granted') return
  const deja = new Set(((await db.meta.get('notifiees'))?.valeur as string[] | undefined) ?? [])
  const alertes = (await alertesDuJour()).filter((a) => !deja.has(a.id))
  if (!alertes.length) return
  const reg = await navigator.serviceWorker.ready
  for (const a of alertes) await reg.showNotification(a.titre, { body: a.corps, tag: a.id, icon: 'icons/icon-192.png' })
  await db.meta.put({ cle: 'notifiees', valeur: [...deja, ...alertes.map((a) => a.id)].slice(-200) })
}
