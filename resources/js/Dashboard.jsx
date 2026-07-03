import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
/* 🛠️ 1. IMPORT YOUR CLEAN LUCIDE VECTOR COMPONENTS */
import {
  LayoutDashboard,
  Users,
  Boxes,
  Calculator,
  TrendingUp,
  BarChart3,
  LogOut,
  Moon,
  Bell
} from 'lucide-react';
import '../css/Dashboard.css';

// Dashboard.jsx
function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

        <ul className="sidebar-menu">
          {/* 🛠️ REPLACED LOGIC WITH VECTOR COMPONENTS */}
          <li className="sidebar-item">
            <a href="#dashboard">
              <LayoutDashboard className="sidebar-icon" />
              <span className="sidebar-label">Dashboard</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#products">
              <Users className="sidebar-icon" />
              <span className="sidebar-label">Product & <br/>Supplier Management </span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#stock">
              <Boxes className="sidebar-icon" />
              <span className="sidebar-label">Stock Control</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#eoq">
              <Calculator className="sidebar-icon" />
              <span className="sidebar-label">EOQ-Calculator</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#forecasting">
              <TrendingUp className="sidebar-icon" />
              <span className="sidebar-label">Demand Forecasting</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#reports">
              <BarChart3 className="sidebar-icon" />
              <span className="sidebar-label">Report & Analytics</span>
            </a>
          </li>

          <li id="log-out" className="sidebar-item">
            <a href="#logout">
              <LogOut className="sidebar-icon" />
              <span className="sidebar-label">Log out</span>
            </a>
          </li>
        </ul>
      </aside>

      <main className="overview">
        {/* NavBar Header Container */}
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

            {/* 🛠️ REPLACED WITH LIGHTWEIGHT NATURALLY COLORED RECT VECTORS */}
            <button className="top-nav-icon-btn" aria-label="Toggle Dark Mode">
              <Moon className="top-nav-icon-profile" />
            </button>

            <button className="top-nav-icon-btn" aria-label="View Notifications">
              <Bell className="top-nav-icon-profile" />
              <span className="top-nav-badge"></span>
            </button>

            <div className="top-nav-avatar">JD</div>
          </div>
        </header>

        {/* 🛠️ Your layout content tracks below this line */}
          
      </main>
    </div>
  );
}

export default Dashboard;