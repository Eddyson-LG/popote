const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** 12.5 → « 12,50 € » */
export function prix(montant: number): string {
  return euros.format(montant)
}

/** Quantité lisible : 1500 g → « 1,5 kg », 3 pièces → « 3 ». */
export function quantite(q: number, unite: 'g' | 'ml' | 'piece'): string {
  const arrondi = (n: number) => (Math.round(n * 10) / 10).toLocaleString('fr-FR')
  if (unite === 'g') return q >= 1000 ? `${arrondi(q / 1000)} kg` : `${Math.round(q)} g`
  if (unite === 'ml') return q >= 1000 ? `${arrondi(q / 1000)} L` : `${Math.round(q)} ml`
  return arrondi(q)
}

/** « 2 × paquet de 500 g », « 5 pièces », « boîte de 6 ». */
export function formatAchat(nbFormats: number, libelle: string): string {
  if (/^la pi[eè]ce$/i.test(libelle)) return nbFormats > 1 ? `${nbFormats} pièces` : '1 pièce'
  return nbFormats > 1 ? `${nbFormats} × ${libelle}` : libelle
}
