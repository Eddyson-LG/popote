/**
 * Écran Tickets de caisse : photo → lecture (IA ou OCR local) → correction → enregistrement.
 * Tout le texte lu (OCR / IA) est rendu comme texte React, jamais en HTML.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { MESSAGES_ERREUR } from '@/lib/ia'
import { isoJour } from '@/lib/dates'
import { prix as formatPrix } from '@/lib/format'
import { Bouton, Carte, Page, Pastille, Vide } from '@/ui'
import type { Aliment, Magasin } from '@/types'
import { associer, chercherAliments, indexerAliments, type Confiance, type IndexAliments } from './correspondance'
import { chargerAppris, enregistrerTicket, magasinPourEnseigne } from './enregistrer'
import { lireTicket, type Etape, type Lecture } from './extraction'
import type { MethodeLecture, TicketLu } from './types'

interface LigneEdition {
  id: number
  libelle: string
  prix: string
  quantite: string
  poidsKg?: number
  alimentId?: string
  confiance?: Confiance
  manuel?: boolean
}

type Ecran =
  | { etape: 'choix'; erreur?: string }
  | { etape: 'lecture'; statut: string }
  | { etape: 'correction' }
  | { etape: 'fini'; montant: number; nbPrix: number; magasin?: string }

let compteur = 0
const nouvelId = () => ++compteur

/** « 1,29 » → 1.29 ; NaN si illisible. */
function lirePrix(s: string): number {
  const t = s.replace(/\s|€/g, '').replace(',', '.')
  return t === '' ? NaN : Number(t)
}

const texteMontant = (n: number | undefined) => (n === undefined ? '' : n.toFixed(2).replace('.', ','))

function versEdition(t: TicketLu, index: IndexAliments, appris: Record<string, string>): LigneEdition[] {
  return t.lignes.map((l) => {
    const c = l.prix > 0 ? associer(l.libelle, index, appris) : null
    return {
      id: nouvelId(),
      libelle: l.libelle,
      prix: texteMontant(l.prix),
      quantite: l.quantite ? String(l.quantite) : '',
      poidsKg: l.poidsKg,
      alimentId: c?.aliment.id,
      confiance: c?.confiance,
    }
  })
}

const LIBELLE_METHODE: Record<MethodeLecture, { texte: string; ton: 'orange' | 'vert' | 'neutre' }> = {
  ia: { texte: '🤖 Lu par l’IA', ton: 'orange' },
  ocr: { texte: '📱 Lu sur ton téléphone', ton: 'vert' },
  manuel: { texte: '✍️ Saisi à la main', ton: 'neutre' },
}

