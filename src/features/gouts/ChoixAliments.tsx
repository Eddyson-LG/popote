/**
 * Liste de tous les aliments : recherche, filtre par famille, ❤️ coup de cœur / 🚫 banni en un tap,
 * et ajout de ses propres aliments. Utilisé dans « Mes goûts » et dans le questionnaire de départ.
 */
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CategorieAliment, Rayon, Unite, Verdict } from '@/types'
import { CATEGORIES_ALIMENT, CATEGORIE_LIBELLES, RAYONS, RAYON_LIBELLES } from '@/types'
import { db } from '@/lib/db'
import { enregistrerGout, regenererListe } from '@/lib/contexte'
import { Bouton, Carte } from '@/ui'
import { ajouterAlimentPerso, supprimerAlimentPerso } from './alimentsPerso'

const norme = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Filtre = 'tous' | 'coeur' | 'bannis' | 'perso' | CategorieAliment

export function ChoixAliments({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState('')
  const [filtre, setFiltre] = useState<Filtre>(compact ? 'tous' : 'tous')
  const [ajout, setAjout] = useState(false)
  const d = useLiveQuery(async () => {
    const [aliments, gouts, reglages] = await Promise.all([db.aliments.toArray(), db.gouts.where('cible').equals('aliment').toArray(), db.reglages.get('moi')])
    return { aliments, verdicts: new Map(gouts.map((g) => [g.refId, g.verdict])), exclusions: reglages?.exclusions ?? [] }
  }, [])

  const visibles = useMemo(() => {
    if (!d) return []
    const t = norme(q.trim())
    return d.aliments
      .filter((a) => !t || norme(a.nom).includes(t) || a.synonymes?.some((s) => norme(s).includes(t)))
      .filter((a) => {
        const v = d.verdicts.get(a.id)
        if (filtre === 'coeur') return v === 'adore'
        if (filtre === 'bannis') return v === 'jamais' || a.tags.some((x) => d.exclusions.includes(x))
        if (filtre === 'perso') return a.perso
        if (filtre !== 'tous') return a.categorie === filtre
        return true
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [d, q, filtre])

  if (!d) return null
  const nbCoeur = [...d.verdicts.values()].filter((v) => v === 'adore').length
  const nbBannis = [...d.verdicts.values()].filter((v) => v === 'jamais').length

  async function basculer(id: string, v: Extract<Verdict, 'adore' | 'jamais'>) {
    await enregistrerGout('aliment', id, { verdict: d!.verdicts.get(id) === v ? null : v })
    regenererListe().catch(() => {})
  }

  const filtres: { id: Filtre; label: string }[] = [
    { id: 'tous', label: 'Tous' },
    { id: 'coeur', label: `❤️ Coups de cœur (${nbCoeur})` },
    { id: 'bannis', label: `🚫 Bannis (${nbBannis})` },
    { id: 'perso', label: '✍️ Les miens' },
    ...CATEGORIES_ALIMENT.map((c) => ({ id: c as Filtre, label: CATEGORIE_LIBELLES[c] })),
  ]

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Chercher un aliment (pesto, gnocchis…)"
        aria-label="Chercher un aliment"
        className="min-h-12 w-full rounded-full bg-surface px-5 shadow-carte"
      />
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrer">
        {filtres.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtre === f.id}
            onClick={() => setFiltre(f.id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${filtre === f.id ? 'bg-cta text-cta-texte' : 'bg-surface-2'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className={`mt-3 space-y-1 ${compact ? 'max-h-[45vh] overflow-y-auto' : ''}`}>
        {visibles.map((a) => {
          const v = d.verdicts.get(a.id)
          const familleBannie = a.tags.find((t) => d.exclusions.includes(t))
          return (
            <li key={a.id} className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-1 shadow-carte">
              <span aria-hidden className="text-xl">{a.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.nom}</span>
                {(familleBannie || a.perso) && (
                  <span className="block text-xs text-encre-3">
                    {familleBannie ? `banni avec la famille « ${familleBannie} » (Réglages)` : 'ajouté par toi'}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-pressed={v === 'adore'}
                aria-label={`${a.nom} : coup de cœur`}
                onClick={() => basculer(a.id, 'adore')}
                className={`h-11 w-11 rounded-full text-lg ${v === 'adore' ? 'bg-orange-doux' : 'opacity-40 grayscale'}`}
              >
                ❤️
              </button>
              <button
                type="button"
                aria-pressed={v === 'jamais'}
                aria-label={`${a.nom} : banni`}
                onClick={() => basculer(a.id, 'jamais')}
                className={`h-11 w-11 rounded-full text-lg ${v === 'jamais' ? 'bg-rouge-doux' : 'opacity-40 grayscale'}`}
              >
                🚫
              </button>
              {a.perso && !compact && (
                <button type="button" aria-label={`Supprimer ${a.nom}`} onClick={() => supprimerAlimentPerso(a.id)} className="h-11 w-8 text-encre-3">
                  ✕
                </button>
              )}
            </li>
          )
        })}
        {!visibles.length && (
          <li className="py-4 text-center text-sm text-encre-2">
            {q.trim() ? `Pas de « ${q.trim()} » dans la liste.` : 'Rien ici pour l’instant.'}
          </li>
        )}
      </ul>

      {ajout ? (
        <FormulaireAliment nomInitial={q.trim()} onFini={() => (setAjout(false), setQ(''))} />
      ) : (
        <Bouton variante="doux" className="mt-3 w-full" onClick={() => setAjout(true)}>
          ➕ Ajouter {q.trim() ? `« ${q.trim()} »` : 'un aliment'}
        </Bouton>
      )}
    </div>
  )
}

function FormulaireAliment({ nomInitial, onFini }: { nomInitial: string; onFini: () => void }) {
  const [nom, setNom] = useState(nomInitial)
  const [emoji, setEmoji] = useState('')
  const [categorie, setCategorie] = useState<CategorieAliment>('autre')
  const [rayon, setRayon] = useState<Rayon>('epicerie-salee')
  const [unite, setUnite] = useState<Unite>('g')
  const [quantite, setQuantite] = useState('')
  const [prixTxt, setPrixTxt] = useState('')
  const [verdict, setVerdict] = useState<'adore' | 'jamais' | ''>('adore')
  const [erreur, setErreur] = useState('')

  async function enregistrer() {
    const q = Number(quantite.replace(',', '.')) || (unite === 'piece' ? 1 : unite === 'g' ? 500 : 1000)
    const p = Number(prixTxt.replace(',', '.'))
    const a = await ajouterAlimentPerso({ nom, emoji, categorie, rayon, uniteBase: unite, quantiteFormat: q, prixFormat: p > 0 ? p : undefined, verdict: verdict || undefined })
    if (!a) return setErreur(nom.trim().length < 2 ? 'Donne-lui un nom.' : 'Cet aliment existe déjà : cherche-le dans la liste.')
    onFini()
  }

  const champ = 'min-h-11 w-full rounded-xl bg-surface-2 px-3'
  return (
    <Carte className="mt-3 space-y-2">
      <h3 className="font-bold">Nouvel aliment</h3>
      <div className="flex gap-2">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🍽️" aria-label="Emoji (facultatif)" className="min-h-11 w-14 rounded-xl bg-surface-2 text-center" />
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (ex. pesto rosso)" aria-label="Nom de l'aliment" className={champ} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieAliment)} aria-label="Famille" className={champ}>
          {CATEGORIES_ALIMENT.map((c) => <option key={c} value={c}>{CATEGORIE_LIBELLES[c]}</option>)}
        </select>
        <select value={rayon} onChange={(e) => setRayon(e.target.value as Rayon)} aria-label="Rayon du magasin" className={champ}>
          {RAYONS.map((r) => <option key={r} value={r}>{RAYON_LIBELLES[r]}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <select value={unite} onChange={(e) => setUnite(e.target.value as Unite)} aria-label="Unité" className={champ}>
          <option value="g">grammes</option>
          <option value="ml">ml</option>
          <option value="piece">pièces</option>
        </select>
        <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder={unite === 'piece' ? '1' : unite === 'g' ? '500' : '1000'} aria-label="Quantité par paquet" className={champ} />
        <input inputMode="decimal" value={prixTxt} onChange={(e) => setPrixTxt(e.target.value)} placeholder="Prix €" aria-label="Prix du paquet (facultatif)" className={champ} />
      </div>
      <div className="flex gap-2" role="group" aria-label="Ton avis">
        {([['adore', '❤️ Coup de cœur'], ['jamais', '🚫 Banni'], ['', 'Neutre']] as const).map(([v, l]) => (
          <button key={l} type="button" aria-pressed={verdict === v} onClick={() => setVerdict(v)}
            className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${verdict === v ? 'bg-cta text-cta-texte' : 'bg-surface-2'}`}>
            {l}
          </button>
        ))}
      </div>
      {erreur && <p role="alert" className="text-sm text-rouge">{erreur}</p>}
      <div className="flex gap-2">
        <Bouton className="flex-1" onClick={enregistrer}>Ajouter</Bouton>
        <Bouton variante="doux" onClick={onFini}>Annuler</Bouton>
      </div>
      <p className="text-xs text-encre-3">Il apparaîtra dans le swipe, la liste de courses, le stock, et dans les recettes que l’IA te propose.</p>
    </Carte>
  )
}
