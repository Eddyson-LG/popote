import { describe, expect, it } from 'vitest'
import { age, ajouterJours, jourDe, lundiDe } from './dates'

describe('dates', () => {
  it('trouve le lundi de la semaine', () => {
    expect(lundiDe(new Date(2026, 10, 15))).toBe('2026-11-09') // dimanche 15/11
    expect(lundiDe(new Date(2026, 10, 9))).toBe('2026-11-09')
  })
  it('numérote les jours à partir du lundi', () => {
    expect(jourDe(new Date(2026, 10, 9))).toBe(0)
    expect(jourDe(new Date(2026, 10, 15))).toBe(6)
  })
  it('ajoute des jours en changeant de mois', () => {
    expect(ajouterJours('2026-11-30', 2)).toBe('2026-12-02')
  })
  it("affiche l'âge d'un prix", () => {
    const now = new Date('2026-11-15T12:00:00')
    expect(age('2026-11-15T08:00:00', now)).toBe("aujourd'hui")
    expect(age('2026-11-14T08:00:00', now)).toBe('hier')
    expect(age('2026-09-01T08:00:00', now)).toBe('il y a 2 mois')
  })
})

import { semaineActive } from './dates'
describe('semaine active', () => {
  it('passe à la semaine suivante le dimanche', () => {
    expect(semaineActive(new Date(2026, 10, 15))).toBe('2026-11-16')
    expect(semaineActive(new Date(2026, 10, 14))).toBe('2026-11-09')
  })
})
