import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Select } from '@/components/ui/select';
export type Theme = 'system' | 'light' | 'dark';
const ThemeContext = createContext({
  theme: 'system' as Theme,
  resolved: 'light',
  setTheme: (_value: Theme) => {
    void _value;
  },
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem('gopheratlas-theme');
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  });
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  const resolved = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setDark(media?.matches ?? false);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    try {
      localStorage.setItem('gopheratlas-theme', theme);
    } catch {
      /* Preferences are optional. */
    }
  }, [theme, resolved]);
  return (
    <ThemeContext value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext>
  );
}
export function useTheme() {
  return useContext(ThemeContext);
}
export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <label className="theme-select">
      外观
      <Select
        label="外观"
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
        options={[
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
        ]}
      />
    </label>
  );
}
