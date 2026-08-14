import React, { useState } from 'react';
import {
  Download,
  FileText,
  Image,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Package,
} from 'lucide-react';
import './reports.css';

// Sample Data
const STOCK_SUMMARY = [
  { name: 'Precision Steel Chronograph', category: 'Timepieces', stockIn: 150, stockOut: 98, remaining: 52, status: 'In Stock' },
  { name: 'Water-Resistant Diver Strap', category: 'Accessories', stockIn: 200, stockOut: 185, remaining: 15, status: 'Low Stock' },
  { name: 'Sapphire Crystal Glass Face', category: 'Spare Parts', stockIn: 300, stockOut: 300, remaining: 0, status: 'Out of Stock' },
  { name: 'Premium Calfskin Band', category: 'Accessories', stockIn: 120, stockOut: 80, remaining: 40, status: 'In Stock' },
  { name: 'Automatic Movement Caliber', category: 'Movements', stockIn: 90, stockOut: 75, remaining: 15, status: 'Low Stock' },
];

const MONTHLY_DATA = {
  week:  { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], stockIn: [20,15,30,25,18,40,22], stockOut: [12,10,18,20,15,35,18] },
  month: { labels: ['W1', 'W2', 'W3', 'W4'], stockIn: [120, 140, 110, 130], stockOut: [90, 110, 85, 100] },
  year:  { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], stockIn: [300,280,320,290,350,380,310,360,340,390,420,450], stockOut: [220,200,240,210,270,300,230,280,260,310,340,370] },
};

const TOP_MOVING = [
  { name: 'Precision Steel Chronograph', category: 'Timepieces', sold: 98, trend: 'up' },
  { name: 'Premium Calfskin Band', category: 'Accessories', sold: 80, trend: 'up' },
  { name: 'Automatic Movement Caliber', category: 'Movements', sold: 75, trend: 'down' },
  { name: 'Water-Resistant Diver Strap', category: 'Accessories', sold: 185, trend: 'up' },
  { name: 'Sapphire Crystal Glass Face', category: 'Spare Parts', sold: 300, trend: 'down' },
];

