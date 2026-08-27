import { useEffect, useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts'; /* Charts Components */

import {
  LayoutDashboard,
  Users,
  Boxes,
  Calculator,
  TrendingUp,
  BarChart3,
  LogOut,
  Bell,
  Menu,
  User,
  Settings as SettingsIcon,
  Heading6
} from 'lucide-react'; /* Lucid Components */

import './landingPage.css'; /* Landing Page CSS */
import Dashboard from '../Dashboard/dashboard'; /* Dashboard content component */
import ProductSupplier from '../ProductSupplier/productSupplier'; /* Product and Supplier content component */
import AutoCalculator from '../AutoCalculator/autoCal'; /* Auto-Calculator content component */
import SalesForecasting from '../Forecasting/forecasting'; /* Forecasting content component */
import ReportAnalytics from '../Reports/reports';/* Report content component */
import StockManagement from '../StockControl/stockControl'; /* Stock Control content component */
import Settings from '../Settings/Settings'; /* Settings content component (now owns the dark/light mode switch) */

// LandingPage.jsx
function LandingPage({onLogout}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* Action button for sidebar when zoomed or phone size */
  const [isDarkMode, setIsDarkMode] = useState(true); /* Default to dark theme */
  const [activeView, setActiveView] = useState('Dashboard'); /* To toggle active button */
  

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
  return (
    <div className="dashboard-page-wrapper">
      <div className="dashboard-container-parent">
        <aside className={`sidebar-body ${isSidebarOpen ? 'open' : ''}`}>
  {/* Sidebar navigation menu  */}
  <ul className="sidebar-menu">
      <div className="sidebar-item">
        <span id="sidebar-logo">
          {/* Logo Icon here */}
          A
          </span>
      </div>
        
{/* Logo */}
          
{/* Menus  */}
          <li className={`sidebar-item ${activeView === 'Dashboard' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('Dashboard'); setIsSidebarOpen(false); }}>
              <LayoutDashboard className="sidebar-icon" />
              <span className="sidebar-label">Dashboard</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Product-Supplier' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('Product-Supplier'); setIsSidebarOpen(false); }}>
              <Users className="sidebar-icon" />
              <span className="sidebar-label"> Management </span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Stock' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('Stock'); setIsSidebarOpen(false); }}>
              <Boxes className="sidebar-icon" />
              <span className="sidebar-label">Stock Control</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Auto-Calculator' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('Auto-Calculator'); setIsSidebarOpen(false); }}>
              <Calculator className="sidebar-icon" />
              <span className="sidebar-label">Auto-Calculator Calculator</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Forecasting' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('Forecasting'); setIsSidebarOpen(false); }}>
              <TrendingUp className="sidebar-icon" />
              <span className="sidebar-label">Forecasting</span>
            </button>
          </li>
          <li className={`sidebar-item ${activeView === 'Reports' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('Reports'); setIsSidebarOpen(false); }}>
              <BarChart3 className="sidebar-icon" />
              <span className="sidebar-label">Reports</span>
            </button>
          </li>
        </ul>
 {/* Logout Button  */}
        <div className="sidebar-footer-item">
            <div className = "sub-sidebar-footer-item">
              <div className={`siderbar-item ${activeView === 'Profile' ? 'active' : ''}`}>
                <button onClick={() => {setActiveView('Profile'); setIsSidebarOpen(false); }} title="User Profile">
                  <User className="sidebar-icon"/>
                  <span className="sidebar-label">Profile</span>
                </button>
              </div>
              <div className={`siderbar-item ${activeView === 'Setting' ? 'active' : ''}`}>
                <button onClick={() => {setActiveView('Setting'); setIsSidebarOpen(false); }}>
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
{/* ==================================================================== */}

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
            <main className="main-content-window">
              {/* ALL CONTENTS HERE!!!! */}
              {activeView === 'Dashboard' && <Dashboard />}
              {activeView === 'Product-Supplier' && <ProductSupplier />}
              {activeView === 'Stock' && <StockManagement/>}
              {activeView === 'Auto-Calculator' && <AutoCalculator/>}
              {activeView === 'Forecasting' && <SalesForecasting/>}
              {activeView === 'Reports' && <ReportAnalytics/>}
              {activeView === 'Setting' && <Settings isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />}
            </main>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;