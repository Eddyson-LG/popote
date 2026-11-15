/**
 * Liste de courses : tri par rayon, total et jauge en direct, substitutions moins chères
 * en un tap, saisie du prix payé, mode magasin (gros boutons, écran allumé, hors ligne).
 */
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { ItemListe, Rayon } from '@/types'
import { RAYONS, RAYON_LIBELLES } from '@/types'
import { db } from '@/lib/db'
import { semaineActive, age } from '@/lib/dates'
import { formatAchat, prix, quantite } from '@/lib/format'
import { sourceEtAge } from '@/lib/prix'
import { ajouterArticle, chargerGouts, chargerResolveurPrix, depenseValideeSemaine, jEnAiDeja, majArticle, regenererListe, substituer, validerCourses } from '@/lib/contexte'
import { substitutions, totaux } from './generer'
import { Bouton, Carte, Jauge, Page, Pastille, Vide } from '@/ui'
import { useReglages } from '@/lib/hooks'
import { ZoneExport } from './ZoneExport'

export default function Liste() {
  const semaine = semaineActive()
  const reglages = useReglages()
  const liste = useLiveQuery(() => db.listes.get(semaine), [semaine])
  const nbRepas = useLiveQuery(() => db.repas.where('semaine').equals(semaine).count(), [semaine])
  const magasins = useLiveQuery(() => db.magasins.filter((m) => m.actif).toArray(), [])
  const [magasin, setMagasin] = useState(false)
  const [message, setMessage] = useState('')
  // Déjà payé cette semaine (listes validées, tickets) : compte dans la jauge.
  const paye = useLiveQuery(() => depenseValideeSemaine(semaine), [semaine]) ?? 0

  useEffect(() => {
    // Liste absente alors qu'un planning existe : on la génère.
    if (liste === undefined && nbRepas) regenererListe(semaine)
  }, [liste, nbRepas, semaine])

  if (!reglages || nbRepas === undefined) return null
  if (!liste || (!liste.items.length && !liste.validee))
    return (
      <Page titre="Ta liste">
        <Vide emoji="🛒" titre="Pas encore de liste" texte="Elle se remplit toute seule à partir de ta semaine." action={<Link to="/semaine"><Bouton>Préparer ma semaine</Bouton></Link>} />
      </Page>
    )

  // Toute la liste compte, cochée ou non : les articles cochés n'en sortent qu'à la validation (ils passent alors dans « déjà payé »).
  const t = totaux(liste.items)
  const engage = Math.round((paye + t.total) * 100) / 100
  const depasse = engage > reglages.budgetHebdo
  const valider = async () => {
    const r = await validerCourses(semaine)
    setMessage(`Courses validées : ${r.articles} articles, ${prix(r.montant)}. Tout est rangé dans ton stock 🧺`)
  }

  if (magasin) return <ModeMagasin items={liste.items} semaine={semaine} onQuitter={() => setMagasin(false)} onValider={async () => (await valider(), setMagasin(false))} />

  return (
    <Page
      titre="Ta liste"
      sousTitre={liste.validee && !liste.items.length ? 'Courses faites ✅' : `${liste.items.filter((i) => !i.coche).length} articles`}
      action={liste.items.length > 0 && <Bouton onClick={() => setMagasin(true)}>🏪 Mode magasin</Bouton>}
    >
      <Carte className="mb-4">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <div className={`titre text-4xl font-extrabold ${depasse ? 'text-rouge' : 'text-orange-texte'}`}>{prix(engage)}</div>
            <div className="text-sm text-encre-2">
              sur {prix(reglages.budgetHebdo)} de budget{paye > 0 && ` · dont ${prix(paye)} déjà payés`}
            </div>
          </div>
          {!depasse && <Pastille ton="vert">{prix(reglages.budgetHebdo - engage)} de marge</Pastille>}
        </div>
        <Jauge valeur={engage} max={reglages.budgetHebdo} libelle="Budget de la semaine" />
        {t.placard > 0 && <p className="mt-2 text-xs text-encre-2">Dont {prix(t.placard)} de placard : touche « J’en ai déjà » sur ce que t’as.</p>}
        {magasins && magasins.length > 1 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-encre-2">Prix pour</span>
            <select
              value={liste.magasinId ?? ''}
              onChange={(e) => regenererListe(semaine, e.target.value || undefined)}
              className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3 font-semibold"
            >
              <option value="">Tous magasins</option>
              {magasins.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.enseigne} {m.ville && `(${m.ville})`}
                </option>
              ))}
            </select>
          </label>
        )}
      </Carte>

      {depasse && <Substitutions semaine={semaine} items={liste.items} />}
      {message && <p role="status" className="mb-4 rounded-carte bg-vert-doux p-3 font-semibold text-vert">{message}</p>}

      <ListeParRayon items={liste.items} semaine={semaine} />

      <AjoutArticle semaine={semaine} />

      <div className="mt-6 flex flex-col gap-2">
        {liste.items.some((i) => i.coche) && (
          <Bouton
            grand
            variante="orange"
            onClick={valider}
          >
            Valider les courses ({liste.items.filter((i) => i.coche).length})
          </Bouton>
        )}
        <ZoneExport liste={liste} />
        <Bouton variante="fantome" onClick={() => regenererListe(semaine)}>
          Recalculer la liste
        </Bouton>
      </div>
    </Page>
  )
}

