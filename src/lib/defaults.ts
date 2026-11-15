import type { Jour, Magasin, Reglages } from '@/types'

const TOUS: Jour[] = [0, 1, 2, 3, 4, 5, 6]

/** Réglages par défaut, alignés sur le profil de départ. */
export function reglagesParDefaut(): Reglages {
  return {
    id: 'moi',
    onboardingFait: false,
    budgetHebdo: 50,
    creneaux: {
      'petit-dejeuner': TOUS,
      gouter: TOUS,
      // Midis de semaine au CROUS : seuls les midis du week-end sont planifiés.
      dejeuner: [5, 6],
      // Soirs de travail (jeu/ven/sam) : gamelle à la place du sandwich.
      gamelle: [3, 4, 5],
      diner: [0, 1, 2, 6],
    },
    midiCrous: true,
    equipement: ['plaques', 'four', 'micro-ondes'],
    tempsMaxMinutes: 30,
    exclusions: ['fromage', 'puree', 'soupe'],
    alimentsExclus: [],
    allergies: '',
    frequenceCourses: 'hebdo',
    seuilRepartition: 3,
    rafraichissementHeures: 6,
    prixRepasDehors: 5,
    iaActive: false,
    notifications: false,
    tokensEntree: 0,
    tokensSortie: 0,
  }
}

export const VILLE_PAR_DEFAUT = 'Taradeau'

/** La ville de chaque magasin est demandée dans le questionnaire. */
export function magasinsParDefaut(): Magasin[] {
  return [
    { id: 'lidl', enseigne: 'Lidl', ville: '', actif: true },
    { id: 'leclerc', enseigne: 'Leclerc', ville: '', actif: true },
    { id: 'carrefour', enseigne: 'Carrefour', ville: '', actif: true },
  ]
}
