import { describe, expect, it } from 'vitest'
import { violationInterdits } from './interdits'
import { PAR_ID } from '@/test/fixtures'

const r = (nom: string, etape = 'Cuis.') => ({ nom, etapes: [etape], tags: [], ingredients: [{ alimentId: 'riz-blanc', quantite: 100, unite: 'g' as const }] })

describe('garde-fou fromage / purée / soupe', () => {
  it.each([
    'Pâtes au pecorino', 'Risotto parmigiano', 'Salade halloumi', 'Minestrone express', 'Harira rapide', 'Bisque de crevettes',
    'Écrasé de pommes de terre', 'Fondue de légumes', 'Croque-monsieur', 'Quiche lorraine', 'Ramen au poulet', 'Velouté de carottes',
  ])('rejette « %s »', (nom) => expect(violationInterdits(r(nom), PAR_ID)).not.toBeNull())

  it('rejette un fromage caché dans les étapes', () => {
    expect(violationInterdits(r('Pâtes', 'Saupoudre de pecorino.'), PAR_ID)).not.toBeNull()
  })
  it.each(['Pâtes au pesto', 'Gnocchis poêlés aux épinards', 'Skyr et kiwi', 'Poulet à l’ail écrasé', 'Riz au bouillon', 'Tomates confites', 'Curry de pois chiches', 'Wrap thon crudités', 'Brick à l’œuf'])(
    'accepte « %s »',
    (nom) => expect(violationInterdits(r(nom, 'Ajoute 1 c. à s. d’huile et l’ail écrasé.'), PAR_ID)).toBeNull(),
  )
})
