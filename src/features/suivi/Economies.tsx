import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { prix } from '@/lib/format'
import { Bouton, Carte, Jauge, Page } from '@/ui'
import { messageMotivant } from './calcul'
import { chargerBilan, noterRepasDehors } from './donnees'

export default function Economies() {
  const b = useLiveQuery(async () => {
    await Promise.all([db.repas.count(), db.repasDehors.count(), db.depenses.count()])
    return chargerBilan()
  }, [])
  const dehors = useLiveQuery(() => db.repasDehors.orderBy('date').reverse().limit(10).toArray(), [])
  const [montant, setMontant] = useState('')
  if (!b) return null
  const budgetMois = b.budgetHebdo * 4.33
  return (
    <Page titre="Économies" sousTitre={messageMotivant(b, b.prixRepasDehors)}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Carte>
          <div className="text-sm text-encre-2">Économisé ce mois</div>
          <div className="titre text-3xl font-extrabold text-vert">{prix(b.economieMois)}</div>
          <div className="text-xs text-encre-3">vs sandwichs et repas dehors</div>
        </Carte>
        <Carte>
          <div className="text-sm text-encre-2">Repas maison</div>
          <div className="titre text-3xl font-extrabold">{b.repasMaisonMois}</div>
          <div className="text-xs text-encre-3">dont {b.gamellesMois} gamelle{b.gamellesMois > 1 ? 's' : ''}</div>
        </Carte>
      </div>
      <Carte className="mb-4">
        <div className="mb-1 flex justify-between text-sm"><span>Courses cette semaine</span><strong>{prix(b.depenseSemaine)} / {prix(b.budgetHebdo)}</strong></div>
        <Jauge valeur={b.depenseSemaine} max={b.budgetHebdo} libelle="Dépenses de la semaine" />
        <div className="mb-1 mt-4 flex justify-between text-sm"><span>Courses ce mois</span><strong>{prix(b.depenseMois)} / {prix(budgetMois)}</strong></div>
        <Jauge valeur={b.depenseMois} max={budgetMois} libelle="Dépenses du mois" />
        <div className="mt-4 flex justify-between text-sm"><span>Repas dehors ce mois</span><strong className={b.dehorsMois > 0 ? 'text-rouge' : ''}>{prix(b.dehorsMois)}</strong></div>
      </Carte>
      <Carte>
        <h2 className="mb-2 text-lg font-bold">Un repas acheté dehors ?</h2>
        <div className="flex gap-2">
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={`${b.prixRepasDehors} €`} aria-label="Montant du repas dehors" className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3" />
          <Bouton onClick={async () => { await noterRepasDehors(Number(montant.replace(',', '.')) || b.prixRepasDehors); setMontant('') }}>Noter</Bouton>
        </div>
        {dehors && dehors.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {dehors.map((d) => (
              <li key={d.id} className="flex justify-between">
                <span className="text-encre-2">{new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="flex items-center gap-2">{prix(d.montant)}<button type="button" className="h-11 w-11 text-encre-3" aria-label="Supprimer" onClick={() => db.repasDehors.delete(d.id!)}>✕</button></span>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </Page>
  )
}
