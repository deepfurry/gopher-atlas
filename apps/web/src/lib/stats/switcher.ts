/** Progressive enhancement: the default chart and native data table need no JS. */
export function mountStatistics(root: HTMLElement) {
  const controls = root.querySelector<HTMLElement>('[data-stats-switch]');
  if (!controls || controls.dataset.mounted) return;
  const tabs = [
    ...controls.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-stats-panel]')];
  if (!tabs.length || tabs.length !== panels.length) return;
  function select(index: number) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      let next: number;
      switch (event.key) {
        case 'ArrowRight':
          next = (index + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          next = (index + tabs.length - 1) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next);
      tabs[next].focus();
    });
  });
  // No deferred animation or request: rapid input and reduced motion settle immediately.
  select(0);
  controls.dataset.mounted = 'true';
  controls.hidden = false;
}
