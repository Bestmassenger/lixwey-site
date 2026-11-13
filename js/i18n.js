(() => {
  'use strict';
  const dictionary = window.LIXWEY_TRANSLATIONS;
  if (!dictionary) return; // The original Russian HTML remains usable if an asset fails.
  const storageKey = 'lixwey.language';
  const normalize = text => text.trim().replace(/\s+/g, ' ');
  const supported = value => value === 'ru' || value === 'en';
  const browserLanguage = () => /^ru(?:-|$)/i.test(navigator.languages?.[0] || navigator.language || 'en') ? 'ru' : 'en';
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch { /* Storage can be disabled. */ }
  let language = supported(saved) ? saved : browserLanguage();
  const textNodes = [];
  const attributes = [];
  const dynamicText = new Map();
  const dynamicAttributes = new Map();
  document.documentElement.lang = language;
  // Install the guard only when JS actually runs. A timeout always restores visibility.
  const guard = document.createElement('style');
  guard.textContent = 'html[data-i18n-pending] body { visibility: hidden; }';
  document.head.append(guard);
  if (language === 'en') document.documentElement.setAttribute('data-i18n-pending', '');
  const reveal = () => document.documentElement.removeAttribute('data-i18n-pending');
  const safetyTimeout = setTimeout(reveal, 2500);

  function t(source, params = {}) {
    source = String(source);
    const template = language === 'en' && Object.hasOwn(dictionary, source) ? dictionary[source] : source;
    return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
  }
  function setText(element, source, params = {}) {
    if (!element) return;
    dynamicText.set(element, { source, params });
    element.textContent = t(source, params);
  }
  function setAttribute(element, attribute, source, params = {}) {
    if (!element) return;
    if (!dynamicAttributes.has(element)) dynamicAttributes.set(element, new Map());
    dynamicAttributes.get(element).set(attribute, { source, params });
    element.setAttribute(attribute, t(source, params));
  }
  function render() {
    document.documentElement.lang = language;
    for (const binding of textNodes) {
      if (binding.node.isConnected && binding.node.nodeValue === binding.last) {
        binding.last = binding.prefix + t(binding.source) + binding.suffix;
        binding.node.nodeValue = binding.last;
      }
    }
    for (const binding of attributes) {
      if (binding.element.isConnected && binding.element.getAttribute(binding.attribute) === binding.last) {
        binding.last = t(binding.source);
        binding.element.setAttribute(binding.attribute, binding.last);
      }
    }
    for (const [element, binding] of dynamicText) {
      if (!element.isConnected) { dynamicText.delete(element); continue; }
      element.textContent = t(binding.source, binding.params);
    }
    for (const [element, bindings] of dynamicAttributes) {
      if (!element.isConnected) { dynamicAttributes.delete(element); continue; }
      for (const [attribute, binding] of bindings) element.setAttribute(attribute, t(binding.source, binding.params));
    }
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
  }
  function setLanguage(value, persist = true) {
    if (!supported(value)) return;
    language = value;
    if (persist) { try { localStorage.setItem(storageKey, value); } catch { /* Selection still works in memory. */ } }
    render();
    window.dispatchEvent(new CustomEvent('lixwey:languagechange', { detail: { language } }));
  }
  window.LixweyI18n = Object.freeze({
    t, setText, setAttribute, setLanguage,
    get language() { return language; },
    get locale() { return language === 'ru' ? 'ru-RU' : 'en-US'; }
  });

  function initialize() {
    try {
      const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('script, style, noscript, textarea, [contenteditable], [translate="no"]')) continue;
        const source = normalize(node.nodeValue);
        if (!Object.hasOwn(dictionary, source)) continue;
        textNodes.push({ node, source, prefix: node.nodeValue.match(/^\s*/)[0], suffix: node.nodeValue.match(/\s*$/)[0], last: node.nodeValue });
      }
      document.querySelectorAll('[alt], [aria-label], [placeholder], [title], meta[name="description"]').forEach(element => {
        for (const attribute of ['alt', 'aria-label', 'placeholder', 'title', 'content']) {
          const source = element.getAttribute(attribute);
          if (source && Object.hasOwn(dictionary, source)) attributes.push({ element, attribute, source, last: source });
        }
      });
      document.querySelectorAll('[data-language]').forEach(button => {
        button.disabled = false;
        button.addEventListener('click', () => setLanguage(button.dataset.language));
      });
      setLanguage(language, false);
    } finally {
      clearTimeout(safetyTimeout);
      reveal();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
  window.addEventListener('storage', event => {
    if (event.key === storageKey) setLanguage(supported(event.newValue) ? event.newValue : browserLanguage(), false);
  });
})();
