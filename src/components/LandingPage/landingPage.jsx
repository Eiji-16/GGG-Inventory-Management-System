import { useEffect, useState, useRef } from 'react';
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
  Settings as SettingsIcon
} from 'lucide-react'; /* Lucid Components */

import './landingPage.css'; /* Landing Page CSS */
import { SAFETY_STOCK_DEFAULTS } from '../../data/safetyStock'; /* Safety Stock Policy */
import Dashboard from '../Dashboard/dashboard'; /* Dashboard content component */
import ProductSupplier from '../ProductSupplier/productSupplier'; /* Product and Supplier content component */
import AutoCalculator from '../AutoCalculator/autoCal'; /* Auto-Calculator content component */
import SalesForecasting from '../Forecasting/forecasting'; /* Forecasting content component */
import ReportAnalytics from '../Reports/reports';/* Report content component */
import StockManagement from '../StockControl/stockControl'; /* Stock Control content component */
import Settings from '../Settings/Settings'; /* Settings content component */
import Profile from '../Profile/profile'; /* User Profile content component */

// LandingPage.jsx
/* CURRENT_ROLE — the signed-in user's role; gates access to Super-Admin-only features (e.g. safety stock).
   BACKEND: comes from the authenticated session — GET /api/auth/me → `users.role`. Hardcoded for now. */
const CURRENT_ROLE = 'Super Admin'; /* Replaced by the signed-in account role once auth is wired and when database is created */

/* INITIAL_NOTIFICATIONS — the notification feed shown in the bell dropdown.
   `type` picks the icon/colour; `view` (optional) is the tab the item jumps to when clicked.
   BACKEND: GET /api/notifications → rows generated from reorder flags, forecasts, activity, etc. */
const INITIAL_NOTIFICATIONS = [
  { id: 1, type: 'critical', title: 'Sapphire Crystal Glass Face is below safety stock', meta: '8 on hand · reorder point 20', time: '10 min ago', view: 'Stock', read: false },
  { id: 2, type: 'warning', title: 'Automatic Movement Caliber running low', meta: '15 on hand · watch level', time: '1 hour ago', view: 'Stock', read: false },
  { id: 3, type: 'forecast', title: 'New demand forecast is ready', meta: 'Precision Steel Chronograph · next month', time: '3 hours ago', view: 'Forecasting', read: false },
  { id: 4, type: 'success', title: 'Stock in recorded — 60 units', meta: 'Water-Resistant Diver Strap', time: 'Yesterday', view: 'Stock', read: true },
  { id: 5, type: 'info', title: 'Weekly report is available to export', meta: 'Reports & Analytics', time: '2 days ago', view: 'Reports', read: true },
];

/* NOTIF_ICONS — maps each notification type to its icon + colour class. */
const NOTIF_ICONS = {
  critical: { Icon: AlertTriangle, cls: 'notif-ic-critical' },
  warning:  { Icon: AlertTriangle, cls: 'notif-ic-warning' },
  forecast: { Icon: TrendUpIcon,   cls: 'notif-ic-forecast' },
  success:  { Icon: PackageCheck,  cls: 'notif-ic-success' },
  info:     { Icon: Info,          cls: 'notif-ic-info' },
};

