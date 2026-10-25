import { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  Users,
  Boxes,
  Calculator,
  TrendingUp,
  BarChart3,
  LogOut,
  Bell,
  BellOff,
  AlertTriangle,
  PackageCheck,
  TrendingUp as TrendUpIcon,
  Info,
  Check,
  User,
  Menu,
  X,
  UsersRound,
  Settings as SettingsIcon,
  BellRing,
  CircleUserRound,
  Camera,
  Trash2
} from 'lucide-react'; /* ===== ICONS ===== */

import './landingPage.css'; /* ===== STYLES ===== */
import apiFetch from '../../apiFetch';
import { SAFETY_STOCK_DEFAULTS, DEFAULT_SAFETY_STOCK, reorderPointFor, safetyPointFor, statusPointsFor } from '../../data/safetyStock'; /* ===== POLICY ===== */
import Dashboard from '../Dashboard/dashboard'; /* ===== DASHBOARD ===== */
import ProductSupplier from '../ProductSupplier/productSupplier'; /* ===== PRODUCTS ===== */
import AutoCalculator from '../AutoCalculator/autoCal'; /* ===== CALCULATOR ===== */
import SalesForecasting from '../Forecasting/forecasting'; /* ===== FORECASTING ===== */
import ReportAnalytics from '../Reports/reports'; /* ===== REPORTS ===== */
import StockManagement from '../StockControl/stockControl'; /* ===== STOCK ===== */
import ReorderAlerts from '../ReorderAlerts/reorderAlerts'; /* ===== REORDER ALERTS ===== */
import Settings from '../Settings/Settings'; /* ===== SETTINGS ===== */
import Profile from '../Profile/profile'; /* ===== PROFILE ===== */
import Staffs from '../Staffs/staffs'; /* ===== STAFFS ===== */

/* ===== NOTIFICATION ICONS ===== */
const NOTIF_ICONS = {
  critical: { Icon: AlertTriangle, cls: 'notif-ic-critical' },
  warning:  { Icon: AlertTriangle, cls: 'notif-ic-warning' },
  forecast: { Icon: TrendUpIcon,   cls: 'notif-ic-forecast' },
  success:  { Icon: PackageCheck,  cls: 'notif-ic-success' },
  info:     { Icon: Info,          cls: 'notif-ic-info' },
};

function formatNotificationTime(timestamp) {
  if (!timestamp) return 'Recently';
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime());
  if (!Number.isFinite(elapsed)) return 'Recently';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function mapSafetyStockPolicies(records) {
  return Object.fromEntries(records.map((record) => {
    const defaults = record.configured ? {} : SAFETY_STOCK_DEFAULTS[record.productName] || {};
    return [record.productId, {
      productName: record.productName,
      safetyStock: record.safetyStock ?? defaults.safetyStock ?? DEFAULT_SAFETY_STOCK,
      leadTimeDays: record.leadTimeDays ?? defaults.leadTimeDays ?? '',
      // Status points: 'auto' (reorder point / safety stock) or 'manual'.
      statusMode: record.statusMode || 'manual',
      lowPoint: record.lowPoint ?? '',
      criticalPoint: record.criticalPoint ?? '',
      // Read-only context for the Settings preview (not saved by the policy).
      category: record.category || '',
      brand: record.brand || '',
      model: record.model || '',
      supplierName: record.supplierName || '',
      supplierLeadTimeDays: record.supplierLeadTimeDays ?? null,
      demandFromHistory: record.demandFromHistory ?? 0,
      orderingCost: record.orderingCost ?? defaults.orderingCost ?? '',
      holdingCost: record.holdingCost ?? defaults.holdingCost ?? '',
      configured: record.configured,
    }];
  }));
}

function eoqHandoffStorageKey(userId) {
  return `ggg-inventory-forecast-eoq:${userId}`;
}

function readSavedEoqHandoff(userId) {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const saved = window.sessionStorage.getItem(eoqHandoffStorageKey(userId));
    if (!saved) return null;
    const handoff = JSON.parse(saved);
    if (
      handoff?.type !== 'forecast-eoq'
      || !handoff.productId
      || !Number.isFinite(Number(handoff.annualDemand))
      || !Number.isFinite(Number(handoff.baseForecast))
      || !Number.isFinite(Number(handoff.adjustedForecast))
      || !['week', 'month', 'year'].includes(handoff.periodType)
      || !handoff.forecastPeriod
    ) {
      window.sessionStorage.removeItem(eoqHandoffStorageKey(userId));
      return null;
    }
    return handoff;
  } catch (error) {
    console.error('Could not restore the forecast EOQ handoff:', error);
    return null;
  }
}

