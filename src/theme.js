export const THEME_STORAGE_KEY = 'ggg-inventory-theme';
export const DEFAULT_THEME = 'midnight-blue';

const LEGACY_THEME_VALUES = {
  dark: 'midnight-blue',
  true: 'midnight-blue',
  light: 'soft-white',
  false: 'soft-white',
  // The pure White theme was removed: a saved "white" opens as Soft White.
  white: 'soft-white',
};

export function normalizeTheme(value) {
  const theme = String(value || '').trim().toLowerCase();
  if (['soft-white', 'lavender', 'citrus', 'graphite', 'midnight-blue', 'emerald', 'magenta', 'ember'].includes(theme)) {
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
