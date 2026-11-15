/**
 * Composants d'interface partagés (design system Popote).
 * Les modules les réutilisent plutôt que de recréer leurs propres boutons ou cartes.
 */
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variante = 'cta' | 'orange' | 'doux' | 'fantome' | 'danger'

const VARIANTES: Record<Variante, string> = {
  cta: 'bg-cta text-cta-texte',
  orange: 'bg-orange text-sur-orange',
  doux: 'bg-surface-2 text-encre',
  fantome: 'bg-transparent text-encre underline-offset-4 hover:underline',
  danger: 'bg-rouge-doux text-rouge',
}

export function Bouton({
  variante = 'cta',
  grand = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; grand?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-semibold transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-40 ${
        grand ? 'min-h-14 w-full text-lg' : 'text-base'
      } ${VARIANTES[variante]} ${className}`}
    />
  )
}

export function Carte({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-carte bg-surface p-4 shadow-carte ${className}`}>{children}</div>
}

export function Page({
  titre,
  sousTitre,
  action,
  children,
}: {
  titre: string
  sousTitre?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="pt-safe mx-auto w-full max-w-xl px-4 pb-28">
      <header className="mb-5 flex items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="text-3xl font-extrabold">{titre}</h1>
          {sousTitre && <p className="mt-1 text-encre-2">{sousTitre}</p>}
        </div>
        {action}
      </header>
      {children}
    </main>
  )
}

/** Pastille : source et âge d'un prix, « estimé », promo… */
export function Pastille({ children, ton = 'neutre' }: { children: ReactNode; ton?: 'neutre' | 'orange' | 'vert' | 'rouge' }) {
  const tons = {
    neutre: 'bg-surface-2 text-encre-2',
    orange: 'bg-orange-doux text-orange-texte',
    vert: 'bg-vert-doux text-vert',
    rouge: 'bg-rouge-doux text-rouge',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tons[ton]}`}>{children}</span>
}

/** Jauge de budget : vert si OK, orange à l'approche, rouge si dépassé. */
export function Jauge({ valeur, max, libelle }: { valeur: number; max: number; libelle: string }) {
  const ratio = max > 0 ? Math.min(valeur / max, 1) : 0
  const couleur = valeur > max ? 'bg-rouge' : ratio > 0.85 ? 'bg-orange' : 'bg-vert'
  return (
    <div role="meter" aria-label={libelle} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(valeur * 100) / 100}>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${couleur} transition-[width] duration-200`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

export function Vide({ emoji, titre, texte, action }: { emoji: string; titre: string; texte?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="text-6xl" aria-hidden>
        {emoji}
      </div>
      <h2 className="text-xl font-bold">{titre}</h2>
      {texte && <p className="max-w-xs text-encre-2">{texte}</p>}
      {action}
    </div>
  )
}

/**
 * Champ numérique : on tape librement, la valeur n'est bornée (min/max) et enregistrée
 * qu'à la sortie du champ ou sur Entrée. Évite le piège du champ contrôlé corrigé à chaque frappe.
 */
export function ChampNombre({
  valeur,
  onValider,
  min,
  max,
  pas = 1,
  libelle,
  className = '',
}: {
  valeur: number
  onValider: (v: number) => void
  min: number
  max: number
  pas?: number
  libelle: string
  className?: string
}) {
  const [texte, setTexte] = useState(String(valeur))
  useEffect(() => setTexte(String(valeur)), [valeur])
  const valider = () => {
    const n = Number(texte.replace(',', '.'))
    const borne = Number.isFinite(n) && texte.trim() !== '' ? Math.min(max, Math.max(min, Math.round(n / pas) * pas)) : valeur
    setTexte(String(borne))
    if (borne !== valeur) onValider(borne)
  }
  return (
    <input
      inputMode="decimal"
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      aria-label={libelle}
      className={`min-h-11 w-20 rounded-xl bg-surface-2 px-3 text-right ${className}`}
    />
  )
}
