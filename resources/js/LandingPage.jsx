import { useState } from 'react';
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
  Moon,
  Bell,
  Sun
} from 'lucide-react'; /* Lucid Components */

import '../css/LandingPage.css'; /* Landing Page CSS */
import Dashboard from './Dashboard'; /* Dashboard content component */
import ProductSupplier from './Product-Supplier'; /* Product and Supplier content component */
import EOQCalculator from './EOQ'; /* EOQ content component */
import SalesForecasting from './Forecasting'; /* Forecasting content component */
import ReportAnalytics from './Reports';/* Report content component */
import StockManagement from './StockControl'; /* Stock Control content component */

// LandingPage.jsx
function LandingPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* Action button for sidebar when zoomed or phone size */
  const [isDarkMode, setIsDarkMode] = useState(false); /* To Toggle Darkmode and Lightmode */
  const [activeView, setActiveView] = useState('dashboard'); /* To toggle active button */
  const toggleTheme = () => {
  const nextTheme = !isDarkMode;
  setIsDarkMode(nextTheme);

  document.documentElement.setAttribute('data-theme', nextTheme ? 'dark' : 'light');
};
  return (


    <div className="dashboard-container">

{/* Mobile Navigation Trigger & Backdrop Overlay */}
      <button
        className={`mobile-toggle ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

{/* Sidebar panel */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brands">
          <img src="/image/sample.jpg" alt="GGG Logo" className="sidebar-logo-img" />
        </div>
{/* Using Lucid react icons  */}
        <ul className="sidebar-menu">
         
{/* Sidebar navigation menu  */}
          <li className={`sidebar-item ${activeView === 'dashboard' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('dashboard'); setIsSidebarOpen(false); }}>
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
          <li className={`sidebar-item ${activeView === 'EOQ' ? 'active' : ''}`}>
            <button onClick={() => {setActiveView('EOQ'); setIsSidebarOpen(false); }}>
              <Calculator className="sidebar-icon" />
              <span className="sidebar-label">EOQ Calculator</span>
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
 {/* Logout Button  */}
          <li id="log-out" className="sidebar-item">
            <button href="#logout">
              <LogOut className="sidebar-icon" />
              <span className="sidebar-label">Log out</span>
            </button>
          </li>
        </ul>
      </aside>
{/* ==================================================================== */}

{/* Main content */}
      <main className="overview">
{/* Top Navigation Bar */}
        <header className="top-nav">
{/* Left Column: Title */}
          <div className="top-nav-welcome">
            <p className="top-nav-eyebrow">Inventory Control</p>
            <h2>Dashboard Overview</h2>
          </div>
{/* Right Column: SearchBar, User Profile, Darkmode, Notification */}
          <div className="top-nav-actions">
            <div className="top-nav-search-container">
              <input
                type="text"
                placeholder="Search everything..."
                className="top-nav-search-input"
              />
            </div>

{/* Navigation Actions */}
            <button
              className="top-nav-icon-btn"
              onClick={toggleTheme}
              aria-label="Toggle Theme Mode"
            > {isDarkMode ? (
                <Sun className="top-nav-icon-profile text-gold" />
              ) : (
                <Moon className="top-nav-icon-profile" />
              )}
          </button>

            <button className="top-nav-icon-btn" aria-label="View Notifications">
              <Bell className="top-nav-icon-profile" />
              <span className="top-nav-badge"></span>
            </button>

            <div className="top-nav-avatar">A</div>
          </div>
        </header>

{/* Main Overview Content from dashboard  */}
        <div className="main-content">
          {activeView === 'dashboard' && (
            <Dashboard onNavigate={setActiveView} />
          )}

          {activeView === 'Product-Supplier' && (
            <ProductSupplier onNavigate={setActiveView} />
          )}

          {activeView === 'Stock' && (
            <StockManagement onNavigate={setActiveView} />
          )}

          {activeView === 'EOQ' && (
            <EOQCalculator onNavigate={setActiveView} />
          )}

          {activeView === 'Forecasting' && (
            <SalesForecasting onNavigate={setActiveView} />
          )}

          {activeView === 'Reports' && (
            <ReportAnalytics onNavigate={setActiveView} />
          )}
          {/* Other views can be added here in the future */}
        </div>
      </main>
    </div>
  );
}

export default LandingPage;