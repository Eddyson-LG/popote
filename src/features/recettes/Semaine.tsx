import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Recette, Repas, TypeRepas } from '@/types'
import { db } from '@/lib/db'
import { JOURS_LONGS, ajouterJours, jourDe, lundiDe, semaineActive } from '@/lib/dates'
import { changerRepas, chargerGouts, marquerCuisine, planifierSemaine, verrouillerRepas, type OptionsPlanning } from '@/lib/contexte'
import { cleDisponible } from '@/lib/ia'
import { genererRecettesIA, interpreterConsigne } from './ia'
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

  const [consigne, setConsigne] = useState('')
  const [compris, setCompris] = useState('')

  async function generer(options: OptionsPlanning = {}) {
    setOccupe(true)
    try {
      await planifierSemaine(semaine, Date.now(), options)
    } finally {
      setOccupe(false)
    }
  }

  /** Consigne en langage naturel : IA si dispo, sinon règles locales ; IA → aussi quelques recettes neuves. */
  async function genererAvecConsigne() {
    if (!consigne.trim()) return generer()
    setOccupe(true)
    try {
      const aliments = await db.aliments.toArray()
      const c = await interpreterConsigne(consigne, aliments)
      setCompris(c.resume + (c.parIA ? ' ✨' : ''))
      if (c.parIA) {
        const reglages = await db.reglages.get('moi')
        const nouvelles = reglages && (await genererRecettesIA({ aliments, reglages, gouts: await chargerGouts(), nb: 4, consigne }))
        if (nouvelles?.length) await db.recettes.bulkPut(nouvelles)
      }
      await planifierSemaine(semaine, Date.now(), c)
    } finally {
      setOccupe(false)
    }
  }

  const ia = useLiveQuery(() => cleDisponible(), [])
  const boiteConsigne = (
    <Carte className="mb-5">
      <label htmlFor="consigne" className="font-semibold">Une envie pour la semaine ?</label>
      <div className="mt-2 flex gap-2">
        <input
          id="consigne"
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          placeholder="« J’ai la flemme », « pas de thon »…"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3"
        />
        <Bouton onClick={genererAvecConsigne} disabled={occupe}>{occupe ? '…' : 'Go'}</Bouton>
      </div>
      <p className="mt-1 text-xs text-encre-3" aria-live="polite">
        {compris || (ia?.ok ? '✨ L’IA te propose aussi des recettes neuves.' : 'Marche sans IA ; avec ta clé Claude, c’est plus perso.')}
      </p>
    </Carte>
  )

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
        <>
        {boiteConsigne}
        <Vide
          emoji="📅"
          titre="Rien de prévu"
          texte="Je te prépare une semaine selon tes goûts et ton budget."
          action={
            <Bouton onClick={() => generer()} disabled={occupe}>
              {occupe ? 'Je cuisine ça…' : 'Générer ma semaine'}
            </Bouton>
          }
        />
        </>
      ) : (
        <>
          {boiteConsigne}
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
            <Link to="/vide-frigo" className="text-center font-semibold text-encre-2 underline-offset-4 hover:underline">🧺 Idées vide-frigo</Link>
            <Bouton variante="doux" onClick={() => generer()} disabled={occupe}>
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
