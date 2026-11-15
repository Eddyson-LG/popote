/**
 * Réglages : budget, repas, magasins, exclusions, IA (clé locale), notifications,
 * sauvegarde, données de démo et réinitialisation.
 */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import type { Equipement, Jour, TagExclusion, TypeRepas } from '@/types'
import { db } from '@/lib/db'
import { majReglages, useReglages } from '@/lib/hooks'
import { JOURS_COURTS } from '@/lib/dates'
import { prix } from '@/lib/format'
import { MESSAGES_ERREUR, MODELES, coutEstimeDollars, testerCle } from '@/lib/ia'
import { reinitialiser } from '@/lib/seed'
import { chargerDemo } from '@/lib/demo'
import { regenererListe } from '@/lib/contexte'
import { demanderPermission, notificationsDisponibles } from '@/features/suivi/notifications'
import { SauvegardeDonnees } from '@/features/export'
import { Bouton, Carte, ChampNombre, Page } from '@/ui'

const REPAS: { type: TypeRepas; label: string }[] = [
  { type: 'petit-dejeuner', label: 'Petits-déj' },
  { type: 'dejeuner', label: 'Midis' },
  { type: 'gouter', label: 'Goûters' },
  { type: 'diner', label: 'Dîners' },
  { type: 'gamelle', label: 'Gamelles' },
]
const EXCLUSIONS: TagExclusion[] = ['fromage', 'puree', 'soupe', 'porc', 'poisson', 'oeuf', 'gluten', 'lactose', 'fruits-a-coque']
const EQUIP: Equipement[] = ['plaques', 'four', 'micro-ondes', 'airfryer', 'mixeur']

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <Carte className="mb-4">
      <h2 className="mb-3 text-lg font-bold">{titre}</h2>
      {children}
    </Carte>
  )
}