export default function Tickets() {
  const aliments = useLiveQuery(() => db.aliments.toArray(), [])
  const magasins = useLiveQuery(() => db.magasins.toArray(), [])
  const index = useMemo(() => indexerAliments(aliments ?? []), [aliments])
  const parId = useMemo(() => new Map((aliments ?? []).map((a) => [a.id, a])), [aliments])

  const [ecran, setEcran] = useState<Ecran>({ etape: 'choix' })
  const [photo, setPhoto] = useState<File | null>(null)
  const [apercu, setApercu] = useState<string | null>(null)
  const [methode, setMethode] = useState<MethodeLecture>('manuel')
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [lignes, setLignes] = useState<LigneEdition[]>([])
  const [magasinId, setMagasinId] = useState('')
  const [date, setDate] = useState(isoJour())
  const [total, setTotal] = useState('')
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    if (!photo) return setApercu(null)
    const url = URL.createObjectURL(photo)
    setApercu(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function preparerCorrection(t: TicketLu, m: MethodeLecture, appris: Record<string, string>) {
    setMethode(m)
    setLignes(versEdition(t, index, appris))
    setMagasinId(magasinPourEnseigne(t.enseigne, magasins ?? [])?.id ?? '')
    setDate(t.date ?? isoJour())
    setTotal(texteMontant(t.total))
    setEcran({ etape: 'correction' })
  }

  async function lire(fichier: File) {
    setPhoto(fichier)
    setLecture(null)
    setEcran({ etape: 'lecture', statut: 'Je regarde ton ticket…' })
    const suivi = (e: Etape) => {
      const statut =
        e.type === 'ia'
          ? 'L’IA lit ton ticket…'
          : e.etape === 'chargement'
            ? 'Je prépare la lecture sur ton téléphone…'
            : `Lecture sur ton téléphone… ${Math.round(e.progres * 100)} %`
      setEcran({ etape: 'lecture', statut })
    }
    try {
      const [r, appris] = await Promise.all([lireTicket(fichier, suivi), chargerAppris()])
      setLecture(r)
      preparerCorrection(r.ticket, r.methode, appris)
    } catch {
      setEcran({
        etape: 'choix',
        erreur:
          'Je n’ai pas réussi à lire ce ticket. La première lecture sans IA a besoin de réseau (pour télécharger le français), ensuite ça marche hors ligne. Tu peux aussi le saisir à la main.',
      })
    }
  }

  function saisieManuelle() {
    setPhoto(null)
    setLecture(null)
    preparerCorrection({ lignes: [{ libelle: '', prix: 0 }] }, 'manuel', {})
  }

  function majLigne(id: number, changement: Partial<LigneEdition>) {
    setLignes((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l
        const n = { ...l, ...changement }
        // Libellé modifié sans association choisie à la main : on recalcule la correspondance.
        if (changement.libelle !== undefined && !l.manuel) {
          const c = associer(changement.libelle, index)
          n.alimentId = c?.aliment.id
          n.confiance = c?.confiance
        }
        return n
      }),
    )
  }

  const somme = lignes.reduce((s, l) => s + (Number.isFinite(lirePrix(l.prix)) ? lirePrix(l.prix) : 0), 0)
  const totalLu = lirePrix(total)
  const ecart = Number.isFinite(totalLu) && Math.abs(totalLu - somme) > 0.05

  async function enregistrer() {
    setEnCours(true)
    try {
      const r = await enregistrerTicket({
        date,
        magasinId: magasinId || undefined,
        total: Number.isFinite(totalLu) ? totalLu : undefined,
        lignes: lignes
          .map((l) => ({
            libelle: l.libelle.trim(),
            prix: lirePrix(l.prix),
            quantite: l.quantite ? Number(l.quantite.replace(',', '.')) || undefined : undefined,
            poidsKg: l.poidsKg,
            alimentId: l.alimentId,
            alimentManuel: l.manuel,
          }))
          .filter((l) => Number.isFinite(l.prix) && (l.libelle || l.alimentId)),
      })
      setEcran({ etape: 'fini', montant: r.montant, nbPrix: r.prix, magasin: magasins?.find((m) => m.id === magasinId)?.enseigne })
      setPhoto(null)
    } finally {
      setEnCours(false)
    }
  }

  if (ecran.etape === 'fini') {
    return (
      <Page titre="Tickets de caisse">
        <Vide
          emoji="🧾"
          titre="C’est noté !"
          texte={`${formatPrix(ecran.montant)} de courses${ecran.magasin ? ` chez ${ecran.magasin}` : ''}. ${
            ecran.nbPrix > 0 ? `${ecran.nbPrix} prix ajouté${ecran.nbPrix > 1 ? 's' : ''} à ton historique : tes listes seront plus justes.` : 'Aucun prix associé à un aliment cette fois.'
          }`}
          action={<Bouton onClick={() => setEcran({ etape: 'choix' })}>Scanner un autre ticket</Bouton>}
        />
      </Page>
    )
  }

  if (ecran.etape === 'choix') {
    return (
      <Page titre="Tickets de caisse" sousTitre="Prends ton ticket en photo, je note les prix pour toi.">
        {ecran.erreur && (
          <p role="alert" className="mb-4 rounded-carte bg-rouge-doux p-3 text-sm text-rouge">
            {ecran.erreur}
          </p>
        )}
        <Carte className="flex flex-col gap-3">
          <ChoixPhoto onFichier={lire} camera libelle="📸 Prendre le ticket en photo" principal />
          <ChoixPhoto onFichier={lire} libelle="🖼️ Choisir dans mes photos" />
          <Bouton variante="fantome" onClick={saisieManuelle}>
            Saisir à la main
          </Bouton>
        </Carte>
        <p className="mt-4 text-sm text-encre-2">
          Astuce : pose le ticket bien à plat, avec de la lumière, et cadre-le en entier. Avec une clé API, l’IA le lit ; sinon je le lis directement sur ton téléphone,
          même hors ligne.
        </p>
        <p className="mt-2 text-xs text-encre-3">
          🔒 Avec l’IA, la photo du ticket est envoyée à Anthropic pour être lue. Si ta carte de fidélité ou la fin de ta carte bancaire y figurent,
          cache-les, ou désactive l’IA dans les réglages.
        </p>
      </Page>
    )
  }

  if (ecran.etape === 'lecture') {
    return (
      <Page titre="Tickets de caisse">
        <Carte className="flex flex-col items-center gap-4">
          {apercu && <img src={apercu} alt="Ton ticket" className="max-h-80 rounded-xl object-contain" />}
          <p role="status" aria-live="polite" className="font-semibold">
            {ecran.statut}
          </p>
        </Carte>
      </Page>
    )
  }

  const m = LIBELLE_METHODE[methode]
  const erreurIA = lecture?.erreurIA && !['pas-de-cle', 'ia-desactivee'].includes(lecture.erreurIA) ? MESSAGES_ERREUR[lecture.erreurIA] : undefined

  return (
    <Page titre="Vérifie ton ticket" sousTitre="Corrige ce qui cloche, puis enregistre.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pastille ton={m.ton}>{m.texte}</Pastille>
        {methode === 'ocr' && <span className="text-xs text-encre-2">La lecture locale peut se tromper : jette un œil aux prix.</span>}
        {erreurIA && <span className="text-xs text-encre-3">(IA indisponible : {erreurIA})</span>}
      </div>

      {apercu && (
        <details className="mb-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Voir la photo</summary>
          <img src={apercu} alt="Ton ticket" className="mt-2 w-full rounded-xl" />
        </details>
      )}

      <Carte className="mb-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-encre-2">
          Magasin
          <select value={magasinId} onChange={(e) => setMagasinId(e.target.value)} className="min-h-11 rounded-xl bg-surface-2 px-3 text-base text-encre">
            <option value="">Autre / je ne sais pas</option>
            {(magasins ?? []).map((mg: Magasin) => (
              <option key={mg.id} value={mg.id}>
                {mg.enseigne}
                {mg.ville ? ` (${mg.ville})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-encre-2">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 rounded-xl bg-surface-2 px-3 text-base text-encre" />
        </label>
      </Carte>

      {lignes.length === 0 && (
        <p className="mb-4 text-encre-2">Je n’ai trouvé aucun article. Ajoute-les à la main, ou reprends une photo plus nette.</p>
      )}

      <ul className="space-y-3">
        {lignes.map((l) => (
          <LigneCorrection
            key={l.id}
            ligne={l}
            aliment={l.alimentId ? parId.get(l.alimentId) : undefined}
            index={index}
            onChange={(c) => majLigne(l.id, c)}
            onSupprimer={() => setLignes((ls) => ls.filter((x) => x.id !== l.id))}
          />
        ))}
      </ul>

      <Bouton variante="doux" className="mt-3 w-full" onClick={() => setLignes((ls) => [...ls, { id: nouvelId(), libelle: '', prix: '', quantite: '' }])}>
        + Ajouter une ligne
      </Bouton>

      <Carte className="mt-4">
        <label className="flex items-center justify-between gap-3">
          <span className="font-bold">Total payé</span>
          <input
            inputMode="decimal"
            value={total}
            placeholder={texteMontant(somme)}
            onChange={(e) => setTotal(e.target.value)}
            className="min-h-11 w-28 rounded-xl bg-surface-2 px-3 text-right text-base font-bold"
            aria-label="Total payé en euros"
          />
        </label>
        <p className={`mt-2 text-sm ${ecart ? 'text-orange-texte' : 'text-encre-2'}`}>
          Somme des lignes : {formatPrix(somme)}
          {ecart && ' — ça ne colle pas au total, il manque peut-être une ligne.'}
        </p>
      </Carte>

      {lecture?.texteBrut && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-encre-2">Texte lu sur le ticket</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-xs">{lecture.texteBrut}</pre>
        </details>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <Bouton grand disabled={enCours || lignes.length === 0} onClick={enregistrer}>
          {enCours ? 'J’enregistre…' : 'Enregistrer'}
        </Bouton>
        <Bouton variante="fantome" onClick={() => setEcran({ etape: 'choix' })}>
          Annuler
        </Bouton>
      </div>
    </Page>
  )
}

function ChoixPhoto({ onFichier, camera, libelle, principal }: { onFichier: (f: File) => void; camera?: boolean; libelle: string; principal?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        {...(camera ? { capture: 'environment' as const } : {})}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFichier(f)
        }}
      />
      <Bouton grand variante={principal ? 'cta' : 'doux'} onClick={() => ref.current?.click()}>
        {libelle}
      </Bouton>
    </>
  )
}

const TON_CONFIANCE: Record<Confiance, { texte: string; ton: 'vert' | 'orange' | 'rouge' }> = {
  haute: { texte: 'sûr', ton: 'vert' },
  moyenne: { texte: 'à vérifier', ton: 'orange' },
  faible: { texte: 'douteux', ton: 'rouge' },
}

function LigneCorrection({
  ligne,
  aliment,
  index,
  onChange,
  onSupprimer,
}: {
  ligne: LigneEdition
  aliment?: Aliment
  index: IndexAliments
  onChange: (c: Partial<LigneEdition>) => void
  onSupprimer: () => void
}) {
  const [recherche, setRecherche] = useState<string | null>(null)
  const prixInvalide = ligne.prix !== '' && !Number.isFinite(lirePrix(ligne.prix))
  const resultats = recherche === null ? [] : chercherAliments(recherche || ligne.libelle, index, 6)

  return (
    <li className="rounded-carte bg-surface p-3 shadow-carte">
      <div className="flex items-center gap-2">
        <input
          value={ligne.libelle}
          onChange={(e) => onChange({ libelle: e.target.value })}
          placeholder="Libellé"
          aria-label="Libellé"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-base font-semibold"
        />
        <input
          value={ligne.prix}
          inputMode="decimal"
          onChange={(e) => onChange({ prix: e.target.value })}
          placeholder="0,00"
          aria-label="Prix en euros"
          aria-invalid={prixInvalide}
          className={`min-h-11 w-20 rounded-xl bg-surface-2 px-2 text-right text-base ${prixInvalide ? 'text-rouge' : ''}`}
        />
        <button type="button" onClick={onSupprimer} aria-label="Supprimer la ligne" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-encre-3">
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRecherche(recherche === null ? '' : null)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left text-sm"
        >
          {aliment ? (
            <>
              <span aria-hidden className="text-xl">
                {aliment.emoji}
              </span>
              <span className="truncate font-medium">{aliment.nom}</span>
              {ligne.confiance && !ligne.manuel && <Pastille ton={TON_CONFIANCE[ligne.confiance].ton}>{TON_CONFIANCE[ligne.confiance].texte}</Pastille>}
            </>
          ) : (
            <span className="text-orange-texte underline underline-offset-4">Associer un aliment</span>
          )}
        </button>
        <label className="flex items-center gap-1 text-sm text-encre-2">
          Qté
          <input
            value={ligne.quantite}
            inputMode="numeric"
            onChange={(e) => onChange({ quantite: e.target.value })}
            placeholder="1"
            aria-label="Quantité"
            className="min-h-11 w-14 rounded-xl bg-surface-2 px-2 text-center text-base text-encre"
          />
        </label>
      </div>
      {ligne.poidsKg !== undefined && <p className="mt-1 text-xs text-encre-3">Pesé : {ligne.poidsKg.toLocaleString('fr-FR')} kg</p>}
      {recherche !== null && (
        <div className="mt-2">
          <input
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Cherche un aliment (banane, riz…)"
            aria-label="Chercher un aliment"
            className="min-h-11 w-full rounded-xl bg-surface-2 px-3 text-base"
          />
          <ul className="mt-2 flex flex-wrap gap-2">
            {resultats.map((r) => (
              <li key={r.aliment.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ alimentId: r.aliment.id, manuel: true, confiance: 'haute' })
                    setRecherche(null)
                  }}
                  className="min-h-11 rounded-full bg-surface-2 px-3 text-sm"
                >
                  {r.aliment.emoji} {r.aliment.nom}
                </button>
              </li>
            ))}
            {aliment && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ alimentId: undefined, confiance: undefined, manuel: true })
                    setRecherche(null)
                  }}
                  className="min-h-11 rounded-full bg-rouge-doux px-3 text-sm text-rouge"
                >
                  Aucun aliment
                </button>
              </li>
            )}
            {resultats.length === 0 && <li className="text-sm text-encre-3">Rien trouvé, essaie un autre mot.</li>}
          </ul>
        </div>
      )}
    </li>
  )
}
