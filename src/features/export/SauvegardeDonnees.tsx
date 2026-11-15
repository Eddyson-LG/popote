import { useId, useState, type ChangeEvent } from 'react'
import { TABLES } from '@/lib/db'
import { Bouton, Carte } from '@/ui'
import { LIBELLES_TABLES, exporterBase, nomFichierSauvegarde, restaurerSauvegarde, validerSauvegarde, type ResultatValidation } from './sauvegarde'
import { useMessage } from './useMessage'

type Valide = Extract<ResultatValidation, { ok: true }>

/** Fichier de sauvegarde prêt à télécharger ou partager. */
async function fichierSauvegarde(): Promise<File> {
  const sauvegarde = await exporterBase()
  return new File([JSON.stringify(sauvegarde, null, 2)], nomFichierSauvegarde(), { type: 'application/json' })
}

function telecharger(fichier: File) {
  const url = URL.createObjectURL(fichier)
  const a = document.createElement('a')
  a.href = url
  a.download = fichier.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Le partage de fichiers (AirDrop, Fichiers…) est-il possible ici ? */
function peutPartagerFichier(): boolean {
  try {
    const test = new File(['{}'], 'test.json', { type: 'application/json' })
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [test] })
  } catch {
    return false
  }
}

/** Sauvegarde / restauration JSON de toutes les données (affiché dans les Réglages). */
export function SauvegardeDonnees() {
  const idFichier = useId()
  const [message, afficher] = useMessage(4000)
  const [enAttente, setEnAttente] = useState<(Valide & { nomFichier: string }) | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [partageFichier] = useState(peutPartagerFichier)

  async function exporter(mode: 'telecharger' | 'partager') {
    setOccupe(true)
    try {
      const fichier = await fichierSauvegarde()
      if (mode === 'partager') {
        try {
          await navigator.share({ files: [fichier], title: 'Sauvegarde Popote' })
          afficher('Sauvegarde partagée ✅')
        } catch (e) {
          // Annulé : on ne dit rien. Autre erreur : on se rabat sur le téléchargement.
          if ((e as Error)?.name !== 'AbortError') {
            telecharger(fichier)
            afficher('Fichier téléchargé ✅')
          }
        }
      } else {
        telecharger(fichier)
        afficher('Fichier téléchargé ✅ (sans ta clé API, elle reste ici)')
      }
    } catch {
      afficher('Oups, la sauvegarde a planté 😕 Réessaie.', { erreur: true })
    } finally {
      setOccupe(false)
    }
  }

  async function choisirFichier(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = '' // pour pouvoir re-choisir le même fichier
    if (!fichier) return
    setEnAttente(null)
    const r = validerSauvegarde(await fichier.text())
    if (!r.ok) afficher(r.erreur, { erreur: true, persistant: true })
    else {
      afficher('')
      setEnAttente({ ...r, nomFichier: fichier.name })
    }
  }

  async function confirmer() {
    if (!enAttente) return
    setOccupe(true)
    try {
      await restaurerSauvegarde(enAttente.sauvegarde)
      setEnAttente(null)
      afficher('C’est restauré ✅ Tes données sont de retour.')
    } catch {
      afficher('Oups, la restauration a échoué : rien n’a été modifié.', { erreur: true, persistant: true })
    } finally {
      setOccupe(false)
    }
  }

  const exporteLe = enAttente && new Date(enAttente.sauvegarde.exporteLe)

  return (
    <Carte>
      <h2 className="text-lg font-bold">💾 Sauvegarde de tes données</h2>
      <p className="mt-1 text-sm text-encre-2">
        Tout vit sur ton téléphone. Fais une copie de temps en temps (ta clé API n’est jamais dedans).
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {partageFichier && (
          <Bouton onClick={() => exporter('partager')} disabled={occupe}>
            📤 Envoyer la sauvegarde (AirDrop, Fichiers…)
          </Bouton>
        )}
        <Bouton variante={partageFichier ? 'doux' : 'cta'} onClick={() => exporter('telecharger')} disabled={occupe}>
          ⬇️ Télécharger le fichier
        </Bouton>

        <label
          htmlFor={idFichier}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-surface-2 px-5 font-semibold text-encre transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-orange active:scale-[0.97]"
        >
          📂 Restaurer une sauvegarde
          <input
            id={idFichier}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={choisirFichier}
            disabled={occupe}
          />
        </label>
      </div>

      {enAttente && (
        <div className="mt-4 rounded-carte bg-orange-doux p-3" role="region" aria-label="Aperçu de la sauvegarde">
          <p className="font-semibold">
            {enAttente.nomFichier}
            {exporteLe && !Number.isNaN(exporteLe.getTime()) && (
              <span className="block text-sm font-normal text-encre-2">
                Faite le {exporteLe.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            )}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {TABLES.filter((t) => t !== 'meta').map((t) => (
              <li key={t} className="flex justify-between gap-2">
                <span className="text-encre-2">{LIBELLES_TABLES[t]}</span>
                <span className="font-semibold tabular-nums">{enAttente.apercu[t]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-medium text-rouge">
            Attention : ça remplace tout ce qu’il y a sur ce téléphone par le contenu du fichier. Ta clé API reste en place.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Bouton variante="danger" className="flex-1" onClick={confirmer} disabled={occupe}>
              Oui, remplace tout
            </Bouton>
            <Bouton variante="doux" className="flex-1" onClick={() => setEnAttente(null)} disabled={occupe}>
              Annuler
            </Bouton>
          </div>
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-5 text-sm font-medium ${message.erreur ? 'text-rouge' : 'text-vert'}`}
      >
        {message.texte}
      </p>
    </Carte>
  )
}
