import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Gout, Verdict } from '@/types'
import { db } from '@/lib/db'
import { enregistrerGout } from '@/lib/contexte'
import { Bouton, Page, Vide } from '@/ui'

const GROUPES: { verdicts: Verdict[]; titre: string }[] = [
  { verdicts: ['adore'], titre: '😍 J’adore' },
  { verdicts: ['aime'], titre: '👍 J’aime' },
  { verdicts: ['pas-souvent', 'pas-aime'], titre: '🤏 Pas souvent' },
  { verdicts: ['jamais'], titre: '🚫 Jamais' },
]
const OPTIONS: { v: Verdict; label: string }[] = [
  { v: 'adore', label: '😍' },
  { v: 'aime', label: '👍' },
  { v: 'pas-souvent', label: '🤏' },
  { v: 'jamais', label: '🚫' },
]

export default function MesGouts() {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const donnees = useLiveQuery(async () => {
    const [gouts, aliments, recettes, produits] = await Promise.all([db.gouts.toArray(), db.aliments.toArray(), db.recettes.toArray(), db.produits.toArray()])
    const noms = new Map<string, { nom: string; emoji: string }>()
    aliments.forEach((a) => noms.set(`aliment:${a.id}`, { nom: a.nom, emoji: a.emoji }))
    recettes.forEach((r) => noms.set(`recette:${r.id}`, { nom: r.nom, emoji: r.emoji }))
    produits.forEach((p) => noms.set(`produit:${p.codeBarres}`, { nom: p.nom, emoji: '🛒' }))
    return { gouts: gouts.filter((g) => g.verdict), noms }
  }, [])

  if (!donnees) return null
  const { gouts, noms } = donnees

  async function changer(g: Gout, v: Verdict | null) {
    await enregistrerGout(g.cible, g.refId, { verdict: v })
    setOuvert(null)
  }

  return (
    <Page titre="Mes goûts" sousTitre="Touche un élément pour le modifier.">
      {gouts.length === 0 ? (
        <Vide emoji="🔥" titre="Pas encore de goûts" texte="Swipe quelques cartes pour que je te connaisse." action={<Link to="/swipe"><Bouton>Swiper 2 min</Bouton></Link>} />
      ) : (
        <div className="space-y-6">
          {GROUPES.map((grp) => {
            const items = gouts.filter((g) => grp.verdicts.includes(g.verdict!)).sort((a, b) => (noms.get(a.id)?.nom ?? '').localeCompare(noms.get(b.id)?.nom ?? '', 'fr'))
            return (
              <section key={grp.titre}>
                <h2 className="mb-2 text-xl font-bold">
                  {grp.titre} <span className="text-base font-normal text-encre-3">({items.length})</span>
                </h2>
                {items.length === 0 ? (
                  <p className="text-sm text-encre-3">Rien ici.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {items.map((g) => {
                      const n = noms.get(g.id)
                      return (
                        <li key={g.id}>
                          {ouvert === g.id ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface p-1 shadow-carte">
                              {OPTIONS.map((o) => (
                                <button key={o.v} type="button" aria-label={o.v} aria-pressed={g.verdict === o.v} className={`h-10 w-10 rounded-full ${g.verdict === o.v ? 'bg-orange-doux' : ''}`} onClick={() => changer(g, o.v)}>
                                  {o.label}
                                </button>
                              ))}
                              <button type="button" className="h-10 rounded-full px-3 text-sm text-encre-2" onClick={() => changer(g, null)}>
                                Oublier
                              </button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setOuvert(g.id)} className="min-h-11 rounded-full bg-surface px-3 font-medium shadow-carte">
                              <span aria-hidden>{n?.emoji}</span> {n?.nom ?? g.refId}
                              {g.note && <span className="ml-1 text-orange-texte">{'★'.repeat(g.note)}</span>}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </Page>
  )
}
