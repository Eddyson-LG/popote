import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Recette, Repas, TypeRepas } from '@/types'
import { db } from '@/lib/db'
import { JOURS_LONGS, ajouterJours, jourDe, lundiDe, semaineActive } from '@/lib/dates'
import { changerRepas, marquerCuisine, planifierSemaine, verrouillerRepas } from '@/lib/contexte'
import { Bouton, Carte, Page, Vide } from '@/ui'

export const LIBELLE_REPAS: Record<TypeRepas, string> = {
  'petit-dejeuner': 'Petit-déj',
  dejeuner: 'Midi',
  gouter: 'Goûter',
  diner: 'Dîner',
  gamelle: 'Gamelle du service',
}

export default function Semaine() {
  const [decalage, setDecalage] = useState(0)
  const semaine = ajouterJours(semaineActive(), decalage * 7)
  const [occupe, setOccupe] = useState(false)
  const repas = useLiveQuery(() => db.repas.where('semaine').equals(semaine).toArray(), [semaine])
  const recettes = useLiveQuery(async () => new Map((await db.recettes.toArray()).map((r) => [r.id, r])), [])
  const aujourdhui = semaine === lundiDe() ? jourDe() : -1

  async function generer() {
    setOccupe(true)
    try {
      await planifierSemaine(semaine)
    } finally {
      setOccupe(false)
    }
  }

  const titreSemaine = decalage === 0 ? 'Cette semaine' : decalage === 1 ? 'Semaine pro' : `Semaine du ${semaine.split('-').reverse().slice(0, 2).join('/')}`

  return (
    <Page
      titre="Ta semaine"
      sousTitre={titreSemaine}
      action={
        <div className="flex gap-1">
          <Bouton variante="doux" aria-label="Semaine précédente" onClick={() => setDecalage(decalage - 1)} disabled={decalage <= -2}>
            ←
          </Bouton>
          <Bouton variante="doux" aria-label="Semaine suivante" onClick={() => setDecalage(decalage + 1)} disabled={decalage >= 2}>
            →
          </Bouton>
        </div>
      }
    >
      {!repas || !recettes ? null : repas.length === 0 ? (
        <Vide
          emoji="📅"
          titre="Rien de prévu"
          texte="Je te prépare une semaine selon tes goûts et ton budget."
          action={
            <Bouton onClick={generer} disabled={occupe}>
              {occupe ? 'Je cuisine ça…' : 'Générer ma semaine'}
            </Bouton>
          }
        />
      ) : (
        <>
          <div className="space-y-6">
            {JOURS_LONGS.map((nomJour, j) => {
              const duJour = repas.filter((r) => r.jour === j).sort((a, b) => ordre(a.type) - ordre(b.type))
              if (!duJour.length) return null
              return (
                <section key={nomJour} aria-labelledby={`jour-${j}`}>
                  <h2 id={`jour-${j}`} className={`mb-2 text-xl font-bold ${j === aujourdhui ? 'text-orange' : ''}`}>
                    {nomJour} {j === aujourdhui && <span className="text-sm font-semibold">· aujourd’hui</span>}
                  </h2>
                  <div className="space-y-2">
                    {duJour.map((r) => (
                      <LigneRepas key={r.id} repas={r} recette={recettes.get(r.recetteId)} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
          <div className="mt-8 flex flex-col gap-2">
            <Bouton variante="doux" onClick={generer} disabled={occupe}>
              {occupe ? 'Je cuisine ça…' : '🔄 Tout regénérer (sauf les verrouillés)'}
            </Bouton>
            <Link to="/liste" className="text-center font-semibold text-orange underline-offset-4 hover:underline">
              Voir la liste de courses →
            </Link>
          </div>
        </>
      )}
    </Page>
  )
}

function ordre(t: TypeRepas) {
  return ['petit-dejeuner', 'dejeuner', 'gouter', 'diner', 'gamelle'].indexOf(t)
}

function LigneRepas({ repas, recette }: { repas: Repas; recette?: Recette }) {
  const [occupe, setOccupe] = useState(false)
  const agir = async (f: () => Promise<void>) => {
    setOccupe(true)
    try {
      await f()
    } finally {
      setOccupe(false)
    }
  }
  return (
    <Carte className={`flex items-center gap-3 p-3 ${repas.cuisine ? 'opacity-60' : ''}`}>
      <Link to={`/recette/${repas.recetteId}?portions=${repas.portions}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-doux text-2xl" aria-hidden>
          {recette?.emoji ?? '🍽️'}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-encre-3">
            {LIBELLE_REPAS[repas.type]}
            {repas.restes && ' · restes'}
            {!repas.restes && repas.portions > 1 && ` · ${repas.portions} portions`}
          </span>
          <span className="block truncate font-semibold">{recette?.nom ?? 'Recette supprimée'}</span>
        </span>
      </Link>
      <div className="flex shrink-0 gap-1">
        {!repas.cuisine && (
          <button
            type="button"
            className="h-11 w-11 rounded-full bg-surface-2 text-lg disabled:opacity-40"
            aria-label="Autre idée"
            title="Autre idée"
            disabled={occupe || repas.verrouille}
            onClick={() => agir(() => changerRepas(repas))}
          >
            🔄
          </button>
        )}
        <button
          type="button"
          className={`h-11 w-11 rounded-full text-lg ${repas.verrouille ? 'bg-cta text-cta-texte' : 'bg-surface-2'}`}
          aria-label={repas.verrouille ? 'Déverrouiller' : 'Verrouiller'}
          aria-pressed={repas.verrouille}
          onClick={() => agir(() => verrouillerRepas(repas, !repas.verrouille))}
        >
          {repas.verrouille ? '🔒' : '🔓'}
        </button>
        <button
          type="button"
          className={`h-11 w-11 rounded-full text-lg ${repas.cuisine ? 'bg-vert text-white' : 'bg-surface-2'}`}
          aria-label={repas.cuisine ? 'Marqué cuisiné (annuler)' : 'Marquer cuisiné'}
          aria-pressed={repas.cuisine}
          disabled={occupe}
          onClick={() => agir(() => marquerCuisine(repas, !repas.cuisine))}
        >
          ✓
        </button>
      </div>
    </Carte>
  )
}
