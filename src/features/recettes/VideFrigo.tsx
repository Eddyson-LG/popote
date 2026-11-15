/** « Vide-frigo » : des idées avec ce que t'as déjà, priorité à ce qui périme. IA en bonus. */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Recette } from '@/types'
import { db } from '@/lib/db'
import { chargerGouts } from '@/lib/contexte'
import { MESSAGES_ERREUR, cleDisponible } from '@/lib/ia'
import { Bouton, Carte, Page, Pastille, Vide } from '@/ui'
import { genererRecettesIA, videFrigoRegles } from './ia'

export default function VideFrigo() {
  const [idees, setIdees] = useState<Recette[] | null>(null)
  const [etat, setEtat] = useState('')
  const d = useLiveQuery(async () => {
    const [recettes, stock, aliments, reglages] = await Promise.all([db.recettes.toArray(), db.stock.toArray(), db.aliments.toArray(), db.reglages.get('moi')])
    const alimentsParId = new Map(aliments.map((a) => [a.id, a]))
    return { stock, aliments, alimentsParId, reglages, suggestions: videFrigoRegles(recettes, stock, alimentsParId), ia: await cleDisponible() }
  }, [])
  if (!d) return null

  async function demanderIA() {
    if (!d?.reglages) return
    setEtat('Je réfléchis… 🤔')
    const r = await genererRecettesIA({ aliments: d.aliments, reglages: d.reglages, gouts: await chargerGouts(), nb: 3, stock: d.stock, consigne: 'Idées vide-frigo : utilise surtout le stock.' })
    if (!r || !r.length) return setEtat('L’IA n’a rien donné de valable, les idées ci-dessous marchent sans elle.')
    await db.recettes.bulkPut(r)
    setIdees(r)
    setEtat('')
  }

  return (
    <Page titre="Vide-frigo" sousTitre="Avec ce que t’as déjà.">
      {d.stock.length === 0 ? (
        <Vide emoji="🧺" titre="Ton stock est vide" texte="Ajoute ce que t’as dans le frigo et les placards." action={<Link to="/plus/stock"><Bouton>Mon stock</Bouton></Link>} />
      ) : (
        <>
          {d.ia.ok ? (
            <Bouton variante="orange" className="mb-2 w-full" onClick={demanderIA}>✨ Des idées sur mesure (IA)</Bouton>
          ) : (
            <p className="mb-3 text-sm text-encre-3">Sans IA : {MESSAGES_ERREUR[d.ia.erreur]} Les idées ci-dessous viennent de tes recettes.</p>
          )}
          {etat && <p role="status" className="mb-3 text-sm text-encre-2">{etat}</p>}
          <ul className="space-y-2">
            {(idees ?? []).map((r) => (
              <li key={r.id}>
                <Link to={`/recette/${r.id}`}><Carte className="flex items-center gap-3 p-3"><span className="text-3xl" aria-hidden>{r.emoji}</span><span className="flex-1 font-semibold">{r.nom}</span><Pastille ton="orange">✨ IA</Pastille></Carte></Link>
              </li>
            ))}
            {d.suggestions.map((s) => (
              <li key={s.recette.id}>
                <Link to={`/recette/${s.recette.id}`}>
                  <Carte className="flex items-center gap-3 p-3">
                    <span className="text-3xl" aria-hidden>{s.recette.emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">{s.recette.nom}</span>
                      <span className="block text-xs text-encre-2">
                        {s.manque.length ? `Il te manque : ${s.manque.map((id) => d.alimentsParId.get(id)?.nom.toLowerCase()).join(', ')}` : 'Tu as tout ✅'}
                      </span>
                    </span>
                    {s.urgent > 0 && <Pastille ton="rouge">anti-gaspi</Pastille>}
                  </Carte>
                </Link>
              </li>
            ))}
          </ul>
          {!d.suggestions.length && !idees?.length && <p className="text-encre-2">Pas assez d’ingrédients pour une recette complète. Essaie l’IA ou complète ton stock.</p>}
        </>
      )}
    </Page>
  )
}
