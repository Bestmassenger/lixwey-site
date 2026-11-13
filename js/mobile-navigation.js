(() => {
  'use strict';

  const nav = document.querySelector('.nav');
  const toggle = nav?.querySelector('.nav-toggle');
  const panel = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
  if (!nav || !toggle || !panel || nav.classList.contains('nav--enhanced')) return;

  const mobile = window.matchMedia('(max-width: 768px)');
  let open = false;

  function setOpen(value, restoreFocus = false) {
    open = mobile.matches && value;
    if (!open && restoreFocus && mobile.matches) toggle.focus({ preventScroll: true });
    toggle.setAttribute('aria-expanded', String(open));
    window.LixweyI18n.setAttribute(toggle, 'aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    nav.classList.toggle('nav--open', open);
    panel.inert = mobile.matches && !open;
    if (mobile.matches && !open) panel.setAttribute('aria-hidden', 'true');
    else panel.removeAttribute('aria-hidden');
  }

  setOpen(false);
  nav.classList.add('nav--enhanced');
  toggle.addEventListener('click', () => setOpen(!open));
  panel.addEventListener('click', event => {
    if (event.target.closest('a[href]')) setOpen(false, panel.contains(document.activeElement));
  });
  document.addEventListener('pointerdown', event => {
    if (open && !panel.contains(event.target) && !toggle.contains(event.target)) {
      setOpen(false, panel.contains(document.activeElement));
    }
  });
  document.addEventListener('keydown', event => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  mobile.addEventListener('change', () => {
    const focusInPanel = panel.contains(document.activeElement);
    const focusOnToggle = document.activeElement === toggle;
    setOpen(false, focusInPanel);
    if (!mobile.matches && focusOnToggle) panel.querySelector('a[href]')?.focus({ preventScroll: true });
  });
  window.addEventListener('pageshow', () => setOpen(false));
})();
