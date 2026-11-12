(() => {
  'use strict';

  // Add official app listing URLs here after publication. Empty URLs keep stores disabled.
  const STORE_URLS = Object.freeze({ googlePlay: '', ruStore: '' });
  // 0 requests the latest public release, not the visitor's installed version.
  const RELEASE_URL = 'https://api.lixwey.ru/api/updates/android?current_version_code=0';
  const DOWNLOAD_URL = 'https://api.lixwey.ru/downloads/android';
  const panel = document.getElementById('release-panel');
  const status = document.getElementById('release-status');
  const spinner = document.getElementById('release-spinner');
  const explanation = document.getElementById('release-explanation');
  const details = document.getElementById('release-details');
  const version = document.getElementById('release-version');
  const size = document.getElementById('release-size');
  const date = document.getElementById('release-date');
  const download = document.getElementById('android-download');
  const retry = document.getElementById('release-retry');
  let pending = false;

  for (const [key, linkId, noteId] of [['googlePlay', 'google-play-link', 'google-play-soon'], ['ruStore', 'rustore-link', 'rustore-soon']]) {
    if (!STORE_URLS[key]) continue;
    let url;
    try { url = new URL(STORE_URLS[key]); } catch { continue; }
    const listing = key === 'googlePlay'
      ? url.hostname === 'play.google.com' && url.pathname === '/store/apps/details' && Boolean(url.searchParams.get('id'))
      : ['www.rustore.ru', 'rustore.ru', 'apps.rustore.ru'].includes(url.hostname) && /^\/(?:catalog\/app|app)\/[^/]+/.test(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || !listing) continue;
    const link = document.getElementById(linkId);
    link.href = url.href;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.removeAttribute('aria-describedby');
    document.getElementById(noteId).hidden = true;
  }

  function reset() {
    download.removeAttribute('href');
    download.setAttribute('aria-disabled', 'true');
    download.setAttribute('tabindex', '-1');
    details.hidden = true;
    explanation.hidden = true;
    explanation.textContent = '';
    version.textContent = '';
    size.textContent = '';
    date.textContent = '';
    retry.hidden = true;
  }

  function showUnavailable(message, detail) {
    status.textContent = message;
    explanation.textContent = detail;
    explanation.hidden = false;
    retry.hidden = false;
  }

  function showRelease(data) {
    if (!data || typeof data.available !== 'boolean') throw new Error('Invalid release response');
    if (!data.available) {
      showUnavailable('Версия для Android временно недоступна', 'APK пока не опубликован. Пожалуйста, зайдите позже.');
      return;
    }
    if (typeof data.latest_version !== 'string' || !data.latest_version.trim() || data.latest_version.length > 80) throw new Error('Missing release version');
    version.textContent = data.latest_version;
    size.textContent = typeof data.size_bytes === 'number' && Number.isFinite(data.size_bytes) && data.size_bytes > 0
      ? `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(data.size_bytes / (1024 * 1024))} МБ`
      : 'Не указан';
    const published = typeof data.published_at === 'string' && data.published_at.trim() ? new Date(data.published_at) : null;
    date.textContent = published && Number.isFinite(published.getTime())
      ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(published)
      : 'Не указана';
    status.textContent = 'Актуальная версия доступна';
    details.hidden = false;
    // Never use an arbitrary API or query-string URL for APK downloads.
    download.href = DOWNLOAD_URL;
    download.removeAttribute('aria-disabled');
    download.removeAttribute('tabindex');
  }

  async function loadRelease() {
    if (pending) return;
    pending = true;
    reset();
    panel.setAttribute('aria-busy', 'true');
    spinner.hidden = false;
    status.textContent = 'Получаем информацию о версии…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(RELEASE_URL, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error('Release request failed');
      showRelease(await response.json());
    } catch {
      reset();
      showUnavailable('Не удалось получить информацию о версии', 'Проверьте подключение к интернету и повторите попытку.');
    } finally {
      clearTimeout(timeout);
      pending = false;
      spinner.hidden = true;
      panel.setAttribute('aria-busy', 'false');
    }
  }

  retry.addEventListener('click', loadRelease);
  window.addEventListener('pageshow', event => { if (event.persisted) loadRelease(); });
  loadRelease();
})();
