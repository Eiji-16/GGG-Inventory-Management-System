import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import '../css/Dashboard.css';


// Dashboard.jsx
function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="dashboard-container">

      {/* Mobile Navigation Trigger & Backdrop Overlay */}

      <button
        className="mobile-toggle"
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
          <li className="sidebar-item">
            <a href="#dashboard"><img src="/image/Icons/dashboard.png" alt="" className="sidebar-icon" />
              <span className="sidebar-label">Dashboard</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#products"><img src="/image/Icons/supplier.png" alt="" className="sidebar-icon" />
              <span className="sidebar-label">Product & <br/>Supplier Management </span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#stock"><img src="/image/Icons/box.png" alt="" className="sidebar-icon" />
              <span className="sidebar-label">Stock Control</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#eoq"><img src="/image/Icons/calculator.png" alt="" className="sidebar-icon" />
              <span className="sidebar-label">EOQ-Calculator</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#forecasting"><img src="/image/Icons/forecast-analytics.png" alt="" className="sidebar-icon" />
              <span className="sidebar-label">Demand Forecasting</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#reports"><img src="/image/Icons/report.png" alt="" className="sidebar-icon" />
              <span className="sidebar-label">Report & Analytics</span>
            </a>
          </li>
        </ul>
      </aside>

      <main className="overview">

        {/* NavBar / Header */}

        <header className="top-nav">
          <div className="top-nav__welcome">
            <p className="top-nav__eyebrow">Inventory Control</p>
            <h2>Dashboard Overview</h2>
          </div>

          <div className="top-nav__actions">
            <button className="top-nav__button">New Report</button>
            <div className="top-nav__avatar">JD</div>
          </div>
        </header>



      </main>
    </div>
  );
}

export default Dashboard;