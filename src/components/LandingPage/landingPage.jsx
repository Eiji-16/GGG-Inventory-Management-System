import { useEffect, useLayoutEffect, useState, useRef } from 'react';
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
  Settings as SettingsIcon
} from 'lucide-react'; /* ===== ICONS ===== */

import './landingPage.css'; /* ===== STYLES ===== */
import apiFetch from '../../apiFetch';
import { SAFETY_STOCK_DEFAULTS, DEFAULT_SAFETY_STOCK, reorderPointFor } from '../../data/safetyStock'; /* ===== POLICY ===== */
import Dashboard from '../Dashboard/dashboard'; /* ===== DASHBOARD ===== */
import ProductSupplier from '../ProductSupplier/productSupplier'; /* ===== PRODUCTS ===== */
import AutoCalculator from '../AutoCalculator/autoCal'; /* ===== CALCULATOR ===== */
import SalesForecasting from '../Forecasting/forecasting'; /* ===== FORECASTING ===== */
import ReportAnalytics from '../Reports/reports'; /* ===== REPORTS ===== */
import StockManagement from '../StockControl/stockControl'; /* ===== STOCK ===== */
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
      annualDemand: record.annualDemand ?? defaults.annualDemand ?? '',
      leadTimeDays: record.leadTimeDays ?? defaults.leadTimeDays ?? '',
      orderCycleDays: record.orderCycleDays ?? defaults.orderCycleDays ?? '',
      orderingCost: record.orderingCost ?? defaults.orderingCost ?? '',
      holdingCost: record.holdingCost ?? defaults.holdingCost ?? '',
      configured: record.configured,
    }];
  }));
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
    if (stock > reorderPoint) return;
    const outOfStock = stock <= 0;
    notifications.push({
      id: `stock-${product.id}-${outOfStock ? 'out' : 'low'}`,
      type: outOfStock ? 'critical' : 'warning',
      title: outOfStock ? `${product.name} is out of stock` : `${product.name} is below safety stock`,
      meta: `${stock} on hand · reorder point ${reorderPoint}`,
      time: 'Current stock',
      view: 'Stock',
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
  /* ===== ROLE-BASED ACCESS =====
     Real role comes from the backend (user.role). Each view lists the roles
     allowed to see it; the sidebar and the main render both honour this. */
  const role = user?.role || 'staff';
  const VIEW_ACCESS = {
    Dashboard:          ['super_admin', 'admin', 'staff'],
    'Product-Supplier': ['super_admin', 'admin'],
    Stock:              ['super_admin', 'admin', 'staff'],
    'Auto-Calculator':  ['super_admin', 'admin'],
    Forecasting:        ['super_admin', 'admin'],
    Reports:            ['super_admin', 'admin', 'staff'],
    Staffs:             ['super_admin'],
    Profile:            ['super_admin', 'admin', 'staff'],
    Setting:            ['super_admin', 'admin', 'staff'],
  };
  const canAccess = (view) => (VIEW_ACCESS[view] || []).includes(role);

  /* Settings expects a display-style role name and shows the Safety Stock
     section only for 'Super Admin'. Map the backend role to that label. */
  const roleLabel = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff' }[role] || 'Staff';

  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* ===== SIDEBAR ===== */
  const [activeView, setActiveView] = useState('Dashboard'); /* ===== ACTIVE VIEW ===== */
  const [visitedViews, setVisitedViews] = useState(() => new Set(['Dashboard']));
  const mainContentRef = useRef(null);
  const viewScrollPositions = useRef({});
  const [handoff, setHandoff] = useState(null); /* ===== HANDOFF ===== */
  const [safetyStock, setSafetyStock] = useState(SAFETY_STOCK_DEFAULTS); /* ===== SAFETY STOCK ===== */
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState('');
  const [policyRefreshKey, setPolicyRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState([]); /* ===== NOTIFICATION STATE ===== */
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
        setNotifications(current
          .filter((notification) => !dismissedIds.has(notification.id))
          .map((notification) => ({ ...notification, read: readIds.has(notification.id) })));
      })
      .catch((error) => {
        if (active) setNotificationError(error.message || 'Could not load notifications.');
      })
      .finally(() => {
        if (active) setNotificationsLoading(false);
      });
    return () => { active = false; };
  }, [notificationPreferenceKey, policyLoading, safetyStock]);

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
      annualDemand: values.annualDemand === '' ? null : values.annualDemand,
      leadTimeDays: values.leadTimeDays === '' ? null : values.leadTimeDays,
      orderCycleDays: values.orderCycleDays === '' ? null : values.orderCycleDays,
      orderingCost: values.orderingCost === '' ? null : values.orderingCost,
      holdingCost: values.holdingCost === '' ? null : values.holdingCost,
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

  const handleLogout = () => onLogout?.();

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
    setHandoff(payload);
    setActiveView(view);
    setIsSidebarOpen(false);
  };

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
        <span id="sidebar-logo" aria-hidden="true">
{/* ===== LOGO ===== */}
          A
          </span>
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
          <li className="sidebar-section-label">Inventory</li>
          {canAccess('Product-Supplier') && (
          <li className={`sidebar-item ${activeView === 'Product-Supplier' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Product-Supplier')}>
              <Users className="sidebar-icon" />
              <span className="sidebar-label"> Management </span>
            </button>
          </li>
          )}
          <li className={`sidebar-item ${activeView === 'Stock' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Stock')}>
              <Boxes className="sidebar-icon" />
              <span className="sidebar-label">Stock Control</span>
            </button>
          </li>
          {canAccess('Auto-Calculator') && <li className="sidebar-section-label">Planning</li>}
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
              <span className="sidebar-label">Auto-Calculator</span>
            </button>
          </li>
          )}
          <li className="sidebar-section-label">Analytics</li>
          <li className={`sidebar-item ${activeView === 'Reports' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Reports')}>
              <BarChart3 className="sidebar-icon" />
              <span className="sidebar-label">Reports</span>
            </button>
          </li>
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
                <button onClick={handleLogout}>
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
                  {activeView === 'Auto-Calculator' && 'Auto Calculator'}
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
                  <ProductSupplier onCatalogChange={() => setPolicyRefreshKey((key) => key + 1)} />
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
                  />
                </div>
              )}
              {visitedViews.has('Auto-Calculator') && canAccess('Auto-Calculator') && (
                <div className="app-view-panel" hidden={activeView !== 'Auto-Calculator'}>
                  <AutoCalculator
                    onNavigate={handleNavigate}
                    handoff={handoff}
                    safetyStock={safetyStock}
                    catalogRevision={policyRefreshKey}
                  />
                </div>
              )}
              {visitedViews.has('Forecasting') && canAccess('Forecasting') && (
                <div className="app-view-panel" hidden={activeView !== 'Forecasting'}>
                  <SalesForecasting onNavigate={handleNavigate} />
                </div>
              )}
              {visitedViews.has('Staffs') && canAccess('Staffs') && (
                <div className="app-view-panel" hidden={activeView !== 'Staffs'}>
                  <Staffs isSuperAdmin={user?.isSuperAdmin === true} />
                </div>
              )}
              {visitedViews.has('Reports') && canAccess('Reports') && (
                <div className="app-view-panel" hidden={activeView !== 'Reports'}>
                  <ReportAnalytics safetyStock={safetyStock} />
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
    </div>
  );
}

export default LandingPage;
