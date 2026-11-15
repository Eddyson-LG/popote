/**
 * Fiche produit après un scan : nom, photo, Nutri-Score, catégorie, et trois actions
 * (goût, ajout au stock, ajout à la liste). Produit inconnu ou hors ligne → saisie du nom.
 */
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Aliment, Produit, Verdict } from '@/types'
import { db } from '@/lib/db'
import { semaineActive } from '@/lib/dates'
import { quantite } from '@/lib/format'
import { ajouterArticle, enregistrerGout, regenererListe } from '@/lib/contexte'
import { Bouton, Pastille } from '@/ui'
import { enregistrerProduitManuel, rechercherProduitDetaille, type ResultatRecherche } from './off'
import { EMPLACEMENT_LIBELLES, ajouterAuStock, itemDepuisProduit } from './inventaire'

const TON_NUTRI: Record<NonNullable<Produit['nutriscore']>, 'vert' | 'orange' | 'rouge' | 'neutre'> = {
  a: 'vert',
  b: 'vert',
  c: 'neutre',
  d: 'orange',
  e: 'rouge',
}

export function PastilleNutriscore({ note }: { note: NonNullable<Produit['nutriscore']> }) {
  return (
    <span aria-label={`Nutri-Score ${note.toUpperCase()}`}>
      <Pastille ton={TON_NUTRI[note]}>
        <span aria-hidden>Nutri-Score {note.toUpperCase()}</span>
      </Pastille>
    </span>
  )
}

type Chargement = { statut: 'chargement' } | ResultatRecherche

export function FicheProduit({ code, onFermer, onAjoute }: { code: string; onFermer: () => void; onAjoute?: (message: string) => void }) {
  const [etat, setEtat] = useState<Chargement>({ statut: 'chargement' })

  useEffect(() => {
    let actif = true
    rechercherProduitDetaille(code).then((r) => actif && setEtat(r))
    return () => {
      actif = false
    }
  }, [code])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fiche-titre" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onFermer}>
      <div className="pb-safe max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-fond px-4 pt-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="fiche-titre" className="text-xl font-extrabold">
            {etat.statut === 'trouve' ? 'Produit scanné' : etat.statut === 'chargement' ? 'Recherche…' : 'Produit à compléter'}
          </h2>
          <button type="button" onClick={onFermer} aria-label="Fermer la fiche" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-2xl">
            ×
          </button>
        </div>
        {etat.statut === 'chargement' && (
          <p role="status" className="py-8 text-center text-encre-2">
            On cherche le code {code} dans Open Food Facts…
          </p>
        )}
        {etat.statut === 'trouve' && <Contenu produit={etat.produit} onAjoute={onAjoute} onFermer={onFermer} />}
        {(etat.statut === 'inconnu' || etat.statut === 'hors-ligne' || etat.statut === 'limite') && (
          <SaisieManuelle code={code} raison={etat.statut} onEnregistre={(p) => setEtat({ statut: 'trouve', produit: p, depuisCache: true })} />
        )}
      </div>
    </div>
  )
}

function SaisieManuelle({ code, raison, onEnregistre }: { code: string; raison: 'inconnu' | 'hors-ligne' | 'limite'; onEnregistre: (p: Produit) => void }) {
  const [nom, setNom] = useState('')
  const textes = {
    inconnu: 'Ce produit n’est pas encore dans Open Food Facts.',
    'hors-ligne': 'Pas de connexion (ou Open Food Facts ne répond pas).',
    limite: 'Trop de scans en une minute : Open Food Facts limite les recherches.',
  }
  return (
    <form
      className="flex flex-col gap-3 pb-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!nom.trim()) return
        const aliments = await db.aliments.toArray()
        onEnregistre(await enregistrerProduitManuel(code, nom, aliments))
      }}
    >
      <p className="text-encre-2">
        {textes[raison]} Donne-lui un nom, on le retiendra pour la prochaine fois (code {code}).
      </p>
      <label htmlFor="nom-produit" className="font-semibold">
        Nom du produit
      </label>
      <input
        id="nom-produit"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Ex. : Lentilles corail bio"
        autoComplete="off"
        className="min-h-12 rounded-xl bg-surface px-4 text-base shadow-carte"
      />
      <Bouton type="submit" grand disabled={!nom.trim()}>
        Enregistrer
      </Bouton>
    </form>
  )
}

