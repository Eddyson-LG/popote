/**
 * Swipe façon Tinder : droite = j'aime, gauche = j'aime pas, haut = j'adore, bas = jamais.
 * Boutons en alternative (accessibilité). Session courte (~20 cartes = 2 minutes).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion'
import type { Verdict } from '@/types'
import { db } from '@/lib/db'
import { enregistrerGout, planifierSemaine } from '@/lib/contexte'
import { Bouton, Page, Vide } from '@/ui'
import { recetteExclue } from '@/lib/scoring'

interface CarteSwipe {
  cible: 'aliment' | 'recette' | 'produit'
  refId: string
  titre: string
  sous: string
  emoji?: string
  image?: string
}

const TAILLE_SESSION = 20
const SEUIL = 110

const VERDICT_LIBELLE: Record<Verdict, string> = {
  adore: "J'adore 😍",
  aime: "J'aime 👍",
  'pas-souvent': 'Pas trop souvent',
  'pas-aime': "J'aime pas 👎",
  jamais: 'Jamais 🚫',
}

async function preparerPile(): Promise<CarteSwipe[]> {
  const [aliments, recettes, produits, gouts, reglages] = await Promise.all([
    db.aliments.toArray(),
    db.recettes.toArray(),
    db.produits.toArray(),
    db.gouts.toArray(),
    db.reglages.get('moi'),
  ])
  const vus = new Set(gouts.filter((g) => g.verdict).map((g) => g.id))
  const parId = new Map(aliments.map((a) => [a.id, a]))
  const carte = new Map(gouts.map((g) => [g.id, g]))
  // Les épices et condiments ne valent pas un swipe.
  const swipables = aliments.filter(
    (a) => !['epice-herbe', 'condiment', 'matiere-grasse'].includes(a.categorie) && !vus.has(`aliment:${a.id}`) && !(reglages && a.tags.some((t) => reglages.exclusions.includes(t))),
  )
  const recettesOk = recettes.filter((r) => !vus.has(`recette:${r.id}`) && !(reglages && recetteExclue(r, parId, reglages, carte)))
  const melange = <T,>(t: T[]) => t.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

  // Priorité aux aliments bruts, puis on intercale des plats et des produits scannés.
  const pileAliments = melange(swipables).map<CarteSwipe>((a) => ({ cible: 'aliment', refId: a.id, titre: a.nom, sous: 'Aliment', emoji: a.emoji }))
  const pileRecettes = melange(recettesOk).map<CarteSwipe>((r) => ({ cible: 'recette', refId: r.id, titre: r.nom, sous: `Plat · ${r.tempsMinutes} min`, emoji: r.emoji }))
  const pileProduits = produits
    .filter((p) => !vus.has(`produit:${p.codeBarres}`))
    .map<CarteSwipe>((p) => ({ cible: 'produit', refId: p.codeBarres, titre: p.nom, sous: p.marque ?? 'Produit', image: p.imageUrl, emoji: '🛒' }))
  const res: CarteSwipe[] = []
  while (res.length < TAILLE_SESSION && (pileAliments.length || pileRecettes.length || pileProduits.length)) {
    const n = res.length
    const suivante = (n % 4 === 3 ? pileRecettes.shift() : n % 7 === 6 ? pileProduits.shift() : undefined) ?? pileAliments.shift() ?? pileRecettes.shift() ?? pileProduits.shift()
    if (suivante) res.push(suivante)
  }
  return res
}

export default function Swipe() {
  const [params] = useSearchParams()
  const premier = params.get('premier') === '1'
  const navigate = useNavigate()
  const [pile, setPile] = useState<CarteSwipe[] | null>(null)
  const [index, setIndex] = useState(0)
  const [annonce, setAnnonce] = useState('')
  const [planification, setPlanification] = useState(false)

  useEffect(() => {
    preparerPile().then(setPile)
  }, [])

  const carte = pile?.[index]
  const fini = pile !== null && index >= pile.length

  async function voter(v: Verdict) {
    if (!carte) return
    await enregistrerGout(carte.cible, carte.refId, { verdict: v })
    setAnnonce(`${carte.titre} : ${VERDICT_LIBELLE[v]}`)
    setIndex((i) => i + 1)
  }

  // Clavier : mêmes gestes que le doigt (→ j'aime, ← j'aime pas, ↑ j'adore, ↓ jamais).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const v: Record<string, Verdict> = { ArrowRight: 'aime', ArrowLeft: 'pas-aime', ArrowUp: 'adore', ArrowDown: 'jamais' }
      if (v[e.key] && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        voter(v[e.key])
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  async function terminer() {
    if (premier) {
      setPlanification(true)
      await planifierSemaine()
      navigate('/semaine', { replace: true })
    } else navigate('/')
  }

  return (
    <Page titre="Swipe" sousTitre={premier ? 'Dernière étape : dis-moi ce que t’aimes.' : 'Tes goûts, en 2 minutes.'}>
      <p className="sr-only" aria-live="polite">
        {annonce}
      </p>
      {pile === null ? null : fini || !carte ? (
        <Vide
          emoji={planification ? '👩‍🍳' : '🎉'}
          titre={planification ? 'Je te prépare ta semaine…' : 'Session terminée !'}
          texte={planification ? undefined : 'Tes suggestions viennent d’être mises à jour.'}
          action={
            !planification && (
              <div className="flex flex-col gap-2">
                <Bouton onClick={terminer}>{premier ? 'Voir ma semaine' : 'Retour à l’accueil'}</Bouton>
                {!premier && (
                  <Bouton variante="doux" onClick={() => preparerPile().then((p) => (setPile(p), setIndex(0)))}>
                    Encore 20 cartes
                  </Bouton>
                )}
              </div>
            )
          }
        />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-sm text-encre-2">
            <span>
              {index + 1} / {pile.length}
            </span>
            <button type="button" className="min-h-11 px-2 font-semibold underline-offset-4 hover:underline" onClick={terminer}>
              {premier ? 'Passer' : 'Arrêter'}
            </button>
          </div>
          <div className="relative mx-auto h-[min(60vh,460px)] w-full">
            {pile[index + 1] && <CarteVisuelle carte={pile[index + 1]} fond />}
            <CarteDraggable key={`${carte.cible}:${carte.refId}`} carte={carte} onVote={voter} />
          </div>
          <div className="mt-5 grid grid-cols-5 gap-2" role="group" aria-label="Ton avis">
            <BoutonVote label="Jamais" emoji="🚫" onClick={() => voter('jamais')} ton="rouge" />
            <BoutonVote label="J'aime pas" emoji="👎" onClick={() => voter('pas-aime')} />
            <BoutonVote label="Pas souvent" emoji="🤏" onClick={() => voter('pas-souvent')} />
            <BoutonVote label="J'aime" emoji="👍" onClick={() => voter('aime')} />
            <BoutonVote label="J'adore" emoji="😍" onClick={() => voter('adore')} ton="orange" />
          </div>
          <p className="mt-3 text-center text-xs text-encre-3">→ j’aime · ← j’aime pas · ↑ j’adore · ↓ jamais</p>
        </>
      )}
    </Page>
  )
}

function BoutonVote({ label, emoji, onClick, ton }: { label: string; emoji: string; onClick: () => void; ton?: 'rouge' | 'orange' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex min-h-16 flex-col items-center justify-center rounded-2xl text-[11px] font-semibold shadow-carte transition-transform duration-100 active:scale-95 ${
        ton === 'rouge' ? 'bg-rouge-doux text-rouge' : ton === 'orange' ? 'bg-orange text-sur-orange' : 'bg-surface text-encre'
      }`}
    >
      <span aria-hidden className="text-2xl">
        {emoji}
      </span>
      {label}
    </button>
  )
}

function CarteVisuelle({ carte, fond = false }: { carte: CarteSwipe; fond?: boolean }) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-surface p-6 text-center shadow-carte ${
        fond ? 'scale-95 opacity-60' : ''
      }`}
      aria-hidden={fond}
    >
      {carte.image ? (
        <img src={carte.image} alt="" className="mb-4 h-40 w-40 rounded-3xl object-contain" />
      ) : (
        <div className="mb-4 flex h-40 w-40 items-center justify-center rounded-full bg-orange-doux text-8xl">{carte.emoji}</div>
      )}
      <div className="text-sm font-semibold uppercase tracking-wide text-encre-3">{carte.sous}</div>
      <h2 className="mt-1 text-3xl font-extrabold">{carte.titre}</h2>
    </div>
  )
}

function CarteDraggable({ carte, onVote }: { carte: CarteSwipe; onVote: (v: Verdict) => void }) {
  const reduit = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const aime = useTransform(x, [20, SEUIL], [0, 1])
  const aimePas = useTransform(x, [-SEUIL, -20], [1, 0])
  const adore = useTransform(y, [-SEUIL, -20], [1, 0])
  const jamais = useTransform(y, [20, SEUIL], [0, 1])
  const etiquettes = useMemo(
    () => [
      { o: aime, t: "J'AIME", c: 'text-vert border-vert left-6 top-6 -rotate-12' },
      { o: aimePas, t: 'BOF', c: 'text-encre-2 border-encre-2 right-6 top-6 rotate-12' },
      { o: adore, t: "J'ADORE", c: 'text-orange-texte border-orange left-1/2 -translate-x-1/2 bottom-8' },
      { o: jamais, t: 'JAMAIS', c: 'text-rouge border-rouge left-1/2 -translate-x-1/2 top-8' },
    ],
    [aime, aimePas, adore, jamais],
  )

  function lacher(_: unknown, info: PanInfo) {
    const { offset, velocity } = info
    const fx = offset.x + velocity.x * 0.15
    const fy = offset.y + velocity.y * 0.15
    let verdict: Verdict | null = null
    if (Math.abs(fx) > Math.abs(fy)) {
      if (fx > SEUIL) verdict = 'aime'
      else if (fx < -SEUIL) verdict = 'pas-aime'
    } else if (fy < -SEUIL) verdict = 'adore'
    else if (fy > SEUIL) verdict = 'jamais'

    if (!verdict) {
      // Retour élastique.
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 28 })
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 28 })
      return
    }
    if (reduit) return onVote(verdict)
    const cible = verdict === 'aime' ? { x: 600 } : verdict === 'pas-aime' ? { x: -600 } : verdict === 'adore' ? { y: -800 } : { y: 800 }
    if ('x' in cible) animate(x, cible.x!, { duration: 0.2, ease: 'easeOut' })
    else animate(y, cible.y!, { duration: 0.2, ease: 'easeOut' })
    setTimeout(() => onVote(verdict!), 160)
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag
      dragSnapToOrigin={false}
      dragElastic={0.9}
      onDragEnd={lacher}
      initial={reduit ? false : { scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <CarteVisuelle carte={carte} />
      {etiquettes.map((e) => (
        <motion.span
          key={e.t}
          style={{ opacity: e.o }}
          className={`pointer-events-none absolute rounded-xl border-4 px-3 py-1 text-2xl font-black ${e.c}`}
          aria-hidden
        >
          {e.t}
        </motion.span>
      ))}
    </motion.div>
  )
}
