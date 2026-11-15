/**
 * OCR local avec Tesseract.js (français), chargé à la demande.
 *
 * Ce fichier n'est importé que dynamiquement (voir extraction.ts) : ni Tesseract ni ses
 * fichiers ne pèsent sur le démarrage de l'appli.
 *
 * Mise en cache hors ligne :
 * - le script du worker et le cœur WebAssembly (variante SIMD + LSTM, ~3,9 Mo) sont servis
 *   par l'appli elle-même (imports `?url`) : ils tombent dans le précache du service worker
 *   (motif **∕*.js, limite 6 Mo), donc disponibles hors ligne après installation ;
 * - un appareil sans WebAssembly SIMD (iOS < 16.4) charge le cœur depuis jsDelivr (en ligne) ;
 * - les données de langue `fra.traineddata` (~1,5 Mo, jsDelivr) sont téléchargées au premier
 *   usage, puis gardées par Tesseract dans IndexedDB (cacheMethod 'write' par défaut) :
 *   la lecture marche hors ligne dès le deuxième ticket.
 */
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'

export type ProgresOCR = (etape: 'chargement' | 'lecture', progres: number) => void

/** Module WebAssembly minimal utilisant une instruction SIMD (test de wasm-feature-detect). */
const TEST_SIMD = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11)

function simdDisponible(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(TEST_SIMD)
  } catch {
    return false
  }
}

const absolue = (u: string) => new URL(u, location.href).href

/**
 * Prépare la photo pour l'OCR : bord long ≤ 2000 px (mémoire de l'iPhone),
 * niveaux de gris et étirement du contraste (fait à la main : `ctx.filter` est mal supporté par Safari).
 */
async function preparer(fichier: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(fichier)
  const echelle = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * echelle)
  canvas.height = Math.round(bitmap.height * echelle)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = y
    if (y < min) min = y
    if (y > max) max = y
  }
  const etendue = Math.max(1, max - min)
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / etendue) * 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Lit le texte d'une photo de ticket, entièrement sur l'appareil. */
export async function lireTexte(fichier: Blob, progres?: ProgresOCR): Promise<string> {
  progres?.('chargement', 0)
  const mod = await import('tesseract.js')
  const T = (mod as unknown as { default?: typeof mod }).default ?? mod
  const worker = await T.createWorker('fra', T.OEM.LSTM_ONLY, {
    workerPath: absolue(workerUrl),
    corePath: simdDisponible() ? absolue(coreSimdUrl) : undefined,
    logger: (m) => {
      if (m.status === 'recognizing text') progres?.('lecture', m.progress)
      else progres?.('chargement', m.progress)
    },
    errorHandler: () => {
      /* l'erreur remonte par la promesse de recognize */
    },
  })
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: T.PSM.SINGLE_COLUMN,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const canvas = await preparer(fichier)
    const { data } = await worker.recognize(canvas)
    return data.text ?? ''
  } finally {
    // On libère la mémoire WebAssembly (plusieurs dizaines de Mo) : important sur iPhone.
    await worker.terminate()
  }
}
