export const THEME_STORAGE_KEY = 'ggg-inventory-theme';
export const DEFAULT_THEME = 'midnight-blue';

const LEGACY_THEME_VALUES = {
  dark: 'midnight-blue',
  true: 'midnight-blue',
  light: 'soft-white',
  false: 'soft-white',
  // The pure White theme was removed: a saved "white" opens as Soft White.
  white: 'soft-white',
  // Emerald and Magenta were removed: a saved one opens as Midnight Blue.
  emerald: 'midnight-blue',
  magenta: 'midnight-blue',
};

export function normalizeTheme(value) {
  const theme = String(value || '').trim().toLowerCase();
  if (['soft-white', 'lavender', 'citrus', 'olive', 'graphite', 'midnight-blue', 'ember'].includes(theme)) {
    return theme;
  }
  return LEGACY_THEME_VALUES[theme] || null;
}

export function readSavedTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) || DEFAULT_THEME;
  } catch (error) {
    console.error('Could not read the saved appearance preference:', error);
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error('Could not save the appearance preference:', error);
  }
}

/* ===== PER-ACCOUNT THEME (backup copy in this browser) =====
   The theme is saved on the account (server). A copy is also kept in this
   browser under the account's own key, so each user still gets their own
   theme even if the server copy is missing (for example before running
   "php artisan migrate"). One user's choice never changes another user's. */
const userThemeKey = (userId) => `${THEME_STORAGE_KEY}:user:${userId}`;

export function readUserTheme(userId) {
  if (userId === undefined || userId === null) return null;
  try {
    return normalizeTheme(window.localStorage.getItem(userThemeKey(userId)));
  } catch (error) {
    return null;
  }
}

export function saveUserTheme(userId, theme) {
  if (userId === undefined || userId === null) return;
  try {
    window.localStorage.setItem(userThemeKey(userId), theme);
  } catch (error) {
    console.error('Could not save the appearance preference:', error);
  }
}
