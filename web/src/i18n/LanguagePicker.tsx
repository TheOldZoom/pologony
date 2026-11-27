import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useLanguage, useStrings } from './strings';

export function LanguagePicker() {
  const { language, changeLanguage } = useLanguage();
  const s = useStrings();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const positionMenu = useCallback(() => {
    if (!trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    menu.current.style.top = `${anchor.bottom + 6}px`;
    menu.current.style.right = `${document.documentElement.clientWidth - anchor.right}px`;
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, positionMenu]);

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="language-picker"
        aria-label={s.language}
        aria-expanded={open}
        aria-controls={menuId}
        popoverTarget={menuId}
      >
        <Globe size={20} aria-hidden="true" />
      </button>
      <div
        id={menuId}
        ref={menu}
        className="language-menu"
        popover="auto"
        role="group"
        aria-label={s.language}
        onBeforeToggle={(event) => {
          if (event.newState === 'open') positionMenu();
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open';
          setOpen(opening);
          if (opening)
            menu.current
              ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
              ?.focus({ preventScroll: true });
        }}
      >
        {(['en', 'es'] as const).map((locale) => (
          <button
            type="button"
            className="action secondary language-option"
            key={locale}
            lang={locale === 'es' ? 'es-CR' : locale}
            aria-pressed={locale === language}
            onClick={() => {
              changeLanguage(locale);
              menu.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            {s.languageOptions[locale]}
            {locale === language && <Check size={17} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </>
  );
}
