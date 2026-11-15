import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db } from '@/lib/db'
import { chargerResolveurPrix } from '@/lib/contexte'
import { cout, sourceEtAge } from '@/lib/prix'
import { age } from '@/lib/dates'
import { assietteComplete } from '@/lib/assiette'
import { prix, quantite } from '@/lib/format'
import { Bouton, Carte, Page, Pastille, Vide } from '@/ui'

export default function FicheRecette() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [portions, setPortions] = useState(Math.max(1, Number(params.get('portions')) || 1))
  const donnees = useLiveQuery(async () => {
    const r = await db.recettes.get(id)
    if (!r) return null
    const aliments = new Map((await db.aliments.bulkGet(r.ingredients.map((i) => i.alimentId))).filter(Boolean).map((a) => [a!.id, a!]))
    const resolveur = await chargerResolveurPrix()
    return { r, aliments, resolveur }
  }, [id])

  if (donnees === undefined) return null
  if (donnees === null) return <Page titre="Recette">{<Vide emoji="🤷" titre="Recette introuvable" />}</Page>
  const { r, aliments, resolveur } = donnees
  const f = portions / r.portions
  const total = r.ingredients.reduce((s, i) => {
    const a = aliments.get(i.alimentId)
    return a && !i.optionnel ? s + cout(i.quantite * f, a, resolveur(a.id)) : s
  }, 0)
  const estime = r.ingredients.some((i) => resolveur(i.alimentId)?.estime)
  const a = assietteComplete(r, aliments)

  return (
    <Page titre={r.nom} sousTitre={`${r.tempsMinutes} min · ${r.equipement.join(', ') || 'sans cuisson'}`} action={<Bouton variante="doux" aria-label="Retour" onClick={() => navigate(-1)}>←</Bouton>}>
      <div className="mb-4 flex h-40 items-center justify-center rounded-carte bg-orange-doux text-8xl" aria-hidden>
        {r.emoji}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {a.complete ? <Pastille ton="vert">🍽️ Assiette complète</Pastille> : <Pastille>{[a.legume && 'légume', a.feculent && 'féculent', a.proteine && 'protéine'].filter(Boolean).join(' + ') || 'en-cas'}</Pastille>}
        {r.gamelle && <Pastille ton="orange">🥡 Gamelle OK</Pastille>}
        {r.batch && <Pastille>Batch</Pastille>}
        {r.peuSucre && <Pastille ton="vert">Peu sucré</Pastille>}
        {r.source === 'ia' && <Pastille>✨ IA</Pastille>}
      </div>
      <Carte className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="titre text-2xl font-extrabold text-orange-texte">{prix(total)}</div>
            <div className="text-sm text-encre-2">
              soit {prix(total / portions)} la portion {estime && '· prix en partie estimés'}
            </div>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Nombre de portions">
            <Bouton variante="doux" aria-label="Moins de portions" onClick={() => setPortions(Math.max(1, portions - 1))}>−</Bouton>
            <span className="w-16 text-center font-semibold" aria-live="polite">{portions} pers.</span>
            <Bouton variante="doux" aria-label="Plus de portions" onClick={() => setPortions(portions + 1)}>+</Bouton>
          </div>
        </div>
      </Carte>
      <h2 className="mb-2 text-xl font-bold">Ingrédients</h2>
      <ul className="mb-6 space-y-1">
        {r.ingredients.map((i) => {
          const al = aliments.get(i.alimentId)
          return (
            <li key={i.alimentId} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
              <span aria-hidden>{al?.emoji}</span>
              <span className="flex-1">{al?.nom ?? i.alimentId}{i.optionnel && <span className="text-encre-3"> (facultatif)</span>}</span>
              <span className="text-right">
                <span className="block font-semibold">{quantite(i.quantite * f, i.unite)}</span>
                {al && resolveur(al.id) && (
                  <span className="block text-xs text-encre-3">
                    {prix(cout(i.quantite * f, al, resolveur(al.id)))} · {sourceEtAge(resolveur(al.id)!.source, resolveur(al.id)!.date, resolveur(al.id)!.detail, age)}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <h2 className="mb-2 text-xl font-bold">Étapes</h2>
      <ol className="space-y-3">
        {r.etapes.map((e, n) => (
          <li key={n} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cta font-bold text-cta-texte">{n + 1}</span>
            <p className="pt-1">{e}</p>
          </li>
        ))}
      </ol>
    </Page>
  )
}
