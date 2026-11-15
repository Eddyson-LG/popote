/**
 * Scanner de codes-barres plein écran, réutilisable.
 *
 * - Caméra arrière via getUserMedia (Safari iOS 11+, HTTPS obligatoire, vidéo `playsInline` + `muted`).
 * - Décodage : API native BarcodeDetector quand elle existe et gère l'EAN-13 (Chrome Android, macOS) ;
 *   sinon @zxing/browser (chargé à la demande), qui fonctionne sur Safari iOS (BarcodeDetector absent).
 * - Refus de permission, absence de caméra, contexte non sécurisé → saisie manuelle du code.
 * - La caméra est libérée à la fermeture (pistes arrêtées, srcObject vidé).
 */
import { useEffect, useRef, useState } from 'react'
import type { DecodeHintType as TypeIndice } from '@zxing/library'
import { Bouton } from '@/ui'
import { codeBarresValide } from './off'

type Etat = 'demarrage' | 'scan' | 'refus' | 'indisponible' | 'erreur'

/** Typage minimal de l'API BarcodeDetector (absente de lib.dom). */
interface DetecteurNatif {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
interface ConstructeurDetecteur {
  new (options?: { formats: string[] }): DetecteurNatif
  getSupportedFormats?: () => Promise<string[]>
}

const FORMATS_NATIFS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

async function detecteurNatif(): Promise<DetecteurNatif | null> {
  const C = (globalThis as unknown as { BarcodeDetector?: ConstructeurDetecteur }).BarcodeDetector
  if (!C) return null
  try {
    const formats = (await C.getSupportedFormats?.()) ?? []
    const utiles = FORMATS_NATIFS.filter((f) => formats.includes(f))
    if (!utiles.includes('ean_13')) return null
    return new C({ formats: utiles })
  } catch {
    return null
  }
}

/** UPC-E (8 chiffres commençant par 0 ou 1) n'est pas vérifiable par la clé EAN : accepté tel quel. */
function codeAcceptable(code: string): boolean {
  return codeBarresValide(code) || /^[01]\d{7}$/.test(code)
}

export function ScannerCodeBarres({ onDetect, onFermer }: { onDetect: (code: string) => void; onFermer: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [etat, setEtat] = useState<Etat>('demarrage')
  const [manuel, setManuel] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [erreurSaisie, setErreurSaisie] = useState('')
  // Rappels dans des refs : l'effet caméra ne redémarre pas à chaque rendu du parent.
  const rappels = useRef({ onDetect, onFermer })
  rappels.current = { onDetect, onFermer }

  useEffect(() => {
    let annule = false
    let flux: MediaStream | null = null
    let arretZxing: (() => void) | null = null
    let minuteur: ReturnType<typeof setTimeout> | null = null
    let detecte = false

    const liberer = () => {
      if (minuteur) clearTimeout(minuteur)
      arretZxing?.()
      flux?.getTracks().forEach((t) => t.stop())
      flux = null
      if (video.current) video.current.srcObject = null
    }

    const trouve = (brut: string) => {
      const code = brut.replace(/\D/g, '')
      if (detecte || annule || !codeAcceptable(code)) return
      detecte = true
      navigator.vibrate?.(60)
      liberer()
      rappels.current.onDetect(code)
    }

    const demarrer = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setEtat('indisponible')
        setManuel(true)
        return
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
      } catch (e) {
        if (annule) return
        const nom = (e as DOMException)?.name
        setEtat(nom === 'NotAllowedError' || nom === 'SecurityError' ? 'refus' : nom === 'NotFoundError' || nom === 'OverconstrainedError' ? 'indisponible' : 'erreur')
        setManuel(true)
        return
      }
      if (annule || !video.current) {
        liberer()
        return
      }
      const v = video.current
      v.srcObject = flux
      try {
        await v.play()
      } catch {
        // Safari peut rejeter play() si l'élément est démonté entre-temps : on continue.
      }
      if (annule) return liberer()
      setEtat('scan')

      const natif = await detecteurNatif()
      if (annule) return liberer()
      if (natif) {
        const boucle = async () => {
          if (annule || detecte) return
          try {
            if (v.readyState >= 2) {
              const r = await natif.detect(v)
              if (r[0]) trouve(r[0].rawValue)
            }
          } catch {
            // Image non décodable : on réessaie.
          }
          if (!annule && !detecte) minuteur = setTimeout(boucle, 180)
        }
        boucle()
        return
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
        if (annule) return liberer()
        const indices = new Map<TypeIndice, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
        ])
        const lecteur = new BrowserMultiFormatReader(indices, { delayBetweenScanAttempts: 150 })
        const controles = await lecteur.decodeFromVideoElement(v, (resultat) => {
          if (resultat) trouve(resultat.getText())
        })
        arretZxing = () => controles.stop()
        if (annule) liberer()
      } catch {
        if (annule) return
        liberer()
        setEtat('erreur')
        setManuel(true)
      }
    }

