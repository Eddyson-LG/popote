// Génère les icônes PWA et les écrans de lancement iOS depuis les SVG du logo.
// Usage : npm run icones
//
// Sources : public/icons/logo.svg (icône complète, fond orange)
//           public/icons/logo-mark.svg (pictogramme seul, fond transparent)
// Le pictogramme est repéré entre les commentaires <!-- pictogramme:debut --> et
// <!-- pictogramme:fin --> pour être recomposé (fond plein, zone de sécurité maskable).
// Le bloc <!-- POPOTE:SPLASH:debut --> … <!-- POPOTE:SPLASH:fin --> d'index.html est réécrit.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dossierIcones = path.join(racine, 'public/icons')
const dossierSplash = path.join(racine, 'public/splash')

const ORANGE = '#FF6B1A'
const CREME = '#FFF8F1'
const SOMBRE = '#16120F'

// Écrans d'iPhone en portrait : points CSS (largeur × hauteur) et densité.
const ECRANS = [
  { l: 375, h: 667, dpr: 2, appareils: 'iPhone SE 2/3, 8' },
  { l: 414, h: 896, dpr: 2, appareils: 'iPhone 11, XR' },
  { l: 375, h: 812, dpr: 3, appareils: 'iPhone X, XS, 11 Pro' },
  { l: 360, h: 780, dpr: 3, appareils: 'iPhone 12/13 mini' },
  { l: 414, h: 896, dpr: 3, appareils: 'iPhone XS Max, 11 Pro Max' },
  { l: 390, h: 844, dpr: 3, appareils: 'iPhone 12, 13, 14, 16e' },
  { l: 428, h: 926, dpr: 3, appareils: 'iPhone 12/13 Pro Max, 14 Plus' },
  { l: 393, h: 852, dpr: 3, appareils: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { l: 430, h: 932, dpr: 3, appareils: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus' },
  { l: 402, h: 874, dpr: 3, appareils: 'iPhone 16 Pro, 17, 17 Pro' },
  { l: 420, h: 912, dpr: 3, appareils: 'iPhone Air' },
  { l: 440, h: 956, dpr: 3, appareils: 'iPhone 16 Pro Max, 17 Pro Max' },
]

function extrairePictogramme(svg, nom) {
  const m = svg.match(/<!-- pictogramme:debut -->([\s\S]*?)<!-- pictogramme:fin -->/)
  if (!m) throw new Error(`${nom} : marqueurs pictogramme:debut / pictogramme:fin introuvables`)
  return m[1]
}

// Icône carrée 512 : fond plein (coins arrondis optionnels) + pictogramme mis à l'échelle autour du centre.
function composerIcone(pictogramme, { fond, echelle = 1, rayon = 0 }) {
  const fondSvg = fond ? `<rect width="512" height="512" rx="${rayon}" fill="${fond}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${fondSvg}<g transform="translate(256 256) scale(${echelle}) translate(-256 -256)">${pictogramme}</g></svg>`
}

async function png(svg, taille, fichier, { opaque = false } = {}) {
  let img = sharp(Buffer.from(svg), { density: Math.max(72, (72 * taille) / 512) * 4 }).resize(taille, taille)
  if (opaque) img = img.flatten({ background: ORANGE })
  await img.png({ compressionLevel: 9 }).toFile(fichier)
}

async function main() {
  await mkdir(dossierIcones, { recursive: true })
  await mkdir(dossierSplash, { recursive: true })

  const logo = await readFile(path.join(dossierIcones, 'logo.svg'), 'utf8')
  const marque = await readFile(path.join(dossierIcones, 'logo-mark.svg'), 'utf8')
  const pictoIcone = extrairePictogramme(logo, 'logo.svg')
  const pictoMarque = extrairePictogramme(marque, 'logo-mark.svg')

  // Icônes « any » : le logo tel quel (coins arrondis).
  await png(logo, 192, path.join(dossierIcones, 'icon-192.png'))
  await png(logo, 512, path.join(dossierIcones, 'icon-512.png'))
  await png(logo, 32, path.join(dossierIcones, 'favicon-32.png'))

  // Maskable : fond plein, pictogramme dans le cercle central de 80 % (rayon 205 px sur 512).
  await png(composerIcone(pictoIcone, { fond: ORANGE, echelle: 0.76 }), 512, path.join(dossierIcones, 'icon-maskable-512.png'), { opaque: true })

  // Apple touch icon : carré plein, sans transparence (iOS arrondit lui-même).
  await png(composerIcone(pictoIcone, { fond: ORANGE, echelle: 0.94 }), 180, path.join(dossierIcones, 'apple-touch-icon-180.png'), { opaque: true })

  // Écrans de lancement : pictogramme centré sur fond crème (clair) ou sombre.
  const balises = []
  for (const e of ECRANS) {
    const largeur = e.l * e.dpr
    const hauteur = e.h * e.dpr
    const tailleMarque = Math.round(largeur * 0.44)
    const marquePng = await sharp(Buffer.from(composerIcone(pictoMarque, {})), { density: (72 * tailleMarque) / 512 * 2 })
      .resize(tailleMarque, tailleMarque)
      .png()
      .toBuffer()
    for (const [theme, fond] of [['clair', CREME], ['sombre', SOMBRE]]) {
      const nom = `splash-${largeur}x${hauteur}-${theme}.png`
      await sharp({ create: { width: largeur, height: hauteur, channels: 3, background: fond } })
        .composite([{ input: marquePng, left: Math.round((largeur - tailleMarque) / 2), top: Math.round((hauteur - tailleMarque) / 2) }])
        .png({ compressionLevel: 9 })
        .toFile(path.join(dossierSplash, nom))
      const schema = theme === 'clair' ? 'light' : 'dark'
      balises.push(
        `    <link rel="apple-touch-startup-image" href="splash/${nom}" media="(device-width: ${e.l}px) and (device-height: ${e.h}px) and (-webkit-device-pixel-ratio: ${e.dpr}) and (orientation: portrait) and (prefers-color-scheme: ${schema})" />`,
      )
    }
  }

  // Réécrit le bloc des écrans de lancement dans index.html.
  const cheminIndex = path.join(racine, 'index.html')
  const index = await readFile(cheminIndex, 'utf8')
  const bloc = [
    '<!-- POPOTE:SPLASH:debut (généré par npm run icones, ne pas modifier à la main) -->',
    '    <link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png" />',
    ...balises,
    '    <!-- POPOTE:SPLASH:fin -->',
  ].join('\n')
  const motif = /<!-- POPOTE:SPLASH:debut[\s\S]*?<!-- POPOTE:SPLASH:fin -->|<!-- POPOTE:SPLASH[^>]*-->/
  if (!motif.test(index)) throw new Error('index.html : bloc POPOTE:SPLASH introuvable')
  await writeFile(cheminIndex, index.replace(motif, bloc))

  console.log(`Icônes : 5 PNG dans public/icons/ ; écrans de lancement : ${ECRANS.length * 2} PNG dans public/splash/ ; index.html mis à jour.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