function LandingPage({onLogout}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* Action button for sidebar when zoomed or phone size */
  const [isDarkMode, setIsDarkMode] = useState(true); /* Default to dark theme (For future this should be save on what user last used) */
  const [activeView, setActiveView] = useState('Dashboard'); /* To toggle active button (default landing page)*/
  const [handoff, setHandoff] = useState(null); /* Payload passed between the 3 integrated tabs */
  const [safetyStock, setSafetyStock] = useState(SAFETY_STOCK_DEFAULTS); /* Super Admin owned safety stock policy (only super admin can access this feature)*/
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS); /* Notification feed for the bell dropdown */
  const [isNotifOpen, setIsNotifOpen] = useState(false); /* Whether the notification box is open */
  const notifRef = useRef(null); /* Wrapper ref so a click outside closes the box */

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  /* Close the notification box when clicking anywhere outside it. */
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

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  const clearNotifications = () => setNotifications([]);

  /* Open a notification: mark it read, and jump to its tab if it has one. */
  const openNotification = (notif) => {
    setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    if (notif.view) {
      handleNavigate(notif.view);
      setIsNotifOpen(false);
    }
  };

  const toggleTheme = () => {
    setIsDarkMode((currentMode) => !currentMode);
  };

  const handleLogout =  () => {
    if (onLogout) {
      onLogout();
    } else {
      console.log('Logging out...')
    }
  };

  /* Cross Tab Handoff */
  const handleNavigate = (view, payload = null) => {
    setHandoff(payload);
    setActiveView(view);
    setIsSidebarOpen(false);
  };
  return (
    <div className="dashboard-page-wrapper">
      <div className="dashboard-container-parent">
        <aside className={`sidebar-body ${isSidebarOpen ? 'open' : ''}`}>
  {/* Sidebar Navigation */}
  <ul className="sidebar-menu">
      <div className="sidebar-item">
        <span id="sidebar-logo">
          {/* Logo Icon */}
          A
          </span>
      </div>
        
{/* Logo */}
          
{/* Menus */}
          <li className={`sidebar-item ${activeView === 'Dashboard' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Dashboard')}>
              <LayoutDashboard className="sidebar-icon" />
              <span className="sidebar-label">Dashboard</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Product-Supplier' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Product-Supplier')}>
              <Users className="sidebar-icon" />
              <span className="sidebar-label"> Management </span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Stock' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Stock')}>
              <Boxes className="sidebar-icon" />
              <span className="sidebar-label">Stock Control</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Auto-Calculator' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Auto-Calculator')}>
              <Calculator className="sidebar-icon" />
              <span className="sidebar-label">Auto-Calculator Calculator</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Forecasting' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Forecasting')}>
              <TrendingUp className="sidebar-icon" />
              <span className="sidebar-label">Forecasting</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Reports' ? 'active' : ''}`}>
            <button onClick={() => handleNavigate('Reports')}>
              <BarChart3 className="sidebar-icon" />
              <span className="sidebar-label">Reports</span>
            </button>
          </li>
        </ul>
 {/* Logout Button */}
        <div className="sidebar-footer-item">
            <div className = "sub-sidebar-footer-item">
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
                </button>
              </div>
            </div>
        </div>
      </aside>
{/* Main Wrapper */}

        <div className="main-wrapper">
          <header className="top-navbar">
            <div className="top-navbar-left-side">
              
              <div className="page-title-row">
                <p>
                  {activeView === 'Dashboard' && 'Dashboard Overview'}
                  {activeView === 'Product-Supplier' && 'Product & Supplier'}
                  {activeView === 'Stock' && 'Stock Control'}
                  {activeView === 'Auto-Calculator' && 'Auto Calculator'}
                  {activeView === 'Forecasting' && 'Sales Forecasting'}
                  {activeView === 'Reports' && 'Reports & Analytics'}
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
                  {activeView === 'Setting' && 'Manage your workspace preferences'}
                  {activeView === 'Profile' && 'View and manage your account details'}
                </p>
              </div>
            </div>
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
                      {notifications.length === 0 ? (
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
            <main className={`main-content-window ${activeView === 'Auto-Calculator' ? 'no-fade' : ''}`}>
              {/* Content Views */}
              {activeView === 'Dashboard' && <Dashboard onNavigate={handleNavigate} />}
              {activeView === 'Product-Supplier' && <ProductSupplier />}
              {activeView === 'Stock' && <StockManagement onNavigate={handleNavigate} safetyStock={safetyStock} />}
              {activeView === 'Auto-Calculator' && <AutoCalculator onNavigate={handleNavigate} handoff={handoff} />}
              {activeView === 'Forecasting' && <SalesForecasting onNavigate={handleNavigate} />}
              {activeView === 'Reports' && <ReportAnalytics/>}
              {activeView === 'Setting' && (
                <Settings
                  isDarkMode={isDarkMode}
                  onToggleTheme={toggleTheme}
                  role={CURRENT_ROLE}
                  safetyStock={safetyStock}
                  onUpdateSafetyStock={setSafetyStock}
                />
              )}
              {activeView === 'Profile' && <Profile />}
            </main>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;