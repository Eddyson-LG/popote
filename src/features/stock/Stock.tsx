/**
 * Écran Stock : inventaire par emplacement, alerte « à consommer vite », modification,
 * ajout par recherche d'aliment ou par scan de code-barres.
 */
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Aliment, Emplacement, StockItem } from '@/types'
import { db } from '@/lib/db'
import { isoJour } from '@/lib/dates'
import { quantite } from '@/lib/format'
import { Bouton, Carte, Page, Pastille, Vide } from '@/ui'
import { rechercherAliments } from './off'
import { ScannerCodeBarres } from './ScannerCodeBarres'
import { FicheProduit } from './FicheProduit'
import {
  EMPLACEMENTS,
  EMPLACEMENT_LIBELLES,
  aConsommerVite,
  ajouterAuStock,
  effacerPeremption,
  etatPeremption,
  grouperParEmplacement,
  itemDepuisAliment,
  libellePeremption,
  majStock,
  supprimerStock,
} from './inventaire'

export default function Stock() {
  const items = useLiveQuery(() => db.stock.toArray(), [])
  const aliments = useLiveQuery(() => db.aliments.toArray(), [])
  const [scanner, setScanner] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const parId = useMemo(() => new Map((aliments ?? []).map((a) => [a.id, a])), [aliments])

  if (!items || !aliments) return null
  const aujourdhui = isoJour()
  const urgents = aConsommerVite(items, aujourdhui)

  return (
    <Page
      titre="Stock"
      sousTitre={items.length ? `${items.length} produit${items.length > 1 ? 's' : ''}${urgents.length ? ` · ${urgents.length} à consommer vite` : ''}` : undefined}
      action={<Bouton onClick={() => setScanner(true)}>📷 Scanner</Bouton>}
    >
      <AjoutAliment aliments={aliments} onAjoute={setMessage} />

      {message && (
        <p role="status" className="mt-3 rounded-carte bg-vert-doux p-3 font-semibold text-vert">
          {message}
        </p>
      )}

      {urgents.length > 0 && (
        <Carte className="mt-4 border-2 border-rouge-doux">
          <h2 className="font-bold">⏰ À consommer vite</h2>
          <p className="mt-1 text-sm text-encre-2">{urgents.map((i) => i.nom).join(', ')}</p>
        </Carte>
      )}

      {items.length === 0 ? (
        <Vide emoji="🧺" titre="Ton stock est vide" texte="Ajoute ce que tu as déjà : cherche un aliment ou scanne un code-barres. Les courses validées arrivent ici toutes seules." />
      ) : (
        <div className="mt-5 space-y-5">
          {grouperParEmplacement(items).map(({ emplacement, items }) => (
            <section key={emplacement} aria-labelledby={`emp-${emplacement}`}>
              <h2 id={`emp-${emplacement}`} className="mb-2 text-lg font-bold">
                <span aria-hidden>{EMPLACEMENT_LIBELLES[emplacement].emoji}</span> {EMPLACEMENT_LIBELLES[emplacement].nom}
              </h2>
              <ul className="space-y-2">
                {items.map((i) => (
                  <LigneStock key={i.id} item={i} aliment={i.alimentId ? parId.get(i.alimentId) : undefined} aujourdhui={aujourdhui} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {scanner && (
        <ScannerCodeBarres
          onDetect={(c) => {
            setScanner(false)
            setCode(c)
          }}
          onFermer={() => setScanner(false)}
        />
      )}
      {code && <FicheProduit code={code} onFermer={() => setCode(null)} onAjoute={setMessage} />}
    </Page>
  )
}

function AjoutAliment({ aliments, onAjoute }: { aliments: Aliment[]; onAjoute: (m: string) => void }) {
  const [q, setQ] = useState('')
  const resultats = useMemo(() => rechercherAliments(aliments, q, 6), [aliments, q])
  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="+ Ajouter un aliment (riz, œufs…)"
        aria-label="Chercher un aliment à ajouter au stock"
        autoComplete="off"
        className="min-h-12 w-full rounded-full bg-surface px-5 text-base shadow-carte"
      />
      {resultats.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Aliments trouvés">
          {resultats.map((a) => (
            <li key={a.id}>
              <Bouton
                variante="doux"
                onClick={async () => {
                  const item = itemDepuisAliment(a)
                  await ajouterAuStock(item)
                  setQ('')
                  onAjoute(`${a.emoji} ${a.nom} ajouté au ${EMPLACEMENT_LIBELLES[item.emplacement].nom.toLowerCase()}.`)
                }}
              >
                {a.emoji} {a.nom}
              </Bouton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function dateCourte(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function LigneStock({ item: i, aliment, aujourdhui }: { item: StockItem; aliment?: Aliment; aujourdhui: string }) {
  const [ouvert, setOuvert] = useState(false)
  const etat = etatPeremption(i, aujourdhui)
  const pas = i.unite === 'piece' ? 1 : 50
  const libellePas = i.unite === 'piece' ? '1 pièce' : `${pas} ${i.unite}`
  const id = i.id!

  return (
    <li className={`rounded-carte p-3 shadow-carte ${etat === 'vite' || etat === 'perime' ? 'bg-rouge-doux/40' : 'bg-surface'}`}>
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="flex min-h-11 w-full items-center gap-3 text-left">
        <span aria-hidden className="text-2xl">
          {aliment?.emoji ?? '📦'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words">{i.nom}</span>
          <span className="block text-xs text-encre-2">
            {quantite(i.quantite, i.unite)}
            {i.peremption && ` · ${dateCourte(i.peremption)} (${libellePeremption(i.peremption, aujourdhui)})`}
          </span>
        </span>
        {etat === 'vite' && <Pastille ton="rouge">À consommer vite</Pastille>}
        {etat === 'perime' && <Pastille ton="rouge">Périmé ?</Pastille>}
        <span className="sr-only">{ouvert ? 'Fermer' : 'Modifier'}</span>
      </button>

      {ouvert && (
        <div className="mt-3 space-y-3 border-t border-trait pt-3">
          <div className="flex items-center gap-2">
            <span className="w-24 text-sm text-encre-2" id={`q-${id}`}>
              Quantité
            </span>
            <Bouton variante="doux" aria-label={`Retirer ${libellePas}`} onClick={() => majStock(id, { quantite: Math.max(0, i.quantite - pas) })}>
              −
            </Bouton>
            <input
              inputMode="decimal"
              aria-labelledby={`q-${id}`}
              defaultValue={String(i.quantite).replace('.', ',')}
              key={i.quantite}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'))
                if (Number.isFinite(v) && v >= 0 && v !== i.quantite) majStock(id, { quantite: Math.round(v * 100) / 100 })
              }}
              className="min-h-11 w-20 rounded-xl bg-surface-2 px-2 text-center text-base"
            />
            <span className="text-sm text-encre-2">{i.unite === 'piece' ? 'pièce(s)' : i.unite}</span>
            <Bouton variante="doux" aria-label={`Ajouter ${libellePas}`} onClick={() => majStock(id, { quantite: i.quantite + pas })}>
              +
            </Bouton>
          </div>

          <label className="flex items-center gap-2">
            <span className="w-24 text-sm text-encre-2">À finir avant</span>
            <input
              type="date"
              value={i.peremption ?? ''}
              onChange={(e) => (e.target.value ? majStock(id, { peremption: e.target.value }) : effacerPeremption(id))}
              className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3 text-base"
            />
          </label>

          <div role="radiogroup" aria-label="Emplacement" className="grid grid-cols-3 gap-2">
            {EMPLACEMENTS.map((e: Emplacement) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={i.emplacement === e}
                onClick={() => majStock(id, { emplacement: e })}
                className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${i.emplacement === e ? 'bg-orange text-sur-orange' : 'bg-surface-2 text-encre'}`}
              >
                <span aria-hidden>{EMPLACEMENT_LIBELLES[e].emoji}</span> {EMPLACEMENT_LIBELLES[e].nom}
              </button>
            ))}
          </div>

          <div className="flex justify-between gap-2">
            <Bouton variante="danger" onClick={() => supprimerStock(id)}>
              Supprimer
            </Bouton>
            <Bouton variante="doux" onClick={() => setOuvert(false)}>
              OK
            </Bouton>
          </div>
        </div>
      )}
    </li>
  )
}
