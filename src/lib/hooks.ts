import { useLiveQuery } from 'dexie-react-hooks'
import type { Reglages } from '@/types'
import { db } from './db'

/** Réglages courants (undefined tant que la base charge). */
export function useReglages(): Reglages | undefined {
  return useLiveQuery(() => db.reglages.get('moi'), [])
}

export async function majReglages(changements: Partial<Omit<Reglages, 'id'>>): Promise<void> {
  await db.reglages.update('moi', changements)
}
