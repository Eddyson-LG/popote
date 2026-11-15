import type { ListeCourses } from '@/types'
import { Bouton } from '@/ui'
import { listeEnRappels, listeEnTexte } from './texte'
import { imprimerListe } from './impression'
import { copierTexte, partagerTexte } from './presse-papiers'
import { useMessage } from './useMessage'

const ECHEC_COPIE = 'Oups, impossible de copier ici 😕'

/** Boutons d'export de la liste : partage, Rappels d'iPhone, PDF. */
export function ZoneExport({ liste }: { liste: ListeCourses }) {
  const [message, afficher] = useMessage()
  if (!liste.items.length) return null
  const rienAAcheter = liste.items.every((i) => i.coche)

  async function partager() {
    const r = await partagerTexte('Ma liste Popote', listeEnTexte(liste))
    if (r === 'copie') afficher('Copié ✅ Colle-la où tu veux')
    else if (r === 'echec') afficher(ECHEC_COPIE, { erreur: true })
  }

  async function rappels() {
    if (await copierTexte(listeEnRappels(liste))) afficher('Copié ✅ Dans Rappels, crée un rappel et colle : une ligne = un rappel')
    else afficher(ECHEC_COPIE, { erreur: true })
  }

  return (
    <section aria-label="Emporter ta liste" className="mt-2">
      <div className="flex flex-wrap gap-2">
        <Bouton variante="doux" className="min-w-[8rem] flex-1" onClick={partager} disabled={rienAAcheter}>
          📤 Partager
        </Bouton>
        <Bouton
          variante="doux"
          className="min-w-[8rem] flex-1"
          onClick={() => imprimerListe(liste)}
          disabled={rienAAcheter}
          aria-label="Imprimer ou enregistrer en PDF"
        >
          🖨️ PDF
        </Bouton>
        <Bouton variante="doux" className="w-full" onClick={rappels} disabled={rienAAcheter}>
          ✅ Copier pour Rappels
        </Bouton>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-5 text-center text-sm font-medium ${message.erreur ? 'text-rouge' : 'text-vert'}`}
      >
        {message.texte}
      </p>
    </section>
  )
}
