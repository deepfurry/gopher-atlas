import { createContext, useContext } from 'react';
import type { Schema } from '@/shared/api';
export const MeContext = createContext<Schema<'Me'> | null>(null);
export function useMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error('Identity provider missing');
  return me;
}
