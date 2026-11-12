import { useEffect, useState } from 'react';

/* ===== SYSTEM NAME (2026-11-06) =====
   One name for the whole system, chosen by the Super Admin in Settings
   (saved on the server: GET/PUT /branding/name, SystemNameController).
   Shown in the browser tab, the sidebar, the login page, reports and emails.

   The server already writes the name into the page's <title>
   (welcome.blade.php), so it is right from the very first moment, even on
   the login page. After a change, setSystemName() updates the tab and tells
   every screen that uses useSystemName() to show the new name at once. */
export const DEFAULT_SYSTEM_NAME = 'GGG Inventory Management System';
export const SYSTEM_NAME_MAX = 40;   // 2026-11-12: was 60; same limit as the server (AppSetting)
const EVENT = 'ggg-system-name-changed';

let current = (typeof document !== 'undefined' && document.title.trim()) || DEFAULT_SYSTEM_NAME;

/** The name right now (for reports and other non-screen code). */
export const getSystemName = () => current;

/** Use a new name everywhere (browser tab + every screen showing it). */
export function setSystemName(name) {
  const value = String(name || '').trim() || DEFAULT_SYSTEM_NAME;
  current = value;
  if (typeof document !== 'undefined') document.title = value;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}

/** For screens: the name, kept up to date when the Super Admin changes it. */
export function useSystemName() {
  const [name, setName] = useState(current);
  useEffect(() => {
    const onChange = (event) => setName(event.detail || DEFAULT_SYSTEM_NAME);
    window.addEventListener(EVENT, onChange);
    setName(current);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return name;
}
