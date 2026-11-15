import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Gout } from '@/types'
import { db } from '@/lib/db'
import { ajouterJours, isoJour, jourDe, lundiDe, semaineActive } from '@/lib/dates'
import { prix } from '@/lib/format'
import { enregistrerGout } from '@/lib/contexte'
import { totaux } from '@/features/liste/generer'
import { LIBELLE_REPAS } from '@/features/recettes/Semaine'
import { Bouton, Carte, Jauge, Page, Pastille } from '@/ui'
import { useReglages } from '@/lib/hooks'
import { BlocAccueilSuivi } from '@/features/suivi/BlocAccueil'

function salutation() {
  const h = new Date().getHours()
  return h < 11 ? 'Bien dormi ?' : h < 17 ? 'Salut 👋' : 'Bonsoir 🌙'
}

export default function Accueil() {
  const reglages = useReglages()
  const semaine = lundiDe()
  const active = semaineActive()
  const d = useLiveQuery(async () => {
    const aujourdhui = isoJour()
    const [repas, liste, stock, promos, gouts, recettes, aliments] = await Promise.all([
      db.repas.where('semaine').anyOf(semaine, ajouterJours(semaine, -7), active).toArray(),
      db.listes.get(active),
      db.stock.toArray(),
      db.promos.where('fin').aboveOrEqual(aujourdhui).toArray(),
      db.gouts.toArray(),
      db.recettes.toArray(),
      db.aliments.toArray(),
    ])
    const r = new Map(recettes.map((x) => [x.id, x]))
    const a = new Map(aliments.map((x) => [x.id, x]))
    const g = new Map(gouts.map((x) => [x.id, x]))
    const ORDRE = ['petit-dejeuner', 'dejeuner', 'gouter', 'diner', 'gamelle']
    const trier = (t: typeof repas) => t.sort((x, y) => ORDRE.indexOf(x.type) - ORDRE.indexOf(y.type))
    let duJour = trier(repas.filter((x) => x.semaine === semaine && x.jour === jourDe()))
    let demain = false
    // Le dimanche, la semaine active est la suivante : on montre ce qui est prévu demain.
    if (!duJour.length && active !== semaine) {
      duJour = trier(repas.filter((x) => x.semaine === active && x.jour === 0))
      demain = duJour.length > 0
    }
    const bientot = stock.filter((s) => s.peremption && s.peremption <= ajouterJours(aujourdhui, 3)).sort((x, y) => x.peremption!.localeCompare(y.peremption!))
    const promosAimees = promos.filter((p) => p.alimentId && (g.get(`aliment:${p.alimentId}`)?.score ?? 0) > 0.2)
    // « T'as aimé ? » : repas cuisinés avant aujourd'hui, recette pas encore notée.
    const aNoter = repas
      .filter((x) => x.cuisine && !x.restes && x.cuisineLe && x.cuisineLe.slice(0, 10) < aujourdhui && !g.get(`recette:${x.recetteId}`)?.note)
      .slice(0, 1)
    return { duJour, demain, liste, bientot, promosAimees, aNoter, r, a }
  }, [semaine, active])

  if (!reglages || !d) return null
  const total = d.liste ? totaux(d.liste.items).principal : 0

  return (
    <Page titre={salutation()} sousTitre={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}>
      {d.aNoter.map((x) => {
        const rec = d.r.get(x.recetteId)
        return (
          <Carte key={x.id} className="mb-4">
            <p className="font-semibold">T’as aimé {rec?.emoji} {rec?.nom} ?</p>
            <div className="mt-2 flex gap-1" role="group" aria-label="Note de 1 à 5 étoiles">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                  className="h-11 w-11 rounded-full bg-surface-2 text-xl text-orange"
                  onClick={() => enregistrerGout('recette', x.recetteId, { note: n as Gout['note'] })}
                >
                  ★
                </button>
              ))}
            </div>
          </Carte>
        )
      })}

      <h2 className="mb-2 text-xl font-bold">{d.demain ? 'Au menu demain' : 'Au menu aujourd’hui'}</h2>
      {d.duJour.length === 0 ? (
        <Carte className="mb-6">
          <p className="text-encre-2">Rien de prévu.</p>
          <Link to="/semaine" className="mt-2 inline-block font-semibold text-orange">Préparer ma semaine →</Link>
        </Carte>
      ) : (
        <div className="mb-6 flex snap-x gap-3 overflow-x-auto pb-2">
          {d.duJour.map((x) => {
            const rec = d.r.get(x.recetteId)
            return (
              <Link key={x.id} to={`/recette/${x.recetteId}?portions=${x.portions}`} className="w-44 shrink-0 snap-start">
                <Carte className={`h-full ${x.cuisine ? 'opacity-60' : ''}`}>
                  <div className="mb-2 flex h-20 items-center justify-center rounded-2xl bg-orange-doux text-5xl" aria-hidden>{rec?.emoji}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-encre-3">{LIBELLE_REPAS[x.type]}</div>
                  <div className="font-semibold leading-tight">{rec?.nom}</div>
                  {x.restes && <Pastille>restes</Pastille>}
                </Carte>
              </Link>
            )
          })}
        </div>
      )}

      <Link to="/liste" className="block">
        <Carte className="mb-4">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div className="text-sm text-encre-2">Courses de la semaine</div>
              <div className={`titre text-3xl font-extrabold ${total > reglages.budgetHebdo ? 'text-rouge' : 'text-orange'}`}>{prix(total)}</div>
            </div>
            <div className="text-sm text-encre-2">/ {prix(reglages.budgetHebdo)}</div>
          </div>
          <Jauge valeur={total} max={reglages.budgetHebdo} libelle="Budget de la semaine" />
        </Carte>
      </Link>

      <BlocAccueilSuivi />

      {(d.bientot.length > 0 || d.promosAimees.length > 0) && (
        <section className="mb-4 space-y-2" aria-label="Alertes">
          {d.promosAimees.slice(0, 3).map((p) => (
            <Carte key={p.id} className="flex items-center gap-3 p-3">
              <span className="text-2xl" aria-hidden>🏷️</span>
              <span className="flex-1 text-sm">
                <strong>{p.libelle}</strong> en promo : {prix(p.prix)} {p.prixNormal && <span className="text-encre-3 line-through">{prix(p.prixNormal)}</span>}
              </span>
            </Carte>
          ))}
          {d.bientot.slice(0, 3).map((s) => (
            <Carte key={s.id} className="flex items-center gap-3 p-3">
              <span className="text-2xl" aria-hidden>⏰</span>
              <span className="flex-1 text-sm">
                <strong>{s.nom}</strong> à manger vite ({s.peremption! < isoJour() ? 'périmé' : s.peremption === isoJour() ? "aujourd'hui" : `avant le ${s.peremption!.split('-').reverse().slice(0, 2).join('/')}`})
              </span>
              <Pastille ton="rouge">vite</Pastille>
            </Carte>
          ))}
        </section>
      )}

      <Link to="/swipe" className="block">
        <Bouton grand variante="orange">🔥 Swiper 2 min</Bouton>
      </Link>
    </Page>
  )
}
