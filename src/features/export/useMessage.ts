import { useCallback, useEffect, useRef, useState } from 'react'

export interface Message {
  texte: string
  erreur: boolean
}

/** Petit message de retour (« Copié ✅ ») qui s'efface tout seul, sans alert(). */
export function useMessage(dureeMs = 3000) {
  const [message, setMessage] = useState<Message>({ texte: '', erreur: false })
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(minuteur.current), [])
  const afficher = useCallback(
    (texte: string, options: { erreur?: boolean; persistant?: boolean } = {}) => {
      clearTimeout(minuteur.current)
      setMessage({ texte, erreur: !!options.erreur })
      if (!options.persistant) minuteur.current = setTimeout(() => setMessage({ texte: '', erreur: false }), dureeMs)
    },
    [dureeMs],
  )
  return [message, afficher] as const
}
