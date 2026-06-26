import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import '../css/Dashboard.css';

function Dashboard() {
  return (
    <>
      <header>
        <nav className="navbar">
          {/* Navbar contents */}
        </nav>
      </header>

      <aside className="sidebar-menu">
        {/* Sidebar contents */}
      </aside>
    </>
  );
}



export default Dashboard;