import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Boxes,
  Calculator,
  TrendingUp,
  BarChart3,
  LogOut,
  Bell,
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
const CURRENT_ROLE = 'Super Admin'; /* Replaced by the signed-in account role once auth is wired and when database is created */

function LandingPage({onLogout}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* Action button for sidebar when zoomed or phone size */
  const [isDarkMode, setIsDarkMode] = useState(true); /* Default to dark theme (For future this should be save on what user last used) */
  const [activeView, setActiveView] = useState('Dashboard'); /* To toggle active button (default landing page)*/
  const [handoff, setHandoff] = useState(null); /* Payload passed between the 3 integrated tabs */
  const [safetyStock, setSafetyStock] = useState(SAFETY_STOCK_DEFAULTS); /* Super Admin owned safety stock policy (only super admin can access this feature)*/


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

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
              <button className = "navbar-bell-icon" aria-label="Notification">
                <Bell size = {16}/>
                <span className="notif-bell-dot"></span>
              </button>
            </div>
          </header>
            <main className={`main-content-window ${activeView === 'Auto-Calculator' ? 'no-fade' : ''}`}>
              {/* Content Views */}
              {activeView === 'Dashboard' && <Dashboard />}
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