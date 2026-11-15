/** Bloc « économies » de l'accueil : compteur motivant + « j'ai mangé dehors » en un tap. */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '@/lib/db'
import { prix } from '@/lib/format'
import { Carte } from '@/ui'
import { messageMotivant } from './calcul'
import { chargerBilan, noterRepasDehors } from './donnees'

export function BlocAccueilSuivi() {
  // Dépend des tables qui changent le bilan, pour se mettre à jour en direct.
  const b = useLiveQuery(async () => {
    await Promise.all([db.repas.count(), db.repasDehors.count(), db.depenses.count()])
    return chargerBilan()
  }, [])
  const [note, setNote] = useState('')
  if (!b) return null
  return (
    <Carte className="mb-4">
      <Link to="/plus/economies" className="block">
        <div className="text-sm text-encre-2">Économies du mois</div>
        <div className="titre text-3xl font-extrabold text-vert">{prix(b.economieMois)}</div>
        <p className="mt-1 text-sm font-medium">{messageMotivant(b, b.prixRepasDehors)}</p>
      </Link>
      <button
        type="button"
        className="mt-3 min-h-11 w-full rounded-full bg-surface-2 px-4 text-sm font-semibold"
        onClick={async () => {
          await noterRepasDehors(b.prixRepasDehors)
          setNote(`Noté : ${prix(b.prixRepasDehors)} dehors. Ça arrive, la prochaine sera maison 😉`)
        }}
      >
        🥪 J’ai mangé dehors ({prix(b.prixRepasDehors)})
      </button>
      {note && <p role="status" className="mt-2 text-sm text-encre-2">{note}</p>}
    </Carte>
  )
}
