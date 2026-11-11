import { useEffect, type RefObject } from 'react';

export function useFormAriaValidation(
  containerRef: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
  selector = '.auth-input',
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.classList.add('visually-hidden');
    document.body.append(announcer);

    let announceTimer: number | undefined;
    const announced = new WeakSet<Element>();

    const linkError = (el: HTMLElement, shown: boolean): void => {
      const errorId = el.dataset['error'];
      if (!errorId) {
        return;
      }
      const ids = (el.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (shown) {
        ids.push(errorId);
      }
      if (ids.length > 0) {
        el.setAttribute('aria-describedby', ids.join(' '));
      } else {
        el.removeAttribute('aria-describedby');
      }
    };

    const syncAria = (target: EventTarget | null, announce: boolean): void => {
      if (!(target instanceof HTMLElement) || !target.matches(selector)) {
        return;
      }
      const invalid = target.matches(':user-invalid');
      if (invalid) {
        target.setAttribute('aria-invalid', 'true');
        linkError(target, true);
        if (announce && !announced.has(target)) {
          const errorEl = document.getElementById(target.dataset['error'] ?? '');
          if (errorEl?.textContent) {
            const msg = errorEl.textContent.trim();
            window.clearTimeout(announceTimer);
            announceTimer = window.setTimeout(() => {
              announcer.textContent = msg;
            }, 350);
          }
          announced.add(target);
        }
      } else {
        target.setAttribute('aria-invalid', 'false');
        linkError(target, false);
        announced.delete(target);
      }
    };

    container.querySelectorAll(selector).forEach((el) => syncAria(el, false));
    const onBlur = (e: FocusEvent): void => syncAria(e.target, true);
    const onInput = (e: Event): void => syncAria(e.target, false);
    const onChange = (e: Event): void => syncAria(e.target, true);
    const onInvalid = (e: Event): void => {
      if (e.target instanceof Element) {
        announced.add(e.target);
      }
      syncAria(e.target, false);
    };

    container.addEventListener('blur', onBlur, true);
    container.addEventListener('input', onInput, true);
    container.addEventListener('change', onChange, true);
    container.addEventListener('invalid', onInvalid, true);

    return () => {
      window.clearTimeout(announceTimer);
      container.removeEventListener('blur', onBlur, true);
      container.removeEventListener('input', onInput, true);
      container.removeEventListener('change', onChange, true);
      container.removeEventListener('invalid', onInvalid, true);
      announcer.remove();
    };
  }, [containerRef, selector, ...deps]);
}
