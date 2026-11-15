import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { initialiserBase } from '@/lib/seed'
import { useReglages } from '@/lib/hooks'
import { TabBar } from './TabBar'
import { demarrerRafraichissement } from '@/features/prix/rafraichir'
import { notifierAlertes } from '@/features/suivi/notifications'

// Chaque écran est chargé à la demande (démarrage plus rapide sur iPhone).
const Accueil = lazy(() => import('@/features/accueil/Accueil'))
const Swipe = lazy(() => import('@/features/gouts/Swipe'))
const Semaine = lazy(() => import('@/features/recettes/Semaine'))
const Liste = lazy(() => import('@/features/liste/Liste'))
const Plus = lazy(() => import('@/features/reglages/Plus'))
const FicheRecette = lazy(() => import('@/features/recettes/FicheRecette'))
const MesGouts = lazy(() => import('@/features/gouts/MesGouts'))
const Stock = lazy(() => import('@/features/stock/Stock'))
const Tickets = lazy(() => import('@/features/tickets/Tickets'))
const Prix = lazy(() => import('@/features/prix/Prix'))
const Economies = lazy(() => import('@/features/suivi/Economies'))
const VideFrigo = lazy(() => import('@/features/recettes/VideFrigo'))
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding'))

function Chargement() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Chargement">
      <img src="icons/logo.svg" alt="" className="h-16 w-16 animate-pulse rounded-2xl" />
    </div>
  )
}

function Routeur() {
  const reglages = useReglages()
  if (!reglages) return <Chargement />
  if (!reglages.onboardingFait)
    return (
      <Routes>
        <Route path="/bienvenue" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/bienvenue" replace />} />
      </Routes>
    )
  return (
    <>
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/swipe" element={<Swipe />} />
        <Route path="/semaine" element={<Semaine />} />
        <Route path="/liste" element={<Liste />} />
        <Route path="/bienvenue" element={<Navigate to="/swipe?premier=1" replace />} />
        <Route path="/recette/:id" element={<FicheRecette />} />
        <Route path="/plus/gouts" element={<MesGouts />} />
        <Route path="/plus/stock" element={<Stock />} />
        <Route path="/plus/tickets" element={<Tickets />} />
        <Route path="/plus/prix" element={<Prix />} />
        <Route path="/vide-frigo" element={<VideFrigo />} />
        <Route path="/plus/economies" element={<Economies />} />
        <Route path="/plus/*" element={<Plus />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  )
}

export function App() {
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    initialiserBase()
      .then(() => {
        setPret(true)
        // Prix : rafraîchis à l'ouverture si le réseau est là, puis périodiquement.
        demarrerRafraichissement()
        notifierAlertes().catch(() => {})
      })
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [])

  if (erreur)
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Oups, la base locale ne s'ouvre pas</h1>
        <p className="mt-2 text-encre-2">{erreur}</p>
        <p className="mt-2 text-encre-2">Vérifie que la navigation privée est désactivée.</p>
      </div>
    )
  if (!pret) return <Chargement />

  return (
    <HashRouter>
      <Suspense fallback={<Chargement />}>
        <Routeur />
      </Suspense>
    </HashRouter>
  )
}
