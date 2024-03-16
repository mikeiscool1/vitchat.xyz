/**
 *
 * @param {Date} date
 * @returns {string}
 */
export function moment(date) {
  const now = new Date();
  const dayTime = date.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

  const dayDifference = now.getDate() - date.getDate();
  if (dayDifference === 0) return `Today at ${dayTime}`;
  else if (dayDifference === 1) return `Yesterday at ${dayTime}`;
  else
    return date.toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
}

const epoch = BigInt(new Date('2024-01-01T00:00:00Z').getTime());
export function snowflakeDate(snowflake) {
  snowflake = BigInt(snowflake);
  const timestamp = (snowflake >> 22n) + epoch;
  return new Date(Number(timestamp));
}

export function encodeHtml(rawStr) {
  return rawStr.replace(/[\u00A0-\u9999<>\&]/g, i => `&#${i.charCodeAt(0)};`).replaceAll('\n', '<br>');
}

export function decodeHtml(html) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = html;
  return textArea.value;
}

export function isMobile() {
  return 'ontouchstart' in document.documentElement;
}

export function scrollBottom(element) {
  element.scrollTo(0, element.scrollHeight);
}

/**
 *
 * @param {string} name
 * @returns {string | null}
 */
export function getCookie(name) {
  const q = {};
  document.cookie
    .replace(/\s/g, '')
    .split(';')
    .map(i => i.split('='))
    .forEach(([key, value]) => {
      q[key] = value;
    });
  return q[name] ?? null;
}

/**
 *
 * @param {number} ms ms to sleep
 * @returns {Promise<void>}
 */
export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function dimBackground(element) {
  element.style.filter = 'brightness(30%)';
  element.style.pointerEvents = 'none';
  element.style.userSelect = 'none';
}

export function undimBackground(element) {
  element.style.filter = null;
  element.style.pointerEvents = null;
  element.style.userSelect = null;
}

export function removeModal(modal) {
  modal.classList.add('d-none');
  for (const child of modal.children) {
    if (child.value) child.value = '';
    else if (child.classList.contains('error')) child.innerHTML = '';
  }
}
