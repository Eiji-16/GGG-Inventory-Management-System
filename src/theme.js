export const THEME_STORAGE_KEY = 'ggg-inventory-theme';
export const DEFAULT_THEME = 'midnight-blue';

const LEGACY_THEME_VALUES = {
  dark: 'midnight-blue',
  true: 'midnight-blue',
  light: 'white',
  false: 'white',
};

export function normalizeTheme(value) {
  const theme = String(value || '').trim().toLowerCase();
  if (theme === 'midnight-blue' || theme === 'graphite' || theme === 'white') {
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
