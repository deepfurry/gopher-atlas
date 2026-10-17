import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { RefMDEditor } from '@uiw/react-md-editor/nohighlight';

// Keep the editor in its original React/DOM position. Only isolate its siblings.
export function useWritingFocus(
  editor: RefObject<RefMDEditor | null>,
  readOnly: boolean,
) {
  const [active, setActive] = useState(false);
  const focused = active && !readOnly;
  const root = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const restoreInput = useRef<(() => void) | null>(null);
  const backgroundScroll = useRef<Array<[HTMLElement, number, number]>>([]);
  const toggle = () => {
    const textarea = editor.current?.textarea;
    const target = textarea ?? button.current;
    const selection =
      textarea &&
      ([
        textarea.selectionStart,
        textarea.selectionEnd,
        textarea.selectionDirection,
      ] as const);
    const top = textarea?.scrollTop ?? 0,
      left = textarea?.scrollLeft ?? 0;
    restoreInput.current = () => {
      if (!target?.isConnected) return;
      target.focus({ preventScroll: true });
      if (textarea && selection) {
        textarea.setSelectionRange(...selection);
        textarea.scrollTop = top;
        textarea.scrollLeft = left;
      }
    };
    if (!focused) {
      backgroundScroll.current = [
        root.current?.closest<HTMLElement>('.workspace'),
        document.documentElement,
        document.body,
      ]
        .filter((node): node is HTMLElement => !!node)
        .map((node) => [node, node.scrollTop, node.scrollLeft]);
    }
    setActive(!focused);
  };
  useEffect(() => {
    if (readOnly) setActive(false);
  }, [readOnly]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!focused || !element) return;
    const background = new Map<Element, boolean>();
    const branches: Array<[HTMLElement, Element]> = [];
    const isolate = (parent: HTMLElement, child: Element) => {
      for (const sibling of parent.children) {
        if (sibling === child || background.has(sibling)) continue;
        background.set(sibling, sibling.hasAttribute('inert'));
        sibling.setAttribute('inert', '');
      }
    };
    let child: Element = element;
    while (child.parentElement) {
      const parent = child.parentElement;
      isolate(parent, child);
      if (parent === document.body) break;
      branches.push([parent, child]);
      child = parent;
    }
    // Save errors/conflict recovery can appear after entry. Keep those covered
    // controls inert too, while allowing new Base UI portals under body.
    const observer = new MutationObserver(() =>
      branches.forEach(([parent, child]) => isolate(parent, child)),
    );
    branches.forEach(([parent]) =>
      observer.observe(parent, { childList: true }),
    );
    const scroll = backgroundScroll.current.map(
      ([node]) => [node, node.style.overflow] as const,
    );
    scroll.forEach(([node]) => {
      node.style.overflow = 'hidden';
    });
    const containFocus = (event: FocusEvent) => {
      const target = event.target;
      // Base UI portals own focus while open, including the asset/alt dialogs.
      if (
        !(target instanceof Element) ||
        element.contains(target) ||
        target.closest('[role="dialog"], [role="alertdialog"]')
      )
        return;
      button.current?.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', containFocus);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', containFocus);
      background.forEach((wasInert, sibling) => {
        if (!wasInert) sibling.removeAttribute('inert');
      });
      scroll.forEach(([node, overflow]) => {
        node.style.overflow = overflow;
      });
      backgroundScroll.current.forEach(([node, top, left]) => {
        node.scrollTop = top;
        node.scrollLeft = left;
      });
    };
  }, [focused]);
  useEffect(() => {
    // Run after React's commit selection restoration; never rewrite the value.
    if (!focused)
      backgroundScroll.current.forEach(([node, top, left]) => {
        node.scrollTop = top;
        node.scrollLeft = left;
      });
    restoreInput.current?.();
    restoreInput.current = null;
  }, [focused]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const element = root.current;
    if (
      !focused ||
      !element ||
      !element.contains(event.target as Node) ||
      event.defaultPrevented
    )
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    } else if (event.key === 'Tab') {
      const controls = [
        ...element.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, [tabindex]',
        ),
      ].filter(
        (node) =>
          node.tabIndex >= 0 &&
          !node.matches(':disabled') &&
          !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
          (node.checkVisibility?.() ?? true),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !controls.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  return { focused, root, button, toggle, onKeyDown };
}
