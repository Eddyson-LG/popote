/**
 * Questionnaire de départ : une question par écran, barre de progression, 5 minutes max.
 * À la fin : réglages enregistrés, placard ajouté au stock, puis première session de swipe.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Equipement, FrequenceCourses, Jour, Magasin, Reglages, TagExclusion, TypeRepas } from '@/types'
import { db } from '@/lib/db'
import { magasinsParDefaut, reglagesParDefaut } from '@/lib/defaults'
import { isoJour } from '@/lib/dates'
import { JOURS_COURTS } from '@/lib/dates'
import { Bouton } from '@/ui'
import { chargerDemo } from '@/lib/demo'

const EQUIPEMENTS: { id: Equipement; label: string; emoji: string }[] = [
  { id: 'plaques', label: 'Plaques', emoji: '🔥' },
  { id: 'four', label: 'Four', emoji: '♨️' },
  { id: 'micro-ondes', label: 'Micro-ondes', emoji: '📡' },
  { id: 'airfryer', label: 'Airfryer', emoji: '🍟' },
  { id: 'mixeur', label: 'Mixeur', emoji: '🌀' },
]

const REPAS: { type: TypeRepas; label: string; aide: string }[] = [
  { type: 'petit-dejeuner', label: 'Petits-déj', aide: 'Des alternatives rapides à la tartine de Nutella.' },
  { type: 'gouter', label: 'Goûters', aide: 'Peu sucrés, pas chers.' },
  { type: 'diner', label: 'Dîners', aide: 'Les soirs où tu ne bosses pas.' },
  { type: 'dejeuner', label: 'Midis', aide: 'En semaine tu manges au CROUS : coche le week-end.' },
  { type: 'gamelle', label: 'Gamelles', aide: 'Les soirs de service, à la place du sandwich à 5 €.' },
]

const EXCLUSIONS: { tag: TagExclusion; label: string }[] = [
  { tag: 'fromage', label: '🧀 Fromage' },
  { tag: 'puree', label: '🥔 Purée' },
  { tag: 'soupe', label: '🍲 Soupe' },
  { tag: 'porc', label: '🐖 Porc' },
  { tag: 'poisson', label: '🐟 Poisson' },
  { tag: 'oeuf', label: '🥚 Œufs' },
]

const PLACARD = ['huile-olive', 'huile-tournesol', 'sel', 'poivre', 'herbes-provence', 'cumin', 'curry', 'paprika', 'sauce-soja', 'moutarde', 'vinaigre-balsamique', 'concentre-tomate', 'farine', 'sucre']

export default function Onboarding() {
  const navigate = useNavigate()
  const reduit = useReducedMotion()
  const [etape, setEtape] = useState(0)
  const [r, setR] = useState<Reglages>(() => ({ ...reglagesParDefaut() }))
  const [magasins, setMagasins] = useState<Magasin[]>(magasinsParDefaut)
  const [placard, setPlacard] = useState<string[]>(['huile-olive', 'sel', 'poivre'])
  const [nouveauMagasin, setNouveauMagasin] = useState('')
  const maj = (c: Partial<Reglages>) => setR((x) => ({ ...x, ...c }))

  const basculerJour = (type: TypeRepas, j: Jour) => {
    const jours = r.creneaux[type]
    maj({ creneaux: { ...r.creneaux, [type]: jours.includes(j) ? jours.filter((x) => x !== j) : [...jours, j].sort() } })
  }

  async function terminer() {
    const aliments = await db.aliments.bulkGet(placard)
    await db.transaction('rw', db.reglages, db.magasins, db.stock, async () => {
      await db.reglages.put({ ...r, onboardingFait: true })
      await db.magasins.clear()
      await db.magasins.bulkPut(magasins)
      await db.stock.bulkAdd(
        aliments.filter(Boolean).map((a) => ({
          alimentId: a!.id,
          nom: a!.nom,
          quantite: a!.formatVente.quantite,
          unite: a!.uniteBase,
          emplacement: 'placard' as const,
          ajouteLe: isoJour(),
        })),
      )
    })
    navigate('/swipe?premier=1', { replace: true })
  }

  const ecrans: { titre: string; sous?: string; contenu: ReactNode; ok?: boolean }[] = [
    {
      titre: 'Salut ! Moi c’est Popote 🍲',
      sous: 'Je te fais un planning de repas et une liste de courses sous ton budget. 5 minutes de questions, et c’est parti.',
      contenu: (
        <div className="text-center">
          <img src="icons/logo.svg" alt="" className="mx-auto mt-6 h-32 w-32 rounded-[2rem] shadow-carte" />
          <button type="button" className="mt-8 min-h-11 text-sm font-semibold text-encre-2 underline underline-offset-4" onClick={() => chargerDemo()}>
            Juste tester ? Charger des données de démo
          </button>
        </div>
      ),
    },
    {
      titre: 'Ton budget courses par semaine ?',
      sous: 'Je vais chercher à faire encore moins.',
      contenu: (
        <div className="mt-8 text-center">
          <div className="titre text-7xl font-extrabold text-orange" aria-live="polite">
            {r.budgetHebdo} €
          </div>
          <input
            type="range"
            min={20}
            max={120}
            step={5}
            value={r.budgetHebdo}
            onChange={(e) => maj({ budgetHebdo: Number(e.target.value) })}
            aria-label="Budget hebdomadaire en euros"
            className="mt-6 w-full accent-[var(--c-orange)]"
          />
        </div>
      ),
    },
    {
      titre: 'Je planifie quels repas ?',
      sous: 'Touche les jours. Gamelles pré-cochées jeudi, vendredi et samedi.',
      contenu: (
        <div className="mt-4 space-y-4">
          {REPAS.map(({ type, label, aide }) => (
            <fieldset key={type} className="rounded-carte bg-surface p-3 shadow-carte">
              <legend className="sr-only">{label}</legend>
              <div className="font-semibold">{label}</div>
              <p className="text-sm text-encre-2">{aide}</p>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {JOURS_COURTS.map((j, i) => {
                  const actif = r.creneaux[type].includes(i as Jour)
                  return (
                    <button
                      key={j}
                      type="button"
                      aria-pressed={actif}
                      aria-label={`${label} ${j}`}
                      onClick={() => basculerJour(type, i as Jour)}
                      className={`min-h-11 rounded-xl text-sm font-semibold ${actif ? 'bg-orange text-white' : 'bg-surface-2 text-encre-2'}`}
                    >
                      {j[0]}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ),
    },
    {
      titre: 'T’as quoi dans ta cuisine ?',
      contenu: (
        <Choix
          options={EQUIPEMENTS.map((e) => ({ id: e.id, label: `${e.emoji} ${e.label}` }))}
          valeurs={r.equipement}
          onChange={(v) => maj({ equipement: v as Equipement[] })}
        />
      ),
      ok: r.equipement.length > 0,
    },
    {
      titre: 'Combien de temps max pour cuisiner ?',
      contenu: (
        <Choix
          unique
          options={[10, 15, 20, 30].map((m) => ({ id: String(m), label: `${m} min` }))}
          valeurs={[String(r.tempsMaxMinutes)]}
          onChange={(v) => maj({ tempsMaxMinutes: Number(v[0] ?? 30) })}
        />
      ),
    },
    {
      titre: 'Ce que tu ne veux jamais voir',
      sous: 'Fromage, purée et soupe sont déjà exclus. Tu affineras avec le swipe.',
      contenu: (
        <Choix
          options={EXCLUSIONS.map((e) => ({ id: e.tag, label: e.label }))}
          valeurs={r.exclusions}
          onChange={(v) => maj({ exclusions: v as TagExclusion[] })}
        />
      ),
    },
    {
      titre: 'Des allergies ou intolérances ?',
      sous: 'Laisse vide si aucune.',
      contenu: (
        <div className="mt-6 space-y-4">
          <textarea
            value={r.allergies}
            onChange={(e) => maj({ allergies: e.target.value })}
            placeholder="Ex. arachide, lactose…"
            aria-label="Allergies ou intolérances"
            className="min-h-28 w-full rounded-carte border border-trait bg-surface p-4"
          />
          <Choix
            options={[
              { id: 'gluten', label: 'Sans gluten' },
              { id: 'lactose', label: 'Sans lactose' },
              { id: 'fruits-a-coque', label: 'Sans fruits à coque' },
            ]}
            valeurs={r.exclusions.filter((t) => ['gluten', 'lactose', 'fruits-a-coque'].includes(t))}
            onChange={(v) =>
              maj({ exclusions: [...r.exclusions.filter((t) => !['gluten', 'lactose', 'fruits-a-coque'].includes(t)), ...(v as TagExclusion[])] })
            }
          />
        </div>
      ),
    },
    {
      titre: 'Tes magasins',
      sous: 'Indique la ville de chacun : ça sert à trouver les bons prix.',
      contenu: (
        <div className="mt-4 space-y-3">
          {magasins.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 rounded-carte bg-surface p-3 shadow-carte">
              <label className="flex min-h-11 items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={m.actif}
                  onChange={(e) => setMagasins(magasins.map((x, j) => (j === i ? { ...x, actif: e.target.checked } : x)))}
                  className="h-5 w-5 accent-[var(--c-orange)]"
                />
                {m.enseigne}
              </label>
              <input
                value={m.ville}
                onChange={(e) => setMagasins(magasins.map((x, j) => (j === i ? { ...x, ville: e.target.value } : x)))}
                placeholder="Ville"
                aria-label={`Ville du ${m.enseigne}`}
                className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3"
              />
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const nom = nouveauMagasin.trim()
              if (!nom) return
              setMagasins([...magasins, { id: nom.toLowerCase().replace(/[^a-z0-9]+/g, '-'), enseigne: nom, ville: '', actif: true }])
              setNouveauMagasin('')
            }}
          >
            <input
              value={nouveauMagasin}
              onChange={(e) => setNouveauMagasin(e.target.value)}
              placeholder="Autre magasin (Intermarché…)"
              aria-label="Ajouter un magasin"
              className="min-h-11 flex-1 rounded-xl bg-surface px-3 shadow-carte"
            />
            <Bouton type="submit" variante="doux">
              Ajouter
            </Bouton>
          </form>
        </div>
      ),
      ok: magasins.some((m) => m.actif),
    },
    {
      titre: 'Tu fais tes courses…',
      contenu: (
        <Choix
          unique
          options={[
            { id: 'hebdo', label: '🗓️ Chaque semaine' },
            { id: 'mensuel-plus-hebdo', label: '📦 Une grosse course par mois + un petit complément chaque semaine' },
          ]}
          valeurs={[r.frequenceCourses]}
          onChange={(v) => maj({ frequenceCourses: (v[0] as FrequenceCourses) ?? 'hebdo' })}
        />
      ),
    },
    {
      titre: 'Ce que t’as déjà au placard',
      sous: 'Je ne te le remettrai pas dans la liste.',
      contenu: (
        <Choix
          options={PLACARD.map((id) => ({ id, label: id.replace(/-/g, ' ') }))}
          valeurs={placard}
          onChange={setPlacard}
        />
      ),
    },
  ]

  const e = ecrans[etape]
  const dernier = etape === ecrans.length - 1

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-xl flex-col px-4">
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Progression du questionnaire"
        aria-valuemin={1}
        aria-valuemax={ecrans.length}
        aria-valuenow={etape + 1}
      >
        <div className="h-full rounded-full bg-orange transition-[width] duration-200" style={{ width: `${((etape + 1) / ecrans.length) * 100}%` }} />
      </div>
      <AnimatePresence mode="wait">
        <motion.section
          key={etape}
          initial={reduit ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduit ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 overflow-y-auto pt-8 pb-4"
        >
          <h1 className="text-3xl font-extrabold">{e.titre}</h1>
          {e.sous && <p className="mt-2 text-encre-2">{e.sous}</p>}
          {e.contenu}
        </motion.section>
      </AnimatePresence>
      <div className="flex gap-3 py-4">
        {etape > 0 && (
          <Bouton variante="doux" onClick={() => setEtape(etape - 1)} aria-label="Question précédente">
            ←
          </Bouton>
        )}
        <Bouton grand disabled={e.ok === false} onClick={() => (dernier ? terminer() : setEtape(etape + 1))}>
          {etape === 0 ? 'C’est parti' : dernier ? 'On passe au swipe 🔥' : 'Suivant'}
        </Bouton>
      </div>
    </main>
  )
}

function Choix({
  options,
  valeurs,
  onChange,
  unique = false,
}: {
  options: { id: string; label: string }[]
  valeurs: string[]
  onChange: (v: string[]) => void
  unique?: boolean
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-2" role="group">
      {options.map((o) => {
        const actif = valeurs.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={actif}
            onClick={() => onChange(unique ? [o.id] : actif ? valeurs.filter((v) => v !== o.id) : [...valeurs, o.id])}
            className={`min-h-12 rounded-full px-4 text-left font-semibold first-letter:uppercase ${
              actif ? 'bg-cta text-cta-texte' : 'bg-surface text-encre shadow-carte'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
