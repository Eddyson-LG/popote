/** Copie et partage de texte, avec replis pour iOS Safari. */

/** Copie du texte ; renvoie false si le navigateur refuse. */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte)
      return true
    }
  } catch {
    // On tente le repli ci-dessous.
  }
  // Repli : textarea temporaire + execCommand (anciens Safari, contextes non sécurisés).
  try {
    const zone = document.createElement('textarea')
    zone.value = texte
    zone.setAttribute('readonly', '')
    zone.style.position = 'fixed'
    zone.style.opacity = '0'
    zone.style.fontSize = '16px' // évite le zoom d'iOS
    document.body.appendChild(zone)
    zone.select()
    zone.setSelectionRange(0, texte.length)
    const ok = document.execCommand('copy')
    zone.remove()
    return ok
  } catch {
    return false
  }
}

export type ResultatPartage = 'partage' | 'copie' | 'echec'

/**
 * Feuille de partage native si dispo ; sinon (ou si l'utilisateur annule) copie dans le presse-papiers.
 */
export async function partagerTexte(titre: string, texte: string): Promise<ResultatPartage> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: titre, text: texte })
      return 'partage'
    } catch {
      // Annulé ou refusé : on copie à la place.
    }
  }
  return (await copierTexte(texte)) ? 'copie' : 'echec'
}
