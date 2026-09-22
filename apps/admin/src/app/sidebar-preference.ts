import { useEffect, useState } from 'react';

export function useSidebarPreference() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('gopheratlas-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        'gopheratlas-sidebar',
        collapsed ? 'collapsed' : 'expanded',
      );
    } catch {
      /* Optional preference. Drafts never enter browser storage. */
    }
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}