function grouper(items: ItemListe[]) {
  const groupes = new Map<Rayon | 'placard', ItemListe[]>()
  for (const i of items) {
    const k = i.placard ? 'placard' : i.rayon
    groupes.set(k, [...(groupes.get(k) ?? []), i])
  }
  return [...RAYONS, 'placard' as const].filter((r) => groupes.has(r)).map((r) => ({ rayon: r, items: groupes.get(r)! }))
}

function ListeParRayon({ items, semaine }: { items: ItemListe[]; semaine: string }) {
  return (
    <div className="space-y-5">
      {grouper(items).map(({ rayon, items }) => (
        <section key={rayon} aria-labelledby={`rayon-${rayon}`}>
          <h2 id={`rayon-${rayon}`} className="mb-2 text-lg font-bold">
            {rayon === 'placard' ? '🧂 Placard — vérifie si t’en as' : RAYON_LIBELLES[rayon]}
          </h2>
          <ul className="space-y-2">
            {items.map((i) => (
              <LigneArticle key={i.id} item={i} semaine={semaine} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Coche({ coche, grand = false }: { coche: boolean; grand?: boolean }) {
  const reduit = useReducedMotion()
  const taille = grand ? 'h-10 w-10' : 'h-7 w-7'
  return (
    <motion.span
      aria-hidden
      animate={coche && !reduit ? { scale: [1, 1.25, 1] } : { scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${taille} shrink-0 items-center justify-center rounded-full border-2 ${coche ? 'border-vert bg-vert text-sur-vert' : 'border-encre-3'}`}
    >
      {coche && (
        <svg viewBox="0 0 24 24" className="h-2/3 w-2/3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={reduit ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.2 }} />
        </svg>
      )}
    </motion.span>
  )
}

function LigneArticle({ item: i, semaine }: { item: ItemListe; semaine: string }) {
  const [prixOuvert, setPrixOuvert] = useState(false)
  const [saisie, setSaisie] = useState('')
  return (
    <li className={`rounded-carte bg-surface p-3 shadow-carte ${i.coche ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={i.coche}
          aria-label={`${i.nom}, ${formatAchat(i.nbFormats, i.libelleFormat)}`}
          onClick={() => {
            majArticle(semaine, i.id, { coche: !i.coche })
            if (!i.coche) setPrixOuvert(true)
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Coche coche={i.coche} />
          <span aria-hidden className="text-2xl">{i.emoji}</span>
          <span className="min-w-0">
            <span className={`block font-semibold ${i.coche ? 'line-through' : ''}`}>{i.nom}</span>
            <span className="block text-xs text-encre-2">
              {formatAchat(i.nbFormats, i.libelleFormat)} · besoin {quantite(i.quantiteBesoin, i.unite)}
              {i.raison === 'habitude' && ' · habituel'}
              {i.raison === 'objectif' && ' · pour tes goûters'}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="min-h-11 text-right"
          onClick={() => i.coche && setPrixOuvert(true)}
          aria-label={i.coche ? `Saisir le prix payé pour ${i.nom}` : undefined}
          disabled={!i.coche}
        >
          <div className="font-bold">{prix(i.prixPaye ?? i.prixEstime)}</div>
          <div className="text-xs text-encre-3">{i.prixPaye !== undefined ? 'payé' : sourceEtAge(i.sourcePrix, i.datePrix, i.detailPrix, age)}</div>
        </button>
      </div>
      {i.placard && !i.coche && (
        <button type="button" onClick={() => jEnAiDeja(semaine, i)} className="mt-2 min-h-11 w-full rounded-full bg-surface-2 text-sm font-semibold">
          J’en ai déjà (−{prix(i.prixEstime)})
        </button>
      )}
      {prixOuvert && i.coche && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = Number(saisie.replace(',', '.'))
            if (v > 0) majArticle(semaine, i.id, { prixPaye: Math.round(v * 100) / 100 })
            setPrixOuvert(false)
          }}
        >
          <input
            inputMode="decimal"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={`Prix payé (facultatif) · ${prix(i.prixEstime)}`}
            aria-label={`Prix payé pour ${i.nom}`}
            className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3"
          />
          <Bouton type="submit" variante="doux">OK</Bouton>
        </form>
      )}
    </li>
  )
}

function Substitutions({ semaine, items }: { semaine: string; items: ItemListe[] }) {
  const reglages = useReglages()
  const suggestions = useLiveQuery(async () => {
    if (!reglages) return []
    const [aliments, prixR, gouts] = await Promise.all([db.aliments.toArray(), chargerResolveurPrix(), chargerGouts()])
    const ctx = { repas: [], recettes: new Map(), alimentsParId: new Map(aliments.map((a) => [a.id, a])), stock: [], achats: [], prix: prixR, gouts, reglages }
    return items
      .filter((i) => !i.placard && !i.coche)
      .sort((a, b) => b.prixEstime - a.prixEstime)
      .slice(0, 6)
      .flatMap((i) => substitutions(i, ctx, 1).map((s) => ({ item: i, ...s })))
      .slice(0, 3)
  }, [items, reglages])
  if (!suggestions?.length) return null
  return (
    <Carte className="mb-4 border-2 border-rouge-doux">
      <h2 className="text-lg font-bold">Budget dépassé : on rabote ?</h2>
      <ul className="mt-2 space-y-2">
        {suggestions.map((s) => (
          <li key={s.item.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">
              {s.item.emoji} {s.item.nom} → {s.aliment.emoji} <strong>{s.aliment.nom}</strong>
            </span>
            <Bouton variante="doux" onClick={() => substituer(semaine, s.item.alimentId!, s.aliment.id)}>
              −{prix(s.economie)}
            </Bouton>
          </li>
        ))}
      </ul>
    </Carte>
  )
}

function AjoutArticle({ semaine }: { semaine: string }) {
  const [q, setQ] = useState('')
  const aliments = useLiveQuery(() => db.aliments.toArray(), [])
  const resultats = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2 || !aliments) return []
    const norme = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return aliments.filter((a) => norme(a.nom).includes(norme(t)) || a.synonymes?.some((s) => norme(s).includes(norme(t)))).slice(0, 6)
  }, [q, aliments])
  return (
    <div className="mt-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="+ Ajouter un article"
        aria-label="Ajouter un article à la liste"
        className="min-h-12 w-full rounded-full bg-surface px-5 shadow-carte"
      />
      {resultats.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {resultats.map((a) => (
            <li key={a.id}>
              <Bouton variante="doux" onClick={() => (ajouterArticle(semaine, a.id), setQ(''))}>
                {a.emoji} {a.nom}
              </Bouton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Mode magasin : gros boutons, écran qui reste allumé, 100 % hors ligne (tout est local). */
function ModeMagasin({ items, semaine, onQuitter, onValider }: { items: ItemListe[]; semaine: string; onQuitter: () => void; onValider: () => void }) {
  useEffect(() => {
    let verrou: WakeLockSentinel | null = null
    const demander = async () => {
      try {
        verrou = (await navigator.wakeLock?.request('screen')) ?? null
      } catch {
        // Wake Lock non disponible : pas grave.
      }
    }
    demander()
    const auRetour = () => document.visibilityState === 'visible' && demander()
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      document.removeEventListener('visibilitychange', auRetour)
      verrou?.release().catch(() => {})
    }
  }, [])
  const restants = items.filter((i) => !i.coche)
  const t = totaux(items)
  return (
    <main className="pt-safe mx-auto max-w-xl px-4 pb-52">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-fond/95 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-2xl font-extrabold">🏪 En magasin</h1>
          <p className="text-sm text-encre-2">
            {restants.length} restants · panier {prix(t.coche)}
          </p>
        </div>
        <Bouton variante="doux" onClick={onQuitter}>Terminer</Bouton>
      </header>
      {grouper(items).map(({ rayon, items }) => (
        <section key={rayon} className="mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-3">{rayon === 'placard' ? 'Placard' : RAYON_LIBELLES[rayon]}</h2>
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={i.coche}
                  onClick={() => majArticle(semaine, i.id, { coche: !i.coche })}
                  className={`flex min-h-16 w-full items-center gap-4 rounded-carte p-4 text-left text-lg shadow-carte ${i.coche ? 'bg-vert-doux' : 'bg-surface'}`}
                >
                  <Coche coche={i.coche} grand />
                  <span className="flex-1">
                    <span className={`block font-bold ${i.coche ? 'line-through opacity-60' : ''}`}>
                      {i.emoji} {i.nom}
                    </span>
                    <span className="block text-sm text-encre-2">
                      {formatAchat(i.nbFormats, i.libelleFormat)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{prix(i.prixPaye ?? i.prixEstime)}</span>
                    <span className="block text-xs text-encre-3">{sourceEtAge(i.sourcePrix, i.datePrix, i.detailPrix, age)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {items.some((i) => i.coche) && (
        // Juste au-dessus de la barre d’onglets (≈ 3,5 rem + zone de la barre home).
        <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 bg-fond/95 px-4 pt-3 backdrop-blur">
          <div className="mx-auto max-w-xl pb-2">
            <Bouton grand variante="orange" onClick={onValider}>
              Valider les courses ({items.filter((i) => i.coche).length} · {prix(t.coche)})
            </Bouton>
          </div>
        </div>
      )}
    </main>
  )
}
