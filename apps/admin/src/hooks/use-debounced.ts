import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 200) {
  const [stable, setStable] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setStable(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return stable;
}