function createNotifications(summary, policy) {
  const notifications = [];
  (summary.products || []).forEach((product) => {
    const stock = Number(product.stock) || 0;
    const reorderPoint = reorderPointFor({
      productId: product.id,
      productName: product.name,
      safetyStock: product.safetyStock,
      annualDemand: product.annualDemand,
      leadTimeDays: product.leadTimeDays,
    }, policy);
    // Same status points as everywhere else (Automatic or Manual).
    const row = { productId: product.id, productName: product.name, safetyStock: product.safetyStock, annualDemand: product.annualDemand, leadTimeDays: product.leadTimeDays };
    const points = statusPointsFor(row, policy);
    if (stock > points.low) return;
    const safety = safetyPointFor(row, policy);
    const level = stock <= 0 ? 'out' : stock <= points.critical ? 'critical' : 'low';
    notifications.push({
      id: `stock-${product.id}-${level}`,
      type: level === 'low' ? 'warning' : 'critical',
      title: {
        out: `${product.name} is out of stock`,
        critical: `${product.name} is critically low`,
        low: `${product.name} is running low`,
      }[level],
      meta: level === 'low'
        ? `${stock} on hand · low at ${points.low} — time to order`
        : `${stock} on hand · critical at ${points.critical} · safety stock ${safety} · reorder point ${reorderPoint}`,
      time: 'Current stock',
      view: 'Reorder-Alerts',
      read: false,
    });
  });

  (summary.stockMovements || []).slice(-5).reverse().forEach((movement) => {
    const stockIn = movement.type === 'in';
    notifications.push({
      id: `movement-${movement.id}`,
      type: stockIn ? 'success' : 'info',
      title: `Stock ${stockIn ? 'in' : 'out'} recorded — ${movement.qty} units`,
      meta: movement.productName,
      time: formatNotificationTime(movement.createdAt || movement.date),
      view: 'Stock',
      read: false,
    });
  });

  return notifications;
}

function loadNotificationPreference(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      readIds: Array.isArray(saved.readIds) ? saved.readIds.filter((id) => typeof id === 'string') : [],
      dismissedIds: Array.isArray(saved.dismissedIds) ? saved.dismissedIds.filter((id) => typeof id === 'string') : [],
    };
  } catch (error) {
    console.error('Could not load notification preferences:', error);
    return { readIds: [], dismissedIds: [] };
  }
}

