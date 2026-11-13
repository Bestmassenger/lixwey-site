// Targeted browser checks; invoked by node tests/windows-download.mjs --i18n.
// All API responses, including report submissions and attachments, are mocked.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkLocalization({ send, evaluate, navigate, until, on, artifacts, setScenario, setReport }) {
  const dialogs = [];
  on('Page.javascriptDialogOpening', data => {
    if (data.type === 'alert') dialogs.push(data.message);
    send('Page.handleJavaScriptDialog', { accept: true });
  });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  let languageScript;
  async function browserLanguages(values) {
    if (languageScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: languageScript });
    const added = await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'languages', { value: ${JSON.stringify(values)} }); Object.defineProperty(navigator, 'language', { value: ${JSON.stringify(values[0])} });` });
    languageScript = added.identifier;
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__testPosts = [];
    const originalFetch = window.fetch;
    window.fetch = (url, options) => {
      if (options?.body instanceof FormData) window.__testPosts.push([...options.body.entries()].map(([key, value]) => [key, value instanceof File ? { name: value.name, size: value.size, type: value.type } : value]));
      return originalFetch(url, options);
    };
  ` });
  const ready = () => until(`Boolean(window.LixweyI18n) && !document.documentElement.hasAttribute('data-i18n-pending') && document.querySelector('[data-language]')?.disabled === false`);
  const choose = async language => {
    await evaluate(`document.querySelector('[data-language="${language}"]').click()`);
    assert.equal(await evaluate('document.documentElement.lang'), language);
  };
  const viewport = async width => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  };
  await navigate('/');
  await evaluate(`localStorage.removeItem('lixwey.language')`);
  await browserLanguages(['ru-RU', 'en-US']);
  await navigate('/');
  await ready();
  assert.equal(await evaluate('document.documentElement.lang'), 'ru');
  assert.equal(await evaluate(`localStorage.getItem('lixwey.language')`), null);
  await browserLanguages(['en-US', 'ru-RU']);
  await navigate('/');
  await ready();
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  assert.match(await evaluate('document.title'), /new generation/);
  await choose('ru');
  assert.match(await evaluate('document.title'), /социальная сеть/);
  await choose('en');
  assert.equal(await evaluate(`localStorage.getItem('lixwey.language')`), 'en');
  await browserLanguages(['ru-RU']);
  await navigate('/');
  await ready();
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  console.log('PASS browser ru-RU/en-US, manual RU-EN-RU, saved language overrides browser and survives reload');

  for (const path of ['/', '/download/windows/', '/download/android/', '/privacy/', '/reports/']) {
    await navigate(path);
    await ready();
    assert.equal(await evaluate('document.documentElement.lang'), 'en');
    if (path.includes('/download/')) await until(`document.getElementById('release-panel').getAttribute('aria-busy') === 'false'`);
    assert.deepEqual(await evaluate(`(() => {
      const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      let node; const untranslated = [];
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('script, style, noscript, [data-language="ru"], [translate="no"]')) continue;
        if (/[\u0400-\u04ff]/.test(node.nodeValue)) untranslated.push(node.nodeValue.trim());
      }
      for (const el of document.querySelectorAll('[alt], [aria-label], [placeholder], [title], meta[name="description"]')) {
        for (const name of ['alt', 'aria-label', 'placeholder', 'title', 'content']) {
          const text = el.getAttribute(name); if (text && /[\u0400-\u04ff]/.test(text)) untranslated.push(name + ': ' + text);
        }
      }
      return untranslated;
    })()`), [], 'No untranslated site text on ' + path);
    const nodes = await evaluate(`({ links: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')), options: [...document.querySelectorAll('option')].map(o => o.value), legal: document.querySelectorAll('.document section').length })`);
    for (const width of [1440, 390, 320]) {
      await viewport(width);
      const layout = await evaluate(`(() => {
        const socials = document.querySelector('.footer-social-links').getBoundingClientRect();
        const copy = document.querySelector('.footer-inner').getBoundingClientRect();
        const language = document.querySelector('.footer-language').getBoundingClientRect();
        const socialLinks = [...document.querySelectorAll('.footer-social-link')].map(a => a.getBoundingClientRect());
        return { centered: Math.abs((socials.left + socials.right) / 2 - innerWidth / 2) < 6,
          above: socials.bottom <= copy.top, gap: copy.top - socials.bottom,
          languageFits: language.left >= 0 && language.right <= innerWidth,
          socialsFit: socialLinks.every(r => r.left >= 0 && r.right <= innerWidth),
          overflow: document.documentElement.scrollWidth > innerWidth,
          clipped: [...document.querySelectorAll('.btn, .footer-language button, .footer-social-link')].some(a => a.clientWidth && a.scrollWidth > a.clientWidth) };
      })()`);
      assert.equal(layout.centered && layout.above && layout.languageFits && layout.socialsFit, true, path + ' footer at ' + width);
      assert(Math.abs(layout.gap - 20) < 1);
      assert.equal(layout.overflow || layout.clipped, false, path + ' overflow at ' + width);
    }
    for (const language of ['ru', 'en']) {
      await choose(language);
      await evaluate(`document.querySelector('.nav-toggle').click()`);
      assert.equal(await evaluate(`document.querySelector('.nav-toggle').getAttribute('aria-label')`), language === 'en' ? 'Close menu' : 'Закрыть меню');
      await evaluate(`document.querySelector('.nav-toggle').click()`);
      assert.equal(await evaluate(`document.querySelector('.nav-toggle').getAttribute('aria-label')`), language === 'en' ? 'Open menu' : 'Открыть меню');
    }
    const after = await evaluate(`({ links: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')), options: [...document.querySelectorAll('option')].map(o => o.value), legal: document.querySelectorAll('.document section').length })`);
    assert.deepEqual(after, nodes, 'Links, option values and legal structure preserved');
    if (path === '/privacy/') assert.equal(nodes.legal, 9);
    if (path === '/download/android/') {
      const rect = await evaluate(`(() => { const r = document.querySelector('footer').getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height, scale: 1 }; })()`);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: rect });
      await writeFile(join(artifacts, 'localized-footer-320.png'), Buffer.from(shot.data, 'base64'));
    }
    console.log('PASS ' + path + ': EN coverage, persisted language, RU/EN menu, links, footer at 1440/390/320');
  }

  for (const platform of ['windows', 'android']) {
    setScenario('unavailable');
    await navigate('/download/' + platform + '/');
    await until(`document.getElementById('release-panel').getAttribute('aria-busy') === 'false'`);
    assert.match(await evaluate(`document.getElementById('release-status').textContent`), /temporarily unavailable/);
    await choose('ru');
    assert.match(await evaluate(`document.getElementById('release-status').textContent`), /временно недоступна/);
    setScenario('available');
    await evaluate(`document.getElementById('release-retry').click()`);
    await until(`document.querySelector('#windows-download, #android-download').hasAttribute('href')`);
    assert.match(await evaluate(`document.getElementById('release-size').textContent`), /65,8 МБ/);
    await choose('en');
    assert.match(await evaluate(`document.getElementById('release-size').textContent`), /65.8 MB/);
    assert.match(await evaluate(`document.getElementById('release-date').textContent`), /November/);
    assert.equal(await evaluate(`document.querySelector('#windows-download, #android-download').href`), 'https://api.lixwey.ru/downloads/' + platform);
  }
  console.log('PASS release errors, retry, cached metadata reformatting and official URLs in both languages');

  await navigate('/reports/');
  await ready();
  await evaluate(`document.getElementById('email').value = 'invalid'; document.getElementById('email').dispatchEvent(new Event('input', { bubbles: true }));`);
  assert.match(await evaluate(`document.getElementById('email').validationMessage`), /valid email/);
  await evaluate(`document.getElementById('email').value = 'qa@example.com'; document.getElementById('email').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('report_type').value = 'other'; document.getElementById('report_type').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('custom_type').value = 'Test subject'; document.getElementById('custom_type').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('message').value = 'User-entered text must stay unchanged after switching languages.';
    document.getElementById('message').dispatchEvent(new Event('input', { bubbles: true }));
    const consent = document.querySelector('[name=consent]'); consent.checked = true; consent.dispatchEvent(new Event('input', { bubbles: true }));
    const files = new DataTransfer(); files.items.add(new File(['test-image'], 'test.png', { type: 'image/png' }));
    document.getElementById('images').files = files.files; document.getElementById('images').dispatchEvent(new Event('change', { bubbles: true }));`);
  const formState = () => evaluate(`({ type: document.getElementById('report_type').value, custom: document.getElementById('custom_type').value, email: document.getElementById('email').value, message: document.getElementById('message').value, consent: document.querySelector('[name=consent]').checked, previews: document.querySelectorAll('.preview-item').length })`);
  const before = await formState();
  await choose('ru');
  assert.match(await evaluate(`document.getElementById('file-counter').textContent`), /1 из 3/);
  await choose('en');
  assert.deepEqual(await formState(), before);
  assert.match(await evaluate(`document.getElementById('file-counter').textContent`), /1 of 3/);
  assert.match(await evaluate(`document.querySelector('.remove-btn').getAttribute('aria-label')`), /Remove attachment test.png/);
  assert.equal(await evaluate(`document.getElementById('report-form').checkValidity()`), true);
  for (const status of [409, 429, 503, 400]) {
    const count = dialogs.length;
    setReport({ status, data: status === 400 ? { detail: 'TEST_SERVER_CODE' } : {} });
    await evaluate(`document.getElementById('report-form').requestSubmit()`);
    await until(`!document.querySelector('[type=submit]').disabled`);
    assert.equal(dialogs.length, count + 1);
    assert(!/[\u0400-\u04ff]/.test(dialogs.at(-1)));
    if (status === 400) assert.match(dialogs.at(-1), /TEST_SERVER_CODE/);
    assert.deepEqual(await formState(), before);
  }
  const count = dialogs.length;
  setReport({ offline: true });
  await evaluate(`document.getElementById('report-form').requestSubmit()`);
  await until(`!document.querySelector('[type=submit]').disabled`);
  assert.equal(dialogs.length, count + 1);
  assert.match(dialogs.at(-1), /connect to the server/);
  setReport({ status: 200, data: { success: true, report_id: 'TEST-42' }, delay: 200 });
  await evaluate(`document.getElementById('report-form').requestSubmit()`);
  assert.equal(await evaluate(`document.querySelector('[type=submit]').textContent.trim()`), 'Sending...');
  await choose('ru');
  assert.equal(await evaluate(`document.querySelector('[type=submit]').textContent.trim()`), 'Отправка...');
  await choose('en');
  await until(`!document.querySelector('[type=submit]').disabled`);
  assert.match(dialogs.at(-1), /TEST-42/);
  const posted = await evaluate('window.__testPosts.at(-1)');
  const fields = Object.fromEntries(posted);
  assert.equal(fields.report_type, 'other');
  assert.equal(fields.custom_type, before.custom);
  assert.equal(fields.email, before.email);
  assert.equal(fields.message, before.message);
  assert.equal(fields.consent, 'true');
  assert.equal(fields.policy_version, '1.0');
  assert.equal(fields.policy_revision_date, '21.10.2026');
  assert.deepEqual(fields.images, { name: 'test.png', size: 10, type: 'image/png' });
  assert.equal(await evaluate(`document.querySelector('[type=submit]').textContent.trim()`), 'Submit report');
  assert.equal(await evaluate(`document.getElementById('message').value`), '');
  assert.equal(await evaluate(`document.querySelectorAll('.preview-item').length`), 0);
  console.log('PASS form validation, counters, fields/files preserved, mocked 409/429/503/400/offline/success and language switch during submission');

  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate('/');
  assert.equal(await evaluate('document.documentElement.lang'), 'ru');
  assert.equal(await evaluate('getComputedStyle(document.body).visibility'), 'visible');
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  console.log('PASS accessible Russian HTML fallback with JavaScript disabled');
  console.log('Artifacts: ' + artifacts);
}
