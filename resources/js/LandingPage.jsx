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
  Sun,
  Menu,
  User,
  Heading6
} from 'lucide-react'; /* Lucid Components */

import '../css/landingPage.css'; /* Landing Page CSS */
import Dashboard from './dashboard'; /* Dashboard content component */
import ProductSupplier from './productSupplier'; /* Product and Supplier content component */
import EOQCalculator from './eoq'; /* EOQ content component */
import SalesForecasting from './forecasting'; /* Forecasting content component */
import ReportAnalytics from './reports';/* Report content component */
import StockManagement from './stockControl'; /* Stock Control content component */

// LandingPage.jsx
function LandingPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); /* Action button for sidebar when zoomed or phone size */
  const [isDarkMode, setIsDarkMode] = useState(false); /* To Toggle Darkmode and Lightmode */
  const [activeView, setActiveView] = useState('Dashboard'); /* To toggle active button */
  const toggleTheme = () => {
  const nextTheme = !isDarkMode;
  setIsDarkMode(nextTheme);

  document.documentElement.setAttribute('data-theme', nextTheme ? 'dark' : 'light');
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
        </ul>
 {/* Logout Button  */}
        <div className="sidebar-footer-item">
            <div className="siderbar-item">
              <button onClick={toggleTheme} aria-label="Toggle Theme Mode">
                {isDarkMode ? <Sun className="sidebar-icon" /> : <Moon className = "sidebar-icon" />} 
              </button>
            </div>

            <div id="log-out" className="sidebar-item">
              <button onClick={() => console.log('logging out...')}>
                <LogOut className="sidebar-icon" />
              </button>
            </div>
        </div>
      </aside>
{/* ==================================================================== */}

        <div className="main-wrapper">
          <header className="top-navbar">
            <div className="top-navbar-left-side">
              <button className="mobile-menu-toggle"
              onClick={() =>setIsSidebarOpen(true)} aria-label = "Open Sidebar">  </button>
              <div className="page-title-row">
                <h1>
                  {activeView === 'Dashboard' && 'Dashboard Overview'}
                  {activeView === 'Product-Supplier' && 'Product & Supplier'}
                  {activeView === 'Stock' && 'Stock Control'}
                  {activeView === 'EOQ' && 'EOQ Calculator'}
                  {activeView === 'Forecasting' && 'Sales Forecasting'}
                  {activeView === 'Reports' && 'Reports & Analytics'}
                </h1>

                <p className= "sub-title">
                  {activeView === 'Dashboard' && 'Detailed Information about your store'}
                  {activeView === 'Product-Supplier' && 'Item specifications and supplier information'}
                  {activeView === 'Stock' && 'Product details and assigned supplier tracking'}
                  {activeView === 'EOQ' && 'Optimize product order sizes and minimize supplier carrying costs'}
                  {activeView === 'Forecasting' && 'Analyze historical trends to project future inventory demand'}
                  {activeView === 'Reports' && 'Review inventory performance, optimization metrics, and forecasting trends'}
                </p>
              </div>
            </div>
            <div className = "top-navbar-right-side">
              <button className = "navbar-bell-icon" aria-label="Notification">
                <Bell size = {16}> </Bell>
                <span className="notif-bell-dot"></span>
              </button>

              <div className="navbar-user-profile" title="User Profile">
                <img src=''></img>
                <User size ={16}/>
              </div>
            </div>
          </header>
            <main className="main-content-window">
              {/* ALL CONTENTS HERE!!!! */}
              {activeView === 'Dashboard' && <Dashboard />}
              {activeView === 'Product-Supplier' && <ProductSupplier />}
              {activeView === 'Stock' && <StockManagement/>}
              {activeView === 'EOQ' && <EOQCalculator/>}
              {activeView === 'Forecasting' && <SalesForecasting/>}
              {activeView === 'Reports' && <ReportAnalytics/>}
            </main>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;