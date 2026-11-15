/**
 * Prix et comparateur : où ta liste coûte le moins cher, saisie rapide d'un prix,
 * promos de la semaine, historique par produit. Chaque prix affiche sa source et son âge.
 */
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import type { Aliment } from '@/types'
import { db } from '@/lib/db'
import { age, ajouterJours, isoJour, semaineActive } from '@/lib/dates'
import { prix, quantite } from '@/lib/format'
import { LIBELLE_SOURCE } from '@/lib/prix'
import { chargerResolveurPrix, regenererListe } from '@/lib/contexte'
import { useReglages } from '@/lib/hooks'
import { Bouton, Carte, Page, Pastille } from '@/ui'
import { comparerMagasins, meilleureRepartition } from './comparateur'
import { rafraichirPrixSiBesoin } from './rafraichir'

const norme = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function RechercheAliment({ onChoix, placeholder = 'Chercher un aliment' }: { onChoix: (a: Aliment) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const aliments = useLiveQuery(() => db.aliments.toArray(), [])
  const res = useMemo(() => {
    if (q.trim().length < 2 || !aliments) return []
    const t = norme(q.trim())
    return aliments.filter((a) => norme(a.nom).includes(t) || a.synonymes?.some((s) => norme(s).includes(t))).slice(0, 6)
  }, [q, aliments])
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-h-11 w-full rounded-xl bg-surface-2 px-3" />
      {res.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {res.map((a) => (
            <li key={a.id}>
              <Bouton variante="doux" onClick={() => (onChoix(a), setQ(''))}>
                {a.emoji} {a.nom}
              </Bouton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Prix() {
  const reglages = useReglages()
  const [maj, setMaj] = useState<string | null>(null)
  const donnees = useLiveQuery(async () => {
    const [liste, magasins, aliments, resolveur, promos] = await Promise.all([
      db.listes.get(semaineActive()),
      db.magasins.filter((m) => m.actif).toArray(),
      db.aliments.toArray(),
      chargerResolveurPrix(),
      db.promos.where('fin').aboveOrEqual(isoJour()).toArray(),
    ])
    return { liste, magasins, alimentsParId: new Map(aliments.map((a) => [a.id, a])), resolveur, promos }
  }, [])

  if (!donnees || !reglages) return null
  const { liste, magasins, alimentsParId, resolveur, promos } = donnees
  const totaux = liste ? comparerMagasins(liste.items, magasins, alimentsParId, resolveur) : []
  const repartition = liste ? meilleureRepartition(liste.items, magasins, alimentsParId, resolveur, reglages.seuilRepartition) : null
  const couvertureMax = Math.max(0, ...totaux.map((t) => t.couverture))

  return (
    <Page titre="Prix" sousTitre="Où ta liste coûte le moins cher.">
      <Carte className="mb-4">
        <h2 className="mb-2 text-lg font-bold">Comparateur</h2>
        {!liste || !totaux.length ? (
          <p className="text-encre-2">Prépare ta semaine pour comparer ta liste.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {totaux.map((t, i) => (
                <li key={t.magasin.id} className="flex items-center gap-3">
                  <span className="flex-1 font-semibold">
                    {t.magasin.enseigne} {t.magasin.ville && <span className="font-normal text-encre-3">· {t.magasin.ville}</span>}
                  </span>
                  <span className="text-right text-xs text-encre-3">
                    {Math.round(t.couverture * 100)} % prix du magasin
                    <br />
                    {t.datePlusAncienne ? `constatés, le plus vieux ${age(t.datePlusAncienne)}` : 'reste estimé'}
                  </span>
                  <span className={`titre text-xl font-extrabold ${i === 0 ? 'text-orange-texte' : ''}`}>{prix(t.total)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-encre-3">Les articles sans prix du magasin sont estimés ; chaque article affiche sa source et son âge dans la liste.</p>
            {couvertureMax < 0.2 && (
              <p className="mt-3 text-sm text-encre-2">
                Pour l’instant je connais peu de vrais prix dans tes magasins, donc les totaux se ressemblent. Scanne un ticket après tes courses : je saurai où c’est moins cher.
              </p>
            )}
            {repartition && (
              <div className="mt-3 rounded-2xl bg-vert-doux p-3 text-sm text-vert">
                <strong>Astuce :</strong> en répartissant entre {repartition.magasins[0].enseigne} et {repartition.magasins[1].enseigne}, tu paierais {prix(repartition.total)}, soit {prix(repartition.economie)} d’économie.
              </div>
            )}
            {totaux[0] && (
              <Bouton variante="doux" className="mt-3 w-full" onClick={() => regenererListe(semaineActive(), totaux[0].magasin.id)}>
                Utiliser les prix de {totaux[0].magasin.enseigne} pour ma liste
              </Bouton>
            )}
          </>
        )}
      </Carte>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link to="/plus/tickets" className="block">
          <Carte className="h-full text-center">
            <div className="text-3xl" aria-hidden>🧾</div>
            <div className="font-semibold">Scanner un ticket</div>
          </Carte>
        </Link>
        <Carte className="text-center">
          <div className="text-3xl" aria-hidden>🔄</div>
          <button
            type="button"
            className="min-h-11 font-semibold"
            onClick={async () => {
              setMaj('…')
              const n = await rafraichirPrixSiBesoin(true)
              setMaj(n ? `${n} prix Open Prices récupérés` : 'Rien de nouveau (ou pas de réseau)')
            }}
          >
            Rafraîchir les prix
          </button>
          <div className="text-xs text-encre-3" aria-live="polite">{maj ?? (reglages.prixMajLe ? `màj ${age(reglages.prixMajLe)}` : 'jamais')}</div>
        </Carte>
      </div>

      <SaisiePrix />
      <Promos promos={promos} alimentsParId={alimentsParId} />
      <Historique />

      <p className="mt-6 text-xs text-encre-3">
        Prix collaboratifs : Open Prices (Open Food Facts), licence ODbL. Les prix « estimés » viennent d’une table de prix moyens et sont indicatifs.
      </p>
    </Page>
  )
}

function SaisiePrix() {
  const magasins = useLiveQuery(() => db.magasins.filter((m) => m.actif).toArray(), [])
  const [aliment, setAliment] = useState<Aliment | null>(null)
  const [magasin, setMagasin] = useState('')
  const [montant, setMontant] = useState('')
  const [qte, setQte] = useState('')
  const [ok, setOk] = useState('')

  async function enregistrer() {
    const p = Number(montant.replace(',', '.'))
    const q = Number(qte.replace(',', '.')) || aliment?.formatVente.quantite || 0
    if (!aliment || !(p > 0) || !(q > 0)) return
    await db.prix.add({ cle: aliment.id, alimentId: aliment.id, magasinId: magasin || undefined, prix: p, quantite: q, unite: aliment.uniteBase, source: 'manuel', date: new Date().toISOString() })
    setOk(`${aliment.nom} : ${prix(p)} enregistré ✅`)
    setAliment(null)
    setMontant('')
    setQte('')
  }

  return (
    <Carte className="mb-4">
      <h2 className="mb-2 text-lg font-bold">Noter un prix en magasin</h2>
      {aliment ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-semibold">
            <span>{aliment.emoji} {aliment.nom}</span>
            <button type="button" className="min-h-11 px-2 text-sm text-encre-2" onClick={() => setAliment(null)}>Changer</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Prix €" aria-label="Prix en euros" className="min-h-11 rounded-xl bg-surface-2 px-3" />
            <input inputMode="decimal" value={qte} onChange={(e) => setQte(e.target.value)} placeholder={`${aliment.formatVente.quantite} ${aliment.uniteBase === 'piece' ? 'pièce(s)' : aliment.uniteBase}`} aria-label={`Quantité en ${aliment.uniteBase}`} className="min-h-11 rounded-xl bg-surface-2 px-3" />
          </div>
          <select value={magasin} onChange={(e) => setMagasin(e.target.value)} aria-label="Magasin" className="min-h-11 w-full rounded-xl bg-surface-2 px-3">
            <option value="">Magasin ?</option>
            {magasins?.map((m) => <option key={m.id} value={m.id}>{m.enseigne} {m.ville}</option>)}
          </select>
          <Bouton className="w-full" onClick={enregistrer}>Enregistrer</Bouton>
        </div>
      ) : (
        <RechercheAliment onChoix={setAliment} />
      )}
      {ok && <p role="status" className="mt-2 text-sm text-vert">{ok}</p>}
    </Carte>
  )
}

function Promos({ promos, alimentsParId }: { promos: import('@/types').Promo[]; alimentsParId: Map<string, Aliment> }) {
  const magasins = useLiveQuery(() => db.magasins.filter((m) => m.actif).toArray(), [])
  const [aliment, setAliment] = useState<Aliment | null>(null)
  const [magasin, setMagasin] = useState('')
  const [montant, setMontant] = useState('')
  const [normal, setNormal] = useState('')
  const [fin, setFin] = useState(ajouterJours(isoJour(), 6))

  async function ajouter() {
    const p = Number(montant.replace(',', '.'))
    if (!aliment || !magasin || !(p > 0)) return
    const pn = Number(normal.replace(',', '.'))
    await db.promos.add({ magasinId: magasin, alimentId: aliment.id, libelle: aliment.nom, prix: p, prixNormal: pn > 0 ? pn : undefined, fin, ajouteLe: new Date().toISOString() })
    setAliment(null)
    setMontant('')
    setNormal('')
    regenererListe(semaineActive())
  }

  return (
    <Carte className="mb-4">
      <h2 className="mb-1 text-lg font-bold">Promos de la semaine</h2>
      <p className="mb-2 text-sm text-encre-2">Repérées dans un catalogue ? Ajoute-les : si t’aimes le produit, il remonte dans ton planning.</p>
      {promos.length > 0 && (
        <ul className="mb-3 space-y-1">
          {promos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{alimentsParId.get(p.alimentId ?? '')?.emoji} {p.libelle} · {magasins?.find((m) => m.id === p.magasinId)?.enseigne}</span>
              <strong className="text-orange-texte">{prix(p.prix)}</strong>
              <Pastille>jusqu’au {p.fin.split('-').reverse().slice(0, 2).join('/')}</Pastille>
              <button type="button" aria-label={`Supprimer la promo ${p.libelle}`} className="h-11 w-11 text-encre-3" onClick={() => db.promos.delete(p.id!)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {aliment ? (
        <div className="space-y-2">
          <div className="font-semibold">{aliment.emoji} {aliment.nom} <span className="font-normal text-encre-3">({aliment.formatVente.libelle})</span></div>
          <div className="grid grid-cols-2 gap-2">
            <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Prix promo €" aria-label="Prix promo" className="min-h-11 rounded-xl bg-surface-2 px-3" />
            <input inputMode="decimal" value={normal} onChange={(e) => setNormal(e.target.value)} placeholder="Prix normal €" aria-label="Prix normal" className="min-h-11 rounded-xl bg-surface-2 px-3" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={magasin} onChange={(e) => setMagasin(e.target.value)} aria-label="Magasin de la promo" className="min-h-11 rounded-xl bg-surface-2 px-3">
              <option value="">Magasin ?</option>
              {magasins?.map((m) => <option key={m.id} value={m.id}>{m.enseigne}</option>)}
            </select>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} aria-label="Fin de la promo" className="min-h-11 rounded-xl bg-surface-2 px-3" />
          </div>
          <Bouton className="w-full" onClick={ajouter} disabled={!magasin || !montant}>Ajouter la promo</Bouton>
        </div>
      ) : (
        <RechercheAliment onChoix={setAliment} placeholder="+ Ajouter une promo" />
      )}
    </Carte>
  )
}

function Historique() {
  const [aliment, setAliment] = useState<Aliment | null>(null)
  const obs = useLiveQuery(async () => (aliment ? (await db.prix.where('alimentId').equals(aliment.id).sortBy('date')) : []), [aliment])
  const magasins = useLiveQuery(() => db.magasins.toArray(), [])
  const points = (obs ?? []).map((o) => ({ ...o, unitaire: (o.prix / o.quantite) * (o.unite === 'piece' ? 1 : 1000) }))
  const max = Math.max(1, ...points.map((p) => p.unitaire))
  const min = Math.min(...points.map((p) => p.unitaire), max)
  const W = 300
  const H = 80
  const x = (i: number) => (points.length < 2 ? W / 2 : (i / (points.length - 1)) * (W - 16) + 8)
  const y = (v: number) => H - 8 - ((v - min) / Math.max(0.01, max - min)) * (H - 16)
  const unite = aliment?.uniteBase === 'piece' ? '/pièce' : aliment?.uniteBase === 'ml' ? '/L' : '/kg'
  return (
    <Carte>
      <h2 className="mb-2 text-lg font-bold">Historique d’un prix</h2>
      {aliment ? (
        <>
          <div className="mb-2 flex items-center justify-between font-semibold">
            <span>{aliment.emoji} {aliment.nom}</span>
            <button type="button" className="min-h-11 px-2 text-sm text-encre-2" onClick={() => setAliment(null)}>Changer</button>
          </div>
          {points.length === 0 ? (
            <p className="text-sm text-encre-2">Aucun prix constaté pour l’instant.</p>
          ) : (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Évolution du prix de ${aliment.nom}`}>
                <polyline fill="none" stroke="var(--c-orange)" strokeWidth={2.5} strokeLinejoin="round" points={points.map((p, i) => `${x(i)},${y(p.unitaire)}`).join(' ')} />
                {points.map((p, i) => <circle key={p.id} cx={x(i)} cy={y(p.unitaire)} r={3.5} fill="var(--c-orange)" />)}
              </svg>
              <ul className="mt-2 space-y-1 text-sm">
                {[...points].reverse().slice(0, 6).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="text-encre-2">{magasins?.find((m) => m.id === p.magasinId)?.enseigne ?? (p.portee === 'national' ? 'France' : '—')} · {LIBELLE_SOURCE[p.source]} · {age(p.date)}</span>
                    <span className="font-semibold">{prix(p.unitaire)}{unite}{p.unite !== 'piece' && <span className="font-normal text-encre-3"> ({prix(p.prix)} les {quantite(p.quantite, p.unite)})</span>}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <RechercheAliment onChoix={setAliment} />
      )}
    </Carte>
  )
}
