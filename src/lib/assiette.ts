import type { Aliment, Recette } from '@/types'

/** Indicateur simple d'équilibre : légume + féculent + protéine. Aucun chiffre nutritionnel. */
export function assietteComplete(r: Recette, alimentsParId: Map<string, Aliment>) {
  const cats = new Set(r.ingredients.map((i) => alimentsParId.get(i.alimentId)?.categorie))
  const legume = cats.has('legume') || cats.has('fruit')
  const feculent = cats.has('feculent')
  const proteine = cats.has('proteine-animale') || cats.has('proteine-vegetale') || cats.has('produit-laitier')
  return { legume, feculent, proteine, complete: legume && feculent && proteine }
}
