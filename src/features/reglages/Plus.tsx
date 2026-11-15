import { Link } from 'react-router-dom'
import { Page } from '@/ui'

const ENTREES = [
  { to: '/plus/stock', emoji: '🧺', titre: 'Stock', sous: 'Frigo, congélo, placards' },
  { to: '/plus/tickets', emoji: '🧾', titre: 'Scanner un ticket', sous: 'Tes vrais prix, sans rien taper' },
  { to: '/plus/prix', emoji: '🏷️', titre: 'Prix et comparateur', sous: 'Où ta liste coûte le moins cher' },
  { to: '/plus/economies', emoji: '💰', titre: 'Économies', sous: 'Gamelles vs sandwichs' },
  { to: '/plus/gouts', emoji: '😍', titre: 'Mes goûts', sous: 'Coups de cœur, bannis, tes propres aliments' },
  { to: '/plus/reglages', emoji: '⚙️', titre: 'Réglages', sous: 'Budget, magasins, IA, sauvegarde' },
]

export default function Plus() {
  return (
    <Page titre="Plus">
      <ul className="space-y-2">
        {ENTREES.map((e) => (
          <li key={e.to}>
            <Link to={e.to} className="flex min-h-16 items-center gap-4 rounded-carte bg-surface p-4 shadow-carte">
              <span className="text-3xl" aria-hidden>{e.emoji}</span>
              <span className="flex-1">
                <span className="block font-semibold">{e.titre}</span>
                <span className="block text-sm text-encre-2">{e.sous}</span>
              </span>
              <span aria-hidden className="text-encre-3">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