function Contenu({ produit, onAjoute, onFermer }: { produit: Produit; onAjoute?: (m: string) => void; onFermer: () => void }) {
  const gout = useLiveQuery(() => db.gouts.get(`produit:${produit.codeBarres}`), [produit.codeBarres])
  const aliment = useLiveQuery(async () => (produit.alimentId ? ((await db.aliments.get(produit.alimentId)) ?? null) : null), [produit.alimentId])
  const [message, setMessage] = useState('')
  const [imageOk, setImageOk] = useState(true)

  const voter = (v: Verdict) => enregistrerGout('produit', produit.codeBarres, { verdict: gout?.verdict === v ? null : v })

  const versStock = async () => {
    const item = itemDepuisProduit(produit, aliment ?? undefined)
    await ajouterAuStock(item)
    const m = `${produit.nom} ajouté au ${EMPLACEMENT_LIBELLES[item.emplacement].nom.toLowerCase()} 🧺`
    if (onAjoute) {
      onAjoute(m)
      onFermer()
    } else setMessage(m)
  }

  const versListe = async (a: Aliment) => {
    const semaine = semaineActive()
    try {
      let liste = await db.listes.get(semaine)
      if (!liste) liste = await regenererListe(semaine)
      if (liste.items.some((i) => i.id === a.id)) return setMessage(`${a.nom} est déjà dans ta liste.`)
      await ajouterArticle(semaine, a.id)
      setMessage(`${a.emoji} ${a.nom} ajouté à ta liste de la semaine.`)
    } catch {
      setMessage('Impossible de créer la liste pour l’instant (termine d’abord l’accueil de l’appli).')
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex gap-4">
        {produit.imageUrl && imageOk ? (
          <img
            src={produit.imageUrl}
            alt={`Photo de ${produit.nom}`}
            referrerPolicy="no-referrer"
            onError={() => setImageOk(false)}
            className="h-28 w-28 shrink-0 rounded-2xl bg-white object-contain"
          />
        ) : (
          <div aria-hidden className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-5xl">
            {aliment?.emoji ?? '📦'}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-lg font-bold break-words">{produit.nom}</p>
          {produit.marque && <p className="text-encre-2">{produit.marque}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {produit.nutriscore && <PastilleNutriscore note={produit.nutriscore} />}
            {produit.categorie && <Pastille>{produit.categorie}</Pastille>}
            {produit.quantiteNormalisee && <Pastille>{quantite(produit.quantiteNormalisee.quantite, produit.quantiteNormalisee.unite)}</Pastille>}
          </div>
          {aliment && (
            <p className="mt-2 text-sm text-encre-2">
              Correspond à {aliment.emoji} {aliment.nom}
            </p>
          )}
          {produit.source === 'manuel' && <p className="mt-1 text-xs text-encre-3">Saisi à la main</p>}
        </div>
      </div>

      <div role="group" aria-label="Ton avis sur ce produit" className="grid grid-cols-2 gap-2">
        <Bouton variante={gout?.verdict === 'aime' ? 'orange' : 'doux'} aria-pressed={gout?.verdict === 'aime'} onClick={() => voter('aime')}>
          👍 J’aime
        </Bouton>
        <Bouton variante={gout?.verdict === 'pas-aime' ? 'danger' : 'doux'} aria-pressed={gout?.verdict === 'pas-aime'} onClick={() => voter('pas-aime')}>
          👎 J’aime pas
        </Bouton>
      </div>

      <Bouton grand onClick={versStock}>
        Ajouter au stock
      </Bouton>
      {aliment ? (
        <Bouton grand variante="doux" onClick={() => versListe(aliment)}>
          Ajouter {aliment.nom.toLowerCase()} à la liste
        </Bouton>
      ) : (
        <p className="text-sm text-encre-3">
          Ce produit n’est relié à aucun aliment de base : la liste de courses ne peut pas encore l’accueillir.
        </p>
      )}
      {message && (
        <p role="status" className="rounded-carte bg-vert-doux p-3 font-semibold text-vert">
          {message}
        </p>
      )}
    </div>
  )
}
