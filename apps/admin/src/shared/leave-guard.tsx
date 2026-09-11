import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
type Guard = {
  hasUnsaved: () => boolean;
  register: (check: () => boolean) => () => void;
};
const Context = createContext<Guard | null>(null);
// Only a predicate is shared with the shell, never Draft fields or storage.
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const check = useRef<(() => boolean) | null>(null);
  const value = useMemo<Guard>(
    () => ({
      hasUnsaved: () => check.current?.() ?? false,
      register: (next) => {
        check.current = next;
        return () => {
          if (check.current === next) check.current = null;
        };
      },
    }),
    [],
  );
  return <Context value={value}>{children}</Context>;
}
export function useLeaveGuard() {
  const guard = useContext(Context);
  if (!guard) throw new Error('Leave guard provider missing');
  return guard;
}