    demarrer()
    return () => {
      annule = true
      liberer()
    }
  }, [])

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && rappels.current.onFermer()
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [])

  const valider = (e: React.FormEvent) => {
    e.preventDefault()
    const code = saisie.replace(/\D/g, '')
    if (!codeAcceptable(code)) {
      setErreurSaisie('Ce code ne semble pas valide : vérifie les chiffres sous le code-barres (8 ou 13 en général).')
      return
    }
    rappels.current.onDetect(code)
  }

  const messages: Record<Etat, string> = {
    demarrage: 'Ouverture de la caméra…',
    scan: 'Vise le code-barres, bien à plat et éclairé.',
    refus: "Accès à la caméra refusé. Tu peux l'autoriser dans Réglages › Safari › Caméra, ou taper le code.",
    indisponible: 'Pas de caméra disponible ici. Tape le code écrit sous le code-barres.',
    erreur: 'La caméra n’a pas pu démarrer. Tape le code écrit sous le code-barres.',
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Scanner un code-barres" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="pt-safe flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-bold">Scanner un produit</h2>
        <button type="button" onClick={() => rappels.current.onFermer()} aria-label="Fermer le scanner" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl">
          ×
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={video} muted playsInline autoPlay aria-hidden className={`h-full w-full object-cover ${etat === 'scan' ? '' : 'opacity-0'}`} />
        {etat === 'scan' && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-4/5 max-w-sm rounded-2xl border-4 border-white/85 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
          </div>
        )}
        <p role="status" className="absolute inset-x-4 bottom-4 rounded-xl bg-black/60 p-3 text-center text-base">
          {messages[etat]}
        </p>
      </div>

      <div className="pb-safe bg-black px-4 pt-3">
        {manuel ? (
          <form onSubmit={valider} className="flex flex-col gap-2">
            <label htmlFor="code-manuel" className="text-sm text-white/80">
              Code-barres (chiffres)
            </label>
            <div className="flex gap-2">
              <input
                id="code-manuel"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9 ]*"
                value={saisie}
                onChange={(e) => (setSaisie(e.target.value), setErreurSaisie(''))}
                placeholder="3017620422003"
                aria-invalid={!!erreurSaisie}
                aria-describedby={erreurSaisie ? 'code-manuel-erreur' : undefined}
                className="min-h-12 flex-1 rounded-xl bg-white px-4 text-base text-black"
              />
              <Bouton type="submit" variante="orange">
                OK
              </Bouton>
            </div>
            {erreurSaisie && (
              <p id="code-manuel-erreur" className="text-sm text-orange-doux">
                {erreurSaisie}
              </p>
            )}
          </form>
        ) : (
          <Bouton variante="doux" grand onClick={() => setManuel(true)}>
            Taper le code à la main
          </Bouton>
        )}
      </div>
    </div>
  )
}
