export default function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;
  }

  return fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
}