function LandingPage({onLogout, user, theme, onThemeChange}) {
  /* ===== ROLE ACCESS =====
     Which pages and buttons this account may use. The Super Admin sets the
     boxes in Settings → Role Access; the server sends the result as
     user.permissions and checks the same boxes on every action.
     Dashboard, Profile and Settings are always open; Staffs is Super Admin only. */
  const role = user?.role || 'staff';
  const isSuperAdminRole = role === 'super_admin' || user?.isSuperAdmin === true;
  const [permissions, setPermissions] = useState(() => user?.permissions || {});
  useEffect(() => { setPermissions(user?.permissions || {}); }, [user?.permissions]);

  /* Pick up changes the Super Admin makes while this account is signed in. */
  const refreshPermissions = useCallback(async () => {
    try {
      const response = await fetch('/api/role-access', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      if (body?.permissions) setPermissions(body.permissions);
    } catch {
      /* keep the last known permissions */
    }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(refreshPermissions, 60000);
    window.addEventListener('focus', refreshPermissions);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshPermissions);
    };
  }, [refreshPermissions]);

  const can = (key) => isSuperAdminRole || permissions?.[key] === true;
  const VIEW_PERMISSION = {
    'Product-Supplier': 'products.view',
    Stock:              'stock.view',
    'Reorder-Alerts':   'reorder.view',
    'Auto-Calculator':  'calculator.use',
    Forecasting:        'forecast.view',
    Reports:            'reports.view',
  };
  const canAccess = (view) => {
    if (view === 'Dashboard' || view === 'Profile' || view === 'Setting') return true;
    if (view === 'Staffs') return isSuperAdminRole;
    const key = VIEW_PERMISSION[view];
    return key ? can(key) : false;
  };

  /* Settings expects a display-style role name and shows the Safety Stock
     section only for 'Super Admin'. Map the backend role to that label. */
  const roleLabel = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff' }[role] || 'Staff';

  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* ===== SIDEBAR ===== */
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  /* ===== SIDEBAR PICTURE =====
     Default: a profile icon. The Super Admin can choose a picture that every
     account then sees (saved on the server, see SystemLogoController). */
  const isSuperAdminUser = isSuperAdminRole;
  const [logoUrl, setLogoUrl] = useState(user?.logoUrl || null);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoFileRef = useRef(null);
  useEffect(() => { setLogoUrl(user?.logoUrl || null); }, [user?.logoUrl]);

  const closeLogoModal = () => {
    if (logoBusy) return;
    setIsLogoModalOpen(false);
    setLogoError('');
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file (JPG, PNG, WEBP or GIF).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('The picture must be 2 MB or smaller.');
      return;
    }
    setLogoBusy(true);
    setLogoError('');
    try {
      const form = new FormData();
      form.append('logo', file);
      const response = await apiFetch('/branding/logo', { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(Object.values(body?.errors || {}).flat()[0] || body?.message || `Upload failed (${response.status}).`);
      }
      setLogoUrl(body.logoUrl || null);
      setIsLogoModalOpen(false);
    } catch (error) {
      setLogoError(error.message || 'The picture could not be saved.');
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    setLogoError('');
    try {
      const response = await apiFetch('/branding/logo', { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || `Remove failed (${response.status}).`);
      setLogoUrl(null);
      setIsLogoModalOpen(false);
    } catch (error) {
      setLogoError(error.message || 'The picture could not be removed.');
    } finally {
      setLogoBusy(false);
    }
  };

  const logoContent = logoUrl
    ? <img className="sidebar-logo-img" src={logoUrl} alt="" onError={() => setLogoUrl(null)} />
    : <CircleUserRound className="sidebar-logo-icon" aria-hidden="true" />;
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutProcessingRef = useRef(false);
  const logoutCancelRef = useRef(null);
  const [activeView, setActiveView] = useState('Dashboard'); /* ===== ACTIVE VIEW ===== */
  const [visitedViews, setVisitedViews] = useState(() => new Set(['Dashboard']));
  /* If the Super Admin switches off the page this account is on, go back to the Dashboard. */
  const activeViewAllowed = canAccess(activeView);
  useEffect(() => {
    if (!activeViewAllowed) setActiveView('Dashboard');
  }, [activeViewAllowed]);
  const mainContentRef = useRef(null);
  const viewScrollPositions = useRef({});
  const [handoff, setHandoff] = useState(() => readSavedEoqHandoff(user?.id)); /* ===== HANDOFF ===== */
  const [safetyStock, setSafetyStock] = useState(SAFETY_STOCK_DEFAULTS); /* ===== SAFETY STOCK ===== */
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState('');
  const [policyRefreshKey, setPolicyRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState([]); /* ===== NOTIFICATION STATE ===== */
  const [reorderAlertCount, setReorderAlertCount] = useState(0); /* ===== SIDEBAR BADGE ===== */
  const notificationPreferenceKey = `ggg-inventory-notifications:${user?.id ?? user?.email ?? 'account'}`;
  const notificationPreferencesRef = useRef(null);
  const notificationPreferenceOwnerRef = useRef(notificationPreferenceKey);
  if (notificationPreferenceOwnerRef.current !== notificationPreferenceKey) {
    notificationPreferenceOwnerRef.current = notificationPreferenceKey;
    notificationPreferencesRef.current = null;
  }
  if (notificationPreferencesRef.current === null) {
    notificationPreferencesRef.current = loadNotificationPreference(notificationPreferenceKey);
  }
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState('');
  const [isNotifOpen, setIsNotifOpen] = useState(false); /* ===== NOTIFICATION MENU ===== */
  const notifRef = useRef(null); /* ===== NOTIFICATION REF ===== */

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!isLogoutConfirmOpen) return undefined;
    logoutCancelRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !logoutProcessingRef.current) {
        setIsLogoutConfirmOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isLogoutConfirmOpen]);

  const saveNotificationPreferences = (next) => {
    notificationPreferencesRef.current = next;
    try {
      localStorage.setItem(notificationPreferenceKey, JSON.stringify(next));
    } catch (error) {
      console.error('Could not save notification preferences:', error);
    }
  };

  useEffect(() => {
    if (policyLoading) return undefined;
    let active = true;
    fetch('/api/dashboard/summary', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load notifications (${response.status}).`);
        return response.json();
      })
      .then((summary) => {
        if (!active) return;
        const current = createNotifications(summary, safetyStock);
        setReorderAlertCount(current.filter((notification) => notification.id.startsWith('stock-')).length);
        const activeStockIds = new Set(current
          .filter((notification) => notification.id.startsWith('stock-'))
          .map((notification) => notification.id));
        const previous = notificationPreferencesRef.current;
        const next = {
          readIds: previous.readIds.filter((id) => !id.startsWith('stock-') || activeStockIds.has(id)),
          dismissedIds: previous.dismissedIds.filter((id) => !id.startsWith('stock-') || activeStockIds.has(id)),
        };
        if (
          next.readIds.length !== previous.readIds.length
          || next.dismissedIds.length !== previous.dismissedIds.length
        ) {
          saveNotificationPreferences(next);
        }
        const readIds = new Set(next.readIds);
        const dismissedIds = new Set(next.dismissedIds);
        const stockItems = current
          .filter((notification) => !dismissedIds.has(notification.id))
          .map((notification) => ({ ...notification, read: readIds.has(notification.id) }));
        // Keep restock requests (loaded separately below) at the top.
        setNotifications((previous) => [
          ...previous.filter((notification) => notification.id.startsWith('request-')),
          ...stockItems,
        ]);
      })
      .catch((error) => {
        if (active) setNotificationError(error.message || 'Could not load notifications.');
      })
      .finally(() => {
        if (active) setNotificationsLoading(false);
      });
    return () => { active = false; };
  }, [notificationPreferenceKey, policyLoading, safetyStock]);

  /* ===== RESTOCK REQUESTS IN THE BELL =====
     Staff "Notify" requests (Reorder Alerts). Checked every 30 seconds while
     the system is open, for accounts allowed to see them (Role Access). */
  const canSeeRequests = can('reorder.requests') && can('notifications.view');
  const [requestsVersion, setRequestsVersion] = useState(0);
  useEffect(() => {
    if (!canSeeRequests) {
      setNotifications((previous) => previous.filter((notification) => !notification.id.startsWith('request-')));
      return undefined;
    }
    let active = true;
    const loadRequests = async () => {
      try {
        const response = await fetch('/api/restock-requests', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok || !active) return;
        const requests = await response.json();
        if (!active || !Array.isArray(requests)) return;
        const items = requests.map((request) => ({
          id: `request-${request.id}`,
          type: 'warning',
          title: `Restock request: ${request.productName}`,
          meta: `${request.requestedBy}${request.note ? `: “${request.note}”` : ''} · ${request.stock ?? 0} on hand`,
          time: formatNotificationTime(request.createdAt),
          view: 'Reorder-Alerts',
          read: false,
        }));
        // Forget read/cleared marks of requests that are closed now.
        const activeIds = new Set(items.map((item) => item.id));
        const previousPrefs = notificationPreferencesRef.current;
        const nextPrefs = {
          readIds: previousPrefs.readIds.filter((id) => !id.startsWith('request-') || activeIds.has(id)),
          dismissedIds: previousPrefs.dismissedIds.filter((id) => !id.startsWith('request-') || activeIds.has(id)),
        };
        if (nextPrefs.readIds.length !== previousPrefs.readIds.length || nextPrefs.dismissedIds.length !== previousPrefs.dismissedIds.length) {
          saveNotificationPreferences(nextPrefs);
        }
        const readIds = new Set(nextPrefs.readIds);
        const dismissedIds = new Set(nextPrefs.dismissedIds);
        setNotifications((previous) => [
          ...items.filter((item) => !dismissedIds.has(item.id)).map((item) => ({ ...item, read: readIds.has(item.id) })),
          ...previous.filter((notification) => !notification.id.startsWith('request-')),
        ]);
      } catch {
        /* offline for a moment — try again on the next tick */
      }
    };
    loadRequests();
    const timer = window.setInterval(loadRequests, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canSeeRequests, requestsVersion, notificationPreferenceKey]); // saveNotificationPreferences/ref are stable for this key

  useEffect(() => {
    let active = true;
    fetch('/api/safety-stock', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load reorder policies (${response.status}).`);
        return response.json();
      })
      .then((records) => {
        if (!Array.isArray(records)) throw new Error('The reorder policy response was invalid.');
        if (active) {
          setSafetyStock(mapSafetyStockPolicies(records));
          setPolicyError('');
        }
      })
      .catch((error) => {
        if (active) setPolicyError(error.message || 'Could not load reorder policies.');
      })
      .finally(() => {
        if (active) setPolicyLoading(false);
      });
    return () => { active = false; };
  }, [policyRefreshKey]);

  const saveSafetyStock = async (draft) => {
    const policies = Object.entries(draft).map(([productId, values]) => ({
      productId,
      safetyStock: values.safetyStock,
      // Lead-time override only; blank = use the supplier's lead time.
      leadTimeDays: values.leadTimeDays === '' ? null : values.leadTimeDays,
      statusMode: values.statusMode === 'manual' ? 'manual' : 'auto',
      lowPoint: values.statusMode === 'manual' ? values.lowPoint : null,
      criticalPoint: values.statusMode === 'manual' ? values.criticalPoint : null,
    }));
    const response = await apiFetch('/api/safety-stock', {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const validationMessage = Object.values(body?.errors || {}).flat()[0];
      throw new Error(validationMessage || body?.message || `Could not apply reorder policy (${response.status}).`);
    }
    const records = await response.json();
    setSafetyStock(mapSafetyStockPolicies(records));
    setPolicyError('');
  };

  /* ===== OUTSIDE CLICK ===== */
  useEffect(() => {
    if (!isNotifOpen) return;
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotifOpen]);

  const markAllRead = () => {
    const readIds = new Set(notificationPreferencesRef.current.readIds);
    notifications.forEach((notification) => readIds.add(notification.id));
    saveNotificationPreferences({
      ...notificationPreferencesRef.current,
      readIds: [...readIds],
    });
    setNotifications((previous) => previous.map((notification) => ({ ...notification, read: true })));
  };
  const clearNotifications = () => {
    const dismissedIds = new Set(notificationPreferencesRef.current.dismissedIds);
    notifications.forEach((notification) => dismissedIds.add(notification.id));
    saveNotificationPreferences({
      ...notificationPreferencesRef.current,
      dismissedIds: [...dismissedIds],
    });
    setNotifications([]);
  };

  /* ===== OPEN NOTIFICATION ===== */
  const openNotification = (notif) => {
    const readIds = new Set(notificationPreferencesRef.current.readIds);
    readIds.add(notif.id);
    saveNotificationPreferences({
      ...notificationPreferencesRef.current,
      readIds: [...readIds],
    });
    setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    if (notif.view) {
      handleNavigate(notif.view);
      setIsNotifOpen(false);
    }
  };

  const handleLogout = async () => {
    if (logoutProcessingRef.current) return;
    logoutProcessingRef.current = true;
    setIsLoggingOut(true);
    try {
      await onLogout?.();
      setIsLogoutConfirmOpen(false);
    } finally {
      logoutProcessingRef.current = false;
      setIsLoggingOut(false);
    }
  };

  /* ===== NAVIGATION ===== */
  const handleNavigate = (view, payload = null) => {
    if (!canAccess(view)) return; // role not permitted — ignore
    if (mainContentRef.current) {
      viewScrollPositions.current[activeView] = mainContentRef.current.scrollTop;
    }
    setVisitedViews((previous) => {
      if (previous.has(view)) return previous;
      return new Set(previous).add(view);
    });
    if (payload) {
      setHandoff(payload);
      if (payload.type === 'forecast-eoq' && user?.id) {
        try {
          window.sessionStorage.setItem(eoqHandoffStorageKey(user.id), JSON.stringify(payload));
        } catch (storageError) {
          console.error('Could not persist the forecast EOQ handoff:', storageError);
        }
      }
    } else if (view === 'Auto-Calculator') {
      setHandoff((current) => current || readSavedEoqHandoff(user?.id));
    } else {
      setHandoff(null);
    }
    setActiveView(view);
    setIsSidebarOpen(false);
  };

  const clearEoqHandoff = useCallback(() => {
    setHandoff(null);
    if (!user?.id) return;
    try {
      window.sessionStorage.removeItem(eoqHandoffStorageKey(user.id));
    } catch (storageError) {
      console.error('Could not clear the forecast EOQ handoff:', storageError);
    }
  }, [user?.id]);

  useLayoutEffect(() => {
    const mainContent = mainContentRef.current;
    if (!mainContent) return;
    mainContent.scrollTop = viewScrollPositions.current[activeView] ?? 0;
  }, [activeView]);
  return (

    <div className="dashboard-page-wrapper"> {/* ===== PAGE WRAPPER ===== */}
      <div className="dashboard-container-parent">
        {/* ===== SIDEBAR BACKDROP ===== */}
        {isSidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />
        )}
        <aside className={`sidebar-body ${isSidebarOpen ? 'open' : ''}`}>
{/* ===== SIDEBAR NAVIGATION ===== */}
  <ul className="sidebar-menu">
      <div className="sidebar-item sidebar-logo-row">
{/* ===== LOGO (profile icon, or the Super Admin's chosen picture) ===== */}
        {isSuperAdminUser ? (
          <button
            id="sidebar-logo"
            type="button"
            className="sidebar-logo-editable"
            onClick={() => setIsLogoModalOpen(true)}
            title="Change system logo"
            aria-label="Change system logo"
          >
            {logoContent}
            <span className="sidebar-logo-camera" aria-hidden="true"><Camera size={9} /></span>
          </button>
        ) : (
          <span id="sidebar-logo" aria-hidden="true">{logoContent}</span>
        )}
        <span className="sidebar-brand">
          <strong>GGG Inventory</strong>
          <small>Inventory Management</small>
        </span>
        {/* ===== CLOSE BUTTON ===== */}
        <button
          className="sidebar-close-btn"
          aria-label="Close menu"
          onClick={() => setIsSidebarOpen(false)}
        >
          <X size={18} />
        </button>
      </div>



{/* ===== MENUS ===== */}
          <li className="sidebar-section-label">Overview</li>
          <li className={`sidebar-item ${activeView === 'Dashboard' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Dashboard')}>
              <LayoutDashboard className="sidebar-icon" />
              <span className="sidebar-label">Dashboard</span>
            </button>
          </li>
          {(canAccess('Product-Supplier') || canAccess('Stock') || canAccess('Reorder-Alerts')) && <li className="sidebar-section-label">Inventory</li>}
          {canAccess('Product-Supplier') && (
          <li className={`sidebar-item ${activeView === 'Product-Supplier' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Product-Supplier')}>
              <Users className="sidebar-icon" />
              <span className="sidebar-label"> Management </span>
            </button>
          </li>
          )}
          {canAccess('Stock') && (
          <li className={`sidebar-item ${activeView === 'Stock' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Stock')}>
              <Boxes className="sidebar-icon" />
              <span className="sidebar-label">Stock Control</span>
            </button>
          </li>
          )}
          {canAccess('Reorder-Alerts') && (
          <li className={`sidebar-item ${activeView === 'Reorder-Alerts' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Reorder-Alerts')} title={reorderAlertCount ? `${reorderAlertCount} items need reorder` : 'Reorder Alerts'}>
              <BellRing className="sidebar-icon" />
              <span className="sidebar-label">Reorder Alerts</span>
              {reorderAlertCount > 0 && (
                <span className="sidebar-count-badge" aria-label={`${reorderAlertCount} items need reorder`}>
                  {reorderAlertCount > 99 ? '99+' : reorderAlertCount}
                </span>
              )}
            </button>
          </li>
          )}
          {(canAccess('Auto-Calculator') || canAccess('Forecasting')) && <li className="sidebar-section-label">Planning</li>}
          {canAccess('Forecasting') && (
          <li className={`sidebar-item ${activeView === 'Forecasting' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Forecasting')}>
              <TrendingUp className="sidebar-icon" />
              <span className="sidebar-label">Forecasting</span>
            </button>
          </li>
          )}
          {canAccess('Auto-Calculator') && (
          <li className={`sidebar-item ${activeView === 'Auto-Calculator' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Auto-Calculator')}>
              <Calculator className="sidebar-icon" />
              <span className="sidebar-label">Economic Order Quantity Calculator</span>
            </button>
          </li>
          )}
          {canAccess('Reports') && <li className="sidebar-section-label">Analytics</li>}
          {canAccess('Reports') && (
          <li className={`sidebar-item ${activeView === 'Reports' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Reports')}>
              <BarChart3 className="sidebar-icon" />
              <span className="sidebar-label">Reports</span>
            </button>
          </li>
          )}
        </ul>


 {/* ===== FOOTER ===== */}
        <div className="sidebar-footer-item">
            <div className = "sub-sidebar-footer-item">

              {canAccess('Staffs') && (
              <div className={`siderbar-item ${activeView === 'Staffs' ? 'active' : ''}`}>
                <button onClick={() => handleNavigate('Staffs')} title="Staff-list">
                  <UsersRound className="sidebar-icon"/>
                  <span className="sidebar-label">Staffs</span>
                </button>
              </div>
              )}
              <div className={`siderbar-item ${activeView === 'Profile' ? 'active' : ''}`}>
                <button onClick={() => handleNavigate('Profile')} title="User Profile">
                  <User className="sidebar-icon"/>
                  <span className="sidebar-label">Profile</span>
                </button>
              </div>
              <div className={`siderbar-item ${activeView === 'Setting' ? 'active' : ''}`}>
                <button onClick={() => handleNavigate('Setting')}>
                  <SettingsIcon className="sidebar-icon"/>
                  <span className="sidebar-label">Setting</span>
                </button>
              </div>
            </div>

            <div className = "sub-sidebar-footer-item-logout">
              <div id="log-out" className="sidebar-item">
                <button onClick={() => setIsLogoutConfirmOpen(true)}>
                  <LogOut className="sidebar-icon" />
                  <span className="sidebar-label">Logout</span>
                </button>
              </div>
            </div>
        </div>
      </aside>




{/* ===== MAIN WRAPPER ===== */}
        <div className="main-wrapper">
          <header className="top-navbar">
            <div className="top-navbar-left-side">
              {/* ===== MENU BUTTON ===== */}
              <button
                className="navbar-menu-toggle"
                aria-label="Open menu"
                aria-expanded={isSidebarOpen}
                onClick={() => setIsSidebarOpen((open) => !open)}
              >
                <Menu size={18} />
              </button>

              <div className="page-title-row">
                <p>
                  {activeView === 'Dashboard' && 'Dashboard Overview'}
                  {activeView === 'Product-Supplier' && 'Product & Supplier'}
                  {activeView === 'Stock' && 'Stock Control'}
                  {activeView === 'Reorder-Alerts' && 'Auto Reorder Alerts'}
                  {activeView === 'Auto-Calculator' && 'Economic Order Quantity Calculator'}
                  {activeView === 'Forecasting' && 'Sales Forecasting'}
                  {activeView === 'Reports' && 'Reports & Analytics'}

                  {activeView === 'Staffs' && 'Staffs'}
                  {activeView === 'Setting' && 'Settings'}
                  {activeView === 'Profile' && 'User Profile'}
                </p>

                <p className= "sub-title">
                  {activeView === 'Dashboard' && 'Detailed Information about your store'}
                  {activeView === 'Product-Supplier' && 'Item specifications and supplier information'}
                  {activeView === 'Stock' && 'Product details and assigned supplier tracking'}
                  {activeView === 'Reorder-Alerts' && 'Products that have reached their reorder point'}
                  {activeView === 'Auto-Calculator' && 'Optimize product order sizes and minimize supplier carrying costs'}
                  {activeView === 'Forecasting' && 'Analyze historical trends to project future inventory demand'}
                  {activeView === 'Reports' && 'Review inventory performance, optimization metrics, and forecasting trends'}

                  {activeView === 'Staffs' && 'Manage staffs'}
                  {activeView === 'Setting' && 'Manage your workspace preferences'}
                  {activeView === 'Profile' && 'View and manage your account details'}
                </p>
              </div>
            </div>

            {/* ===== NOTIFICATION BUTTON ===== */}
            <div className = "top-navbar-right-side">
              {can('notifications.view') && (
              <div className="notif-wrapper" ref={notifRef}>
                <button
                  className="navbar-bell-icon"
                  aria-label="Notifications"
                  aria-expanded={isNotifOpen}
                  onClick={() => setIsNotifOpen((open) => !open)}
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>

                {isNotifOpen && (
                  <div className="notif-box" role="menu">
                    <div className="notif-box-header">
                      <div className="notif-box-title">
                        <span>Notifications</span>
                        {unreadCount > 0 && <span className="notif-box-count">{unreadCount} new</span>}
                      </div>
                      {notifications.length > 0 && (
                        <button
                          className="notif-box-action"
                          type="button"
                          onClick={markAllRead}
                          disabled={unreadCount === 0}
                        >
                          <Check size={12} /> Mark all read
                        </button>
                      )}
                    </div>

                    <div className="notif-box-list">
                      {notificationsLoading ? (
                        <div className="notif-empty" role="status">Loading notifications…</div>
                      ) : notificationError ? (
                        <div className="notif-empty" role="alert">{notificationError}</div>
                      ) : notifications.length === 0 ? (
                        <div className="notif-empty">
                          <BellOff size={22} />
                          <span>You’re all caught up</span>
                        </div>
                      ) : (
                        notifications.map((notif) => {
                          const { Icon, cls } = NOTIF_ICONS[notif.type] || NOTIF_ICONS.info;
                          return (
                            <button
                              key={notif.id}
                              type="button"
                              className={`notif-item ${notif.read ? '' : 'is-unread'}`}
                              onClick={() => openNotification(notif)}
                            >
                              <span className={`notif-item-icon ${cls}`}><Icon size={15} /></span>
                              <span className="notif-item-body">
                                <span className="notif-item-title">{notif.title}</span>
                                <span className="notif-item-meta">{notif.meta}</span>
                                <span className="notif-item-time">{notif.time}</span>
                              </span>
                              {!notif.read && <span className="notif-item-dot" aria-hidden="true" />}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {notifications.length > 0 && (
                      <div className="notif-box-footer">
                        <button className="notif-box-clear" type="button" onClick={clearNotifications}>
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>
          </header>
            <main
              ref={mainContentRef}
              className={`main-content-window ${activeView === 'Auto-Calculator' ? 'no-fade' : ''}`}
            >
              {/* ===== CONTENT VIEWS (each also guarded by role) ===== */}
              {visitedViews.has('Dashboard') && canAccess('Dashboard') && (
                <div className="app-view-panel" hidden={activeView !== 'Dashboard'}>
                  <Dashboard
                    onNavigate={handleNavigate}
                    isSuperAdmin={role === 'super_admin'}
                    safetyStock={safetyStock}
                    isActive={activeView === 'Dashboard'}
                  />
                </div>
              )}
              {visitedViews.has('Product-Supplier') && canAccess('Product-Supplier') && (
                <div className="app-view-panel" hidden={activeView !== 'Product-Supplier'}>
                  <ProductSupplier
                    onCatalogChange={() => setPolicyRefreshKey((key) => key + 1)}
                    canAddProduct={can('products.create')}
                    canEditProduct={can('products.edit')}
                    canDeleteProduct={can('products.delete')}
                    canExportProducts={can('products.export')}
                    canViewSuppliers={can('suppliers.view')}
                    canManageSuppliers={can('suppliers.manage')}
                  />
                </div>
              )}
              {visitedViews.has('Stock') && canAccess('Stock') && (
                <div className="app-view-panel" hidden={activeView !== 'Stock'}>
                  <StockManagement
                    onNavigate={handleNavigate}
                    safetyStock={safetyStock}
                    handoff={handoff}
                    catalogRevision={policyRefreshKey}
                    onInventoryChanged={() => setPolicyRefreshKey((key) => key + 1)}
                    currentUserName={user?.name || ''}
                    canComputeEoq={canAccess('Auto-Calculator')}
                    canClearStock={can('stock.clear')}
                    canAddStock={can('stock.create')}
                    canEditStock={can('stock.edit')}
                    canDeleteStock={can('stock.delete')}
                    canExportStock={can('stock.export')}
                    canViewActivity={can('stock.history')}
                  />
                </div>
              )}
              {visitedViews.has('Reorder-Alerts') && canAccess('Reorder-Alerts') && (
                <div className="app-view-panel" hidden={activeView !== 'Reorder-Alerts'}>
                  <ReorderAlerts
                    onNavigate={handleNavigate}
                    safetyStock={safetyStock}
                    catalogRevision={policyRefreshKey}
                    canComputeEoq={canAccess('Auto-Calculator')}
                    canNotify={can('reorder.notify')}
                    canManageRequests={can('reorder.requests')}
                    onRequestsChanged={() => setRequestsVersion((version) => version + 1)}
                  />
                </div>
              )}
              {visitedViews.has('Auto-Calculator') && canAccess('Auto-Calculator') && (
                <div className="app-view-panel" hidden={activeView !== 'Auto-Calculator'}>
                  <AutoCalculator
                    onNavigate={handleNavigate}
                    handoff={handoff}
                    onClearHandoff={clearEoqHandoff}
                    currentUser={user?.name || ''}
                    currentUserId={user?.id || ''}
                    safetyStock={safetyStock}
                    catalogRevision={policyRefreshKey}
                    allowSaveCosts={can('calculator.save_costs')}
                    canViewHistory={can('calculator.history')}
                    canExport={can('calculator.export')}
                    canOpenForecasting={canAccess('Forecasting')}
                  />
                </div>
              )}
              {visitedViews.has('Forecasting') && canAccess('Forecasting') && (
                <div className="app-view-panel" hidden={activeView !== 'Forecasting'}>
                  <SalesForecasting
                    onNavigate={handleNavigate}
                    onClearEoqHandoff={clearEoqHandoff}
                    catalogRevision={policyRefreshKey}
                    isActive={activeView === 'Forecasting'}
                    canExport={can('forecast.export')}
                    canEditPastSales={can('forecast.past_sales')}
                    canManageEvents={can('forecast.events')}
                    canComputeEoq={canAccess('Auto-Calculator')}
                  />
                </div>
              )}
              {visitedViews.has('Staffs') && canAccess('Staffs') && (
                <div className="app-view-panel" hidden={activeView !== 'Staffs'}>
                  <Staffs isSuperAdmin={user?.isSuperAdmin === true} />
                </div>
              )}
              {visitedViews.has('Reports') && canAccess('Reports') && (
                <div className="app-view-panel" hidden={activeView !== 'Reports'}>
                  <ReportAnalytics
                    safetyStock={safetyStock}
                    refreshKey={policyRefreshKey}
                    isActive={activeView === 'Reports'}
                    canTab={(key) => can(`reports.tab.${key}`)}
                    canExport={can('reports.export')}
                  />
                </div>
              )}
              {visitedViews.has('Setting') && canAccess('Setting') && (
                <div className="app-view-panel" hidden={activeView !== 'Setting'}>
                  <Settings
                    theme={theme}
                    onThemeChange={onThemeChange}
                    role={roleLabel}
                    safetyStock={safetyStock}
                    onUpdateSafetyStock={saveSafetyStock}
                    policyLoading={policyLoading}
                    policyError={policyError}
                    canChangeCurrency={can('settings.currency')}
                    isSuperAdmin={isSuperAdminRole}
                  />
                </div>
              )}
              {visitedViews.has('Profile') && canAccess('Profile') && (
                <div className="app-view-panel" hidden={activeView !== 'Profile'}>
                  <Profile />
                </div>
              )}
            </main>
        </div>
      </div>
      {isLogoModalOpen && isSuperAdminUser && createPortal(
        <div className="logout-confirm-overlay" onClick={closeLogoModal}>
          <section
            className="logout-confirm-modal logo-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logo-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="logo-picker-preview" aria-hidden="true">
              {logoUrl ? <img src={logoUrl} alt="" /> : <CircleUserRound size={40} />}
            </span>
            <h2 id="logo-picker-title">System logo</h2>
            <p>The system’s logo at the top of the sidebar, shown to every account. JPG, PNG, WEBP or GIF, up to 2 MB.</p>
            {logoError && <p className="logo-picker-error" role="alert">{logoError}</p>}
            <input
              ref={logoFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={uploadLogo}
              hidden
            />
            <div className="logout-confirm-actions">
              {logoUrl && (
                <button type="button" className="logout-confirm-cancel" onClick={removeLogo} disabled={logoBusy}>
                  <Trash2 size={13} /> Remove
                </button>
              )}
              <button type="button" className="logout-confirm-cancel" onClick={closeLogoModal} disabled={logoBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="logout-confirm-submit logo-picker-choose"
                onClick={() => logoFileRef.current?.click()}
                disabled={logoBusy}
              >
                {logoBusy ? 'Saving…' : logoUrl ? 'Change logo' : 'Choose logo'}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {isLogoutConfirmOpen && createPortal(
        <div
          className="logout-confirm-overlay"
          onClick={() => {
            if (!logoutProcessingRef.current) setIsLogoutConfirmOpen(false);
          }}
        >
          <section
            className="logout-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            aria-describedby="logout-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="logout-confirm-icon" aria-hidden="true"><LogOut size={20} /></span>
            <h2 id="logout-confirm-title">Are you sure you want to log out?</h2>
            <p id="logout-confirm-description">You will need to log in again to access your account.</p>
            <div className="logout-confirm-actions">
              <button
                ref={logoutCancelRef}
                type="button"
                className="logout-confirm-cancel"
                onClick={() => setIsLogoutConfirmOpen(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="logout-confirm-submit"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Logging Out…' : 'Yes, Log Out'}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default LandingPage;