function Reports({ onNavigate }) {
  const [period, setPeriod] = useState('month');
  const [activeReport, setActiveReport] = useState('summary');

  const data = MONTHLY_DATA[period];
  const maxVal = Math.max(...data.stockIn, ...data.stockOut);

  function handleExport(type) {
    alert(`Exporting as ${type.toUpperCase()}... (connect to actual export library)`);
  }

  return (
    <div className="rp-root">

      {/* Header */}
      <div className="rp-header">
        <div>
          <h2 className="rp-title">Reports & Analytics</h2>
          <p className="rp-subtitle">View inventory performance and download reports</p>
        </div>
        <div className="rp-export-group">
          <button className="rp-export-btn" onClick={() => handleExport('excel')}>
            <FileText size={13} /> Excel
          </button>
          <button className="rp-export-btn" onClick={() => handleExport('pdf')}>
            <FileText size={13} /> PDF
          </button>
          <button className="rp-export-btn" onClick={() => handleExport('image')}>
            <Image size={13} /> Image
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="rp-tabs">
        <button className={`rp-tab ${activeReport === 'summary' ? 'active' : ''}`} onClick={() => setActiveReport('summary')}>
          <Package size={13} /> Stock Summary
        </button>
        <button className={`rp-tab ${activeReport === 'movement' ? 'active' : ''}`} onClick={() => setActiveReport('movement')}>
          <BarChart2 size={13} /> Stock Movement
        </button>
        <button className={`rp-tab ${activeReport === 'top' ? 'active' : ''}`} onClick={() => setActiveReport('top')}>
          <TrendingUp size={13} /> Top Moving Products
        </button>
      </div>

      {/* Stock Summary Report */}
      {activeReport === 'summary' && (
        <div className="rp-section">
          <div className="rp-kpi-row">
            <div className="rp-kpi">
              <div className="rp-kpi-label">Total Products</div>
              <div className="rp-kpi-val">5</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi-label">Total Stock In</div>
              <div className="rp-kpi-val" style={{color:'#0ca30c'}}>860</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi-label">Total Stock Out</div>
              <div className="rp-kpi-val" style={{color:'#e24b4a'}}>738</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi-label">Total Remaining</div>
              <div className="rp-kpi-val">122</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi-label">Low Stock</div>
              <div className="rp-kpi-val" style={{color:'#fab219'}}>2</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi-label">Out of Stock</div>
              <div className="rp-kpi-val" style={{color:'#e24b4a'}}>1</div>
            </div>
          </div>

          {/* Summary Table */}
          <div className="rp-table-wrap">
            <div className="rp-label-row">
              <div>Product Name</div>
              <div>Category</div>
              <div>Stock In</div>
              <div>Stock Out</div>
              <div>Remaining</div>
              <div>Status</div>
            </div>
            <main className="rp-data-table">
              {STOCK_SUMMARY.map((item, i) => (
                <div className="rp-data-row" key={i}>
                  <div className="rp-cell" title={item.name}>{item.name}</div>
                  <div className="rp-cell">{item.category}</div>
                  <div className="rp-cell" style={{color:'#0ca30c'}}>+{item.stockIn}</div>
                  <div className="rp-cell" style={{color:'#e24b4a'}}>-{item.stockOut}</div>
                  <div className="rp-cell">{item.remaining}</div>
                  <div className="rp-cell">
                    <span className={`rp-badge ${
                      item.status === 'In Stock' ? 'badge-ok' :
                      item.status === 'Low Stock' ? 'badge-low' : 'badge-out'
                    }`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </main>
          </div>
        </div>
      )}

      {/* Stock Movement Chart */}
      {activeReport === 'movement' && (
        <div className="rp-section">
          <div className="rp-chart-header">
            <div className="rp-legend">
              <span className="rp-legend-dot" style={{background:'#0ca30c'}}></span> Stock In
              <span className="rp-legend-dot" style={{background:'#e24b4a', marginLeft:'12px'}}></span> Stock Out
            </div>
            <div className="rp-period-toggle">
              {['week','month','year'].map(p => (
                <button
                  key={p}
                  className={`rp-period-btn ${period === p ? 'active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div className="rp-chart-wrap">
            <div className="rp-chart-y-axis">
              {[100, 75, 50, 25, 0].map(v => (
                <div key={v} className="rp-y-label">{Math.round(maxVal * v / 100)}</div>
              ))}
            </div>
            <div className="rp-chart-bars">
              {data.labels.map((label, i) => (
                <div className="rp-bar-group" key={i}>
                  <div className="rp-bars">
                    <div
                      className="rp-bar rp-bar-in"
                      style={{ height: `${(data.stockIn[i] / maxVal) * 100}%` }}
                      title={`Stock In: ${data.stockIn[i]}`}
                    />
                    <div
                      className="rp-bar rp-bar-out"
                      style={{ height: `${(data.stockOut[i] / maxVal) * 100}%` }}
                      title={`Stock Out: ${data.stockOut[i]}`}
                    />
                  </div>
                  <div className="rp-bar-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Moving Products */}
      {activeReport === 'top' && (
        <div className="rp-section">
          <div className="rp-table-wrap">
            <div className="rp-label-row rp-label-row-top">
              <div>Rank</div>
              <div>Product Name</div>
              <div>Category</div>
              <div>Units Sold</div>
              <div>Trend</div>
            </div>
            <main className="rp-data-table">
              {[...TOP_MOVING]
                .sort((a, b) => b.sold - a.sold)
                .map((item, i) => (
                <div className="rp-data-row rp-data-row-top" key={i}>
                  <div className="rp-cell rp-rank">#{i + 1}</div>
                  <div className="rp-cell" title={item.name}>{item.name}</div>
                  <div className="rp-cell">{item.category}</div>
                  <div className="rp-cell"><strong>{item.sold}</strong> units</div>
                  <div className="rp-cell">
                    {item.trend === 'up'
                      ? <span style={{color:'#0ca30c', display:'flex', alignItems:'center', gap:'4px', justifyContent:'center'}}><TrendingUp size={14}/> Rising</span>
                      : <span style={{color:'#e24b4a', display:'flex', alignItems:'center', gap:'4px', justifyContent:'center'}}><TrendingDown size={14}/> Declining</span>
                    }
                  </div>
                </div>
              ))}
            </main>
          </div>
        </div>
      )}

    </div>
  );
}

export default Reports;
