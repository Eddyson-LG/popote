import { NavLink } from 'react-router-dom'

const ONGLETS = [
  { to: '/', label: 'Accueil', icone: '🏠' },
  { to: '/swipe', label: 'Swipe', icone: '🔥' },
  { to: '/semaine', label: 'Semaine', icone: '📅' },
  { to: '/liste', label: 'Liste', icone: '🛒' },
  { to: '/plus', label: 'Plus', icone: '☰' },
] as const

/** Barre d'onglets en bas, au-dessus de la barre home de l'iPhone. */
export function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-trait bg-fond/90 backdrop-blur-lg"
    >
      <ul className="mx-auto flex max-w-xl justify-around px-2 pt-1">
        {ONGLETS.map((o) => (
          <li key={o.to} className="flex-1">
            <NavLink
              to={o.to}
              end={o.to === '/'}
              className={({ isActive }) =>
                `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold ${
                  isActive ? 'text-orange-texte' : 'text-encre-3'
                }`
              }
            >
              <span aria-hidden className="text-xl leading-none">
                {o.icone}
              </span>
              {o.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
