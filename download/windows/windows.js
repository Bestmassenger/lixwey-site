(() => {
  'use strict';

  // 0.0.0 requests the latest release; it is not the visitor's installed version.
  const RELEASE_URL = 'https://api.lixwey.ru/api/updates/windows?current_version=0.0.0';
  const DOWNLOAD_URL = 'https://api.lixwey.ru/downloads/windows';
  const panel = document.getElementById('release-panel');
  const status = document.getElementById('release-status');
  const spinner = document.getElementById('release-spinner');
  const explanation = document.getElementById('release-explanation');
  const details = document.getElementById('release-details');
  const version = document.getElementById('release-version');
  const size = document.getElementById('release-size');
  const date = document.getElementById('release-date');
  const download = document.getElementById('windows-download');
  const retry = document.getElementById('release-retry');
  let pending = false;

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
      showUnavailable('Версия для Windows временно недоступна', 'Установщик пока не опубликован. Пожалуйста, зайдите позже');
      return;
    }
    if (typeof data.latest_version !== 'string' || !data.latest_version.trim() || data.latest_version.length > 80) {
      throw new Error('Missing release version');
    }

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
    // Ignore download_url from the API and all query parameters: only the official endpoint is allowed.
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
  // Revalidate after restoring a page from the browser's back/forward cache.
  window.addEventListener('pageshow', event => { if (event.persisted) loadRelease(); });
  loadRelease();
})();
