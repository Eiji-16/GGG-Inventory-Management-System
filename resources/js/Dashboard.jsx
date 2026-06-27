import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import '../css/Dashboard.css';


// Dashboard.jsx
function Dashboard() {
  
  return (
    
      <div className = "dashboard-container">

        
  
        <aside className = "sidebar">

          <div className="sidebar-brands">
            <img src="/image/sample.jpg" alt="GGG Logo" className="sidebar-logo-img" />
          </div>

          

          <ul className="sidebar-menu">
            <li className="sidebar-item">
              <a href="#dashboard"><img src="/image/Icons/dashboard.png" alt="" className="sidebar-icon" />Dashboard</a>
            </li>
            <li className="sidebar-item">
              <a href="#products"><img src="/image/Icons/supplier.png" alt="" className="sidebar-icon" />Product & Supplier Management</a>
            </li>
            <li className="sidebar-item">
              <a href="#stock"><img src="/image/Icons/box.png" alt="" className="sidebar-icon" />Stock Control</a>
            </li>
            <li className="sidebar-item">
              <a href="#eoq"><img src="/image/Icons/calculator.png" alt="" className="sidebar-icon" />EOQ-Calculator</a>
            </li>
            <li className="sidebar-item">
              <a href="#forecasting"><img src="/image/Icons/forecast-analytics.png" alt="" className="sidebar-icon" /> Demand Forecasting</a>
            </li>
            <li className="sidebar-item">
              <a href="#reports"><img src="/image/Icons/report.png" alt="" className="sidebar-icon" />Report & Analytics</a>
            </li>
          </ul>
        </aside>
      
        <main className = "overview">
          
        </main>
      </div>
    
  );
}

export default Dashboard;