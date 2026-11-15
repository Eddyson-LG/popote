/**
 * Liste imprimable / PDF.
 *
 * Choix : on imprime depuis la fenêtre principale, sans dépendance, avec un conteneur
 * dédié et une feuille de style `@media print` qui masque le reste de l'appli.
 * Pourquoi pas une iframe ou une nouvelle fenêtre : sur iOS Safari, `iframe.contentWindow.print()`
 * imprime souvent la page parente, et `window.open` en mode PWA (écran d'accueil) ouvre une vue
 * Safari séparée d'où l'on revient mal. `window.print()` sur la page courante ouvre la feuille
 * d'impression d'iOS, d'où « Enregistrer dans Fichiers » (ou un pincement sur l'aperçu) donne le PDF.
 */
import type { ListeCourses } from '@/types'
import { formatAchat, prix } from '@/lib/format'
import { articlesAExporter, grouperParRayon, libelleSemaine, totauxExport } from './texte'

const ID_CONTENEUR = 'popote-impression'
const ID_STYLE = 'popote-impression-style'

/** Échappement HTML (les noms d'articles manuels sont saisis par l'utilisateur). */
export function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Fragment HTML de la liste imprimable (articles non cochés, cases vides, quantités, prix, total, date). */
export function listeEnHtml(liste: ListeCourses, maintenant = new Date()): string {
  const items = articlesAExporter(liste)
  const t = totauxExport(items)
  const date = maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const sections = grouperParRayon(items)
    .map(
      (g) => `<section>
  <h2>${echapper(g.libelle)}</h2>
  <ul>${g.items
    .map(
      (i) => `
    <li><span class="case"></span><span class="nom">${echapper(i.nom)}</span><span class="qte">${echapper(
      formatAchat(i.nbFormats, i.libelleFormat),
    )}</span><span class="prix">${echapper(prix(i.prixPaye ?? i.prixEstime))}</span></li>`,
    )
    .join('')}
  </ul>
</section>`,
    )
    .join('\n')

  return `<header>
  <h1>Liste de courses — semaine du ${echapper(libelleSemaine(liste))}</h1>
  <p class="date">Imprimée le ${echapper(date)} · ${items.length} article${items.length > 1 ? 's' : ''}</p>
</header>
${sections || '<p>Rien à acheter cette semaine.</p>'}
<footer>
  <p class="total"><span>Total estimé</span><span>${echapper(prix(t.principal))}</span></p>
  ${t.placard > 0 ? `<p class="placard">+ ${echapper(prix(t.placard))} de placard si tu dois tout racheter (non compté)</p>` : ''}
  <p class="source">Prix estimés par Popote, à titre indicatif.</p>
</footer>`
}

const CSS_IMPRESSION = `
#${ID_CONTENEUR} { display: none; }
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body > *:not(#${ID_CONTENEUR}) { display: none !important; }
  #${ID_CONTENEUR} { display: block; color: #000; font: 11pt/1.35 system-ui, -apple-system, sans-serif; }
  #${ID_CONTENEUR} h1 { font-size: 16pt; margin: 0 0 2pt; }
  #${ID_CONTENEUR} .date { color: #444; margin: 0 0 10pt; }
  #${ID_CONTENEUR} section { break-inside: avoid; margin-bottom: 8pt; }
  #${ID_CONTENEUR} h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #000; padding-bottom: 2pt; margin: 0 0 4pt; }
  #${ID_CONTENEUR} ul { list-style: none; margin: 0; padding: 0; }
  #${ID_CONTENEUR} li { display: flex; align-items: center; gap: 8pt; padding: 3pt 0; border-bottom: 1px dotted #bbb; }
  #${ID_CONTENEUR} .case { flex: none; width: 10pt; height: 10pt; border: 1.2pt solid #000; border-radius: 2pt; }
  #${ID_CONTENEUR} .nom { flex: 1; }
  #${ID_CONTENEUR} .qte { color: #333; }
  #${ID_CONTENEUR} .prix { min-width: 48pt; text-align: right; font-variant-numeric: tabular-nums; }
  #${ID_CONTENEUR} .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 13pt; border-top: 1.5pt solid #000; padding-top: 4pt; margin: 10pt 0 2pt; }
  #${ID_CONTENEUR} .placard, #${ID_CONTENEUR} .source { color: #444; font-size: 9pt; margin: 2pt 0; }
}`

/** Nettoie un éventuel conteneur d'impression précédent. */
function nettoyer() {
  document.getElementById(ID_CONTENEUR)?.remove()
  document.getElementById(ID_STYLE)?.remove()
}

/** Ouvre la feuille d'impression du navigateur (→ « Enregistrer en PDF »). */
export function imprimerListe(liste: ListeCourses): void {
  nettoyer()
  const style = document.createElement('style')
  style.id = ID_STYLE
  style.textContent = CSS_IMPRESSION
  const conteneur = document.createElement('div')
  conteneur.id = ID_CONTENEUR
  conteneur.innerHTML = listeEnHtml(liste)
  document.head.appendChild(style)
  document.body.appendChild(conteneur)

  // Le titre du document sert de nom au PDF enregistré.
  const titreAvant = document.title
  document.title = `Liste Popote ${liste.id}`
  const fin = () => {
    document.title = titreAvant
    nettoyer()
    window.removeEventListener('afterprint', fin)
  }
  window.addEventListener('afterprint', fin)
  window.print()
}