function Puces<T extends string>({ options, valeurs, onChange, libelle }: { options: T[]; valeurs: T[]; onChange: (v: T[]) => void; libelle?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const actif = valeurs.includes(o)
        return (
          <button key={o} type="button" aria-pressed={actif} onClick={() => onChange(actif ? valeurs.filter((v) => v !== o) : [...valeurs, o])}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold first-letter:uppercase ${actif ? 'bg-cta text-cta-texte' : 'bg-surface-2'}`}>
            {libelle ? libelle(o) : o}
          </button>
        )
      })}
    </div>
  )
}

export default function Reglages() {
  const r = useReglages()
  const navigate = useNavigate()
  const magasins = useLiveQuery(() => db.magasins.toArray(), [])
  const [cle, setCle] = useState('')
  const [etatCle, setEtatCle] = useState('')
  const [confirmer, setConfirmer] = useState<'reset' | 'demo' | null>(null)
  const [occupe, setOccupe] = useState(false)
  if (!r) return null

  const maj = async (c: Parameters<typeof majReglages>[0], recalculer = false) => {
    await majReglages(c)
    if (recalculer) await regenererListe()
  }

  async function enregistrerCle() {
    const v = cle.trim()
    if (!v) return
    setEtatCle('Je teste ta clé…')
    const t = await testerCle(v)
    if (t.ok) {
      await majReglages({ cleApi: v, iaActive: true })
      setCle('')
      setEtatCle('Clé OK ✅ L’IA est activée.')
    } else setEtatCle(MESSAGES_ERREUR[t.erreur])
  }

  const dollars = coutEstimeDollars(r.tokensEntree, r.tokensSortie)

  return (
    <Page titre="Réglages">
      <Section titre="Budget">
        <label className="flex items-center justify-between gap-3">
          <span>Budget courses / semaine</span>
          <span className="flex items-center gap-2">
            <ChampNombre valeur={r.budgetHebdo} min={10} max={300} onValider={(v) => maj({ budgetHebdo: v })} libelle="Budget hebdomadaire en euros" /> €
          </span>
        </label>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span>Prix d’un repas dehors</span>
          <span className="flex items-center gap-2">
            <ChampNombre valeur={r.prixRepasDehors} min={1} max={30} pas={0.5} onValider={(v) => maj({ prixRepasDehors: v })} libelle="Prix d'un repas dehors" /> €
          </span>
        </label>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span>Répartir entre 2 magasins si ça économise au moins</span>
          <span className="flex items-center gap-2">
            <ChampNombre valeur={r.seuilRepartition} min={0} max={50} pas={0.5} onValider={(v) => maj({ seuilRepartition: v })} libelle="Seuil de répartition" /> €
          </span>
        </label>
      </Section>

      <Section titre="Repas planifiés">
        {REPAS.map(({ type, label }) => (
          <div key={type} className="mb-3">
            <div className="mb-1 text-sm font-semibold">{label}</div>
            <div className="grid grid-cols-7 gap-1">
              {JOURS_COURTS.map((j, i) => {
                const actif = r.creneaux[type].includes(i as Jour)
                const jours = actif ? r.creneaux[type].filter((x) => x !== i) : ([...r.creneaux[type], i].sort() as Jour[])
                return (
                  <button key={j} type="button" aria-pressed={actif} aria-label={`${label} ${j}`} onClick={() => maj({ creneaux: { ...r.creneaux, [type]: jours } })}
                    className={`min-h-11 rounded-xl text-xs font-semibold ${actif ? 'bg-orange text-sur-orange' : 'bg-surface-2 text-encre-2'}`}>
                    {j}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <label className="mt-2 flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={r.midiCrous} onChange={(e) => maj({ midiCrous: e.target.checked })} className="h-5 w-5 accent-[var(--c-orange)]" />
          Midis de semaine au CROUS (non planifiés)
        </label>
        <label className="mt-2 flex items-center justify-between">
          <span>Temps max par repas</span>
          <select value={r.tempsMaxMinutes} onChange={(e) => maj({ tempsMaxMinutes: Number(e.target.value) })} className="min-h-11 rounded-xl bg-surface-2 px-3" aria-label="Temps maximum par repas">
            {[10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <div className="mt-3 text-sm font-semibold">Équipement</div>
        <div className="mt-1"><Puces options={EQUIP} valeurs={r.equipement} onChange={(v) => maj({ equipement: v })} libelle={(e) => e} /></div>
        <p className="mt-3 text-xs text-encre-3">Les changements s’appliquent à la prochaine génération de la semaine.</p>
      </Section>

      <Section titre="Exclusions et allergies">
        <Puces options={EXCLUSIONS} valeurs={r.exclusions} onChange={(v) => maj({ exclusions: v }, true)} libelle={(t) => ({ puree: 'purée', oeuf: 'œufs', 'fruits-a-coque': 'fruits à coque' } as Record<string, string>)[t] ?? t} />
        <textarea value={r.allergies} onChange={(e) => maj({ allergies: e.target.value })} placeholder="Allergies ou intolérances (texte libre, transmis à l’IA)" aria-label="Allergies ou intolérances" className="mt-3 min-h-20 w-full rounded-xl bg-surface-2 p-3" />
      </Section>

      <Section titre="Magasins et courses">
        <ul className="space-y-2">
          {magasins?.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <label className="flex min-h-11 items-center gap-2 font-semibold">
                <input type="checkbox" checked={m.actif} onChange={(e) => db.magasins.update(m.id, { actif: e.target.checked })} className="h-5 w-5 accent-[var(--c-orange)]" />
                {m.enseigne}
              </label>
              <input value={m.ville} onChange={(e) => db.magasins.update(m.id, { ville: e.target.value })} placeholder="Ville" aria-label={`Ville du ${m.enseigne}`} className="min-h-11 flex-1 rounded-xl bg-surface-2 px-3" />
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-center justify-between gap-2">
          <span>Fréquence</span>
          <select value={r.frequenceCourses} onChange={(e) => maj({ frequenceCourses: e.target.value as typeof r.frequenceCourses })} className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3" aria-label="Fréquence des courses">
            <option value="hebdo">Chaque semaine</option>
            <option value="mensuel-plus-hebdo">Mensuel + complément</option>
          </select>
        </label>
        <label className="mt-3 flex items-center justify-between gap-2">
          <span>Rafraîchir les prix toutes les</span>
          <select value={r.rafraichissementHeures} onChange={(e) => maj({ rafraichissementHeures: Number(e.target.value) })} className="min-h-11 rounded-xl bg-surface-2 px-3" aria-label="Intervalle de rafraîchissement des prix">
            {[3, 6, 12, 24, 72].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
        </label>
      </Section>

      <Section titre="IA (facultatif)">
        <p className="text-sm text-encre-2">Popote marche à 100 % sans IA. Avec ta clé Claude, les recettes et la lecture des tickets deviennent plus perso.</p>
        <label className="mt-3 flex min-h-11 items-center justify-between">
          <span className="font-semibold">IA activée</span>
          <input type="checkbox" role="switch" checked={r.iaActive} disabled={!r.cleApi} onChange={(e) => maj({ iaActive: e.target.checked })} className="h-6 w-6 accent-[var(--c-orange)]" aria-label="Activer l'IA" />
        </label>
        {r.cleApi ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm">Clé enregistrée : •••• {r.cleApi.slice(-4)}</span>
            <Bouton variante="danger" onClick={() => (majReglages({ cleApi: undefined, iaActive: false }), setEtatCle('Clé effacée.'))}>Effacer la clé</Bouton>
          </div>
        ) : (
          <form className="mt-2 flex gap-2" onSubmit={(e) => (e.preventDefault(), enregistrerCle())}>
            <input type="password" autoComplete="off" value={cle} onChange={(e) => setCle(e.target.value)} placeholder="sk-ant-…" aria-label="Clé API Claude" className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3" />
            <Bouton type="submit">Tester</Bouton>
          </form>
        )}
        {etatCle && <p role="status" className="mt-2 text-sm">{etatCle}</p>}
        <p className="mt-3 text-sm text-encre-2">
          Consommé : {(r.tokensEntree + r.tokensSortie).toLocaleString('fr-FR')} tokens, soit environ {dollars < 0.01 ? 'moins d’un centime' : `${dollars.toFixed(2).replace('.', ',')} $`} (estimation au tarif de {MODELES.rapide} ; les recettes utilisent {MODELES.capable}, plus cher).
        </p>
        <details className="mt-3 text-xs text-encre-3">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">⚠️ Sécurité de ta clé</summary>
          <p>La clé reste uniquement sur cet appareil et n’est envoyée qu’à api.anthropic.com. Elle n’est jamais exportée dans les sauvegardes. Crée une clé dédiée à Popote, avec une limite de dépense et une date d’expiration dans la Console Anthropic, et efface-la ici si tu prêtes ton téléphone.</p>
        </details>
      </Section>

      <Section titre="Notifications">
        {notificationsDisponibles() ? (
          <label className="flex min-h-11 items-center justify-between">
            <span>Promos sur ce que t’aimes, produits à manger vite</span>
            <input type="checkbox" role="switch" checked={r.notifications} onChange={async (e) => (e.target.checked ? demanderPermission() : maj({ notifications: false }))} className="h-6 w-6 accent-[var(--c-orange)]" aria-label="Activer les notifications" />
          </label>
        ) : (
          <p className="text-sm text-encre-2">Sur iPhone, installe d’abord Popote sur l’écran d’accueil (Partager → Sur l’écran d’accueil) pour activer les notifications. Les alertes restent visibles sur l’accueil.</p>
        )}
      </Section>

      <SauvegardeDonnees />

      <Section titre="Tester et repartir de zéro">
        {confirmer ? (
          <div className="rounded-2xl bg-rouge-doux p-3">
            <p className="font-semibold text-rouge">{confirmer === 'demo' ? 'Charger la démo remplace toutes tes données.' : 'Tout effacer ? Goûts, stock, prix, plannings, et ta clé API…'} C’est définitif (sauf si t’as une sauvegarde).</p>
            <div className="mt-2 flex gap-2">
              <Bouton variante="danger" disabled={occupe} onClick={async () => {
                setOccupe(true)
                try {
                  if (confirmer === 'demo') {
                    await chargerDemo()
                    navigate('/')
                  } else await reinitialiser()
                } finally {
                  setOccupe(false)
                  setConfirmer(null)
                }
              }}>{occupe ? '…' : 'Oui, vas-y'}</Bouton>
              <Bouton variante="doux" onClick={() => setConfirmer(null)}>Annuler</Bouton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Bouton variante="doux" onClick={() => setConfirmer('demo')}>🧪 Charger les données de démo</Bouton>
            <Bouton variante="danger" onClick={() => setConfirmer('reset')}>Réinitialiser toutes les données</Bouton>
          </div>
        )}
        <p className="mt-3 text-xs text-encre-3">Popote · budget {prix(r.budgetHebdo)} · données 100 % locales.</p>
      </Section>
    </Page>
  )
}
