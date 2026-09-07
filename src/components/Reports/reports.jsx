import React, { useState } from 'react';
import { Download, Search } from 'lucide-react';
import './reports.css';

const TABS = [
  'Stock Summary',
  'Stock Movement',
  'Top Moving Products',
  'Demand Forecast Summary',
  'AutoCalculator Summary',
  'Inventory Aging Report',
  'Reorder Point Report',
];

const PanelHeader = ({ title, subtitle }) => (
  <div className="r-panel-header">
    <div className="r-panel-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    <button className="r-export-btn">
      <Download size={13} /> Export
    </button>
  </div>
);

function StockSummaryTab() {
  return (
    <div>
      <PanelHeader title="Stock Summary" subtitle="Overview of current inventory levels across all products" />

      <div className="r-filters-bar">
        <div className="r-filter-field">
          <label>From date</label>
          <input type="date" />
        </div>
        <div className="r-filter-field">
          <label>To date</label>
          <input type="date" />
        </div>
        <div className="r-filter-field">
          <label>Category</label>
          <select defaultValue="">
            <option value="">All categories</option>
            <option>Timepieces</option>
            <option>Accessories</option>
            <option>Movements</option>
          </select>
        </div>
        <div className="r-filter-field" style={{ flex: 1, minWidth: 200 }}>
          <label>Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #888)' }} />
            <input type="text" placeholder="Search product…" style={{ paddingLeft: 28, width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="r-kpi-row">
        <div className="r-kpi-card">
          <div className="r-kpi-label">Total Stock</div>
          <div className="r-kpi-value">1,842</div>
          <div className="r-kpi-sub">units across 5 products</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Low Stock Items</div>
          <div className="r-kpi-value">2</div>
          <div className="r-kpi-sub">below reorder point</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Out of Stock</div>
          <div className="r-kpi-value">0</div>
          <div className="r-kpi-sub">no products depleted</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Inventory Value</div>
          <div className="r-kpi-value">₱612K</div>
          <div className="r-kpi-sub">at cost</div>
        </div>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Stock</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>Precision Steel Chronograph</td><td>Timepieces</td><td>42</td><td><span className="r-badge r-badge-good"><span className="r-dot" />In Stock</span></td></tr>
            <tr><td>Water-Resistant Diver Strap</td><td>Accessories</td><td>120</td><td><span className="r-badge r-badge-good"><span className="r-dot" />In Stock</span></td></tr>
            <tr><td>Sapphire Crystal Glass Face</td><td>Spare Parts</td><td>8</td><td><span className="r-badge r-badge-bad"><span className="r-dot" />Low Stock</span></td></tr>
            <tr><td>Premium Calfskin Band</td><td>Accessories</td><td>65</td><td><span className="r-badge r-badge-good"><span className="r-dot" />In Stock</span></td></tr>
            <tr><td>Automatic Movement Caliber</td><td>Movements</td><td>15</td><td><span className="r-badge r-badge-warn"><span className="r-dot" />Watch</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockMovementTab() {
  const [chartType, setChartType] = useState('bar');
  return (
    <div>
      <PanelHeader title="Stock Movement" subtitle="Units moving in and out of inventory over time" />

      <div className="r-filters-bar">
        <div className="r-filter-field">
          <label>From date</label>
          <input type="date" />
        </div>
        <div className="r-filter-field">
          <label>To date</label>
          <input type="date" />
        </div>
      </div>

      <div className="r-chart-card">
        <div className="r-chart-card-head">
          <h3>Movement over time</h3>
          <div className="r-toggle-group">
            <button className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')}>Bar</button>
            <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>Line</button>
          </div>
          <div className="r-toggle-group">
            <button className="active">Week</button>
            <button>Month</button>
            <button>Year</button>
          </div>
        </div>
        <div className="r-chart-placeholder">
          [ {chartType} chart renders here ]
        </div>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Period</th><th>Stock In</th><th>Stock Out</th><th>Net Change</th></tr>
          </thead>
          <tbody>
            <tr><td>Week 1</td><td>120</td><td>95</td><td className="r-trend-up">+25</td></tr>
            <tr><td>Week 2</td><td>80</td><td>110</td><td className="r-trend-down">-30</td></tr>
            <tr><td>Week 3</td><td>150</td><td>90</td><td className="r-trend-up">+60</td></tr>
            <tr><td>Week 4</td><td>60</td><td>75</td><td className="r-trend-down">-15</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopMovingProductsTab() {
  const [moveType, setMoveType] = useState('fast');
  return (
    <div>
      <PanelHeader title="Top Moving Products" subtitle="Ranked by sales velocity" />

      <div className="r-filters-bar">
        <div className="r-filter-field">
          <label>Category</label>
          <select defaultValue="">
            <option value="">All categories</option>
            <option>Timepieces</option>
            <option>Accessories</option>
          </select>
        </div>
        <div className="r-filter-field">
          <label>View</label>
          <div className="r-toggle-group">
            <button className={moveType === 'fast' ? 'active' : ''} onClick={() => setMoveType('fast')}>Fast Moving</button>
            <button className={moveType === 'slow' ? 'active' : ''} onClick={() => setMoveType('slow')}>Slow Moving</button>
          </div>
        </div>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Rank</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Trend</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>Water-Resistant Diver Strap</td><td>95</td><td>₱142,500</td><td className="r-trend-up">▲ 18%</td></tr>
            <tr><td>2</td><td>Premium Calfskin Band</td><td>58</td><td>₱87,000</td><td className="r-trend-up">▲ 9%</td></tr>
            <tr><td>3</td><td>Precision Steel Chronograph</td><td>38</td><td>₱304,000</td><td className="r-trend-down">▼ 4%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DemandForecastSummaryTab() {
  return (
    <div>
      <PanelHeader title="Demand Forecast Summary" subtitle="Latest forecast run across all products" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Forecasted Demand</th><th>Suggested Reorder</th><th>Confidence</th></tr>
          </thead>
          <tbody>
            <tr><td>Precision Steel Chronograph</td><td>42</td><td>32.1</td><td>10</td><td><span className="r-badge r-badge-good"><span className="r-dot" />High</span></td></tr>
            <tr><td>Sapphire Crystal Glass Face</td><td>8</td><td>13.2</td><td>9</td><td><span className="r-badge r-badge-warn"><span className="r-dot" />Medium</span></td></tr>
            <tr><td>Automatic Movement Caliber</td><td>15</td><td>9.8</td><td>0</td><td><span className="r-badge r-badge-bad"><span className="r-dot" />Low</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutoCalculatorSummaryTab() {
  return (
    <div>
      <PanelHeader title="AutoCalculator Summary" subtitle="Every AutoCalculator computation logged to date" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Annual Demand</th><th>Order Cost</th><th>Holding Cost</th><th>AutoCalculator Result</th><th>Date Computed</th></tr>
          </thead>
          <tbody>
            <tr><td>Precision Steel Chronograph</td><td>1,200</td><td>₱500</td><td>₱50</td><td>109.54</td><td>8/23/2026</td></tr>
            <tr><td>Sapphire Crystal Glass Face</td><td>480</td><td>₱300</td><td>₱40</td><td>84.85</td><td>8/20/2026</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryAgingReportTab() {
  return (
    <div>
      <PanelHeader title="Inventory Aging Report" subtitle="How long products have sat in stock" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Days in Stock</th><th>Stock Level</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>Sapphire Crystal Glass Face</td><td>142</td><td>8</td><td><span className="r-badge r-badge-bad"><span className="r-dot" />Slow Mover</span></td></tr>
            <tr><td>Automatic Movement Caliber</td><td>98</td><td>15</td><td><span className="r-badge r-badge-warn"><span className="r-dot" />Aging</span></td></tr>
            <tr><td>Water-Resistant Diver Strap</td><td>21</td><td>120</td><td><span className="r-badge r-badge-good"><span className="r-dot" />Healthy</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReorderPointReportTab() {
  return (
    <div>
      <PanelHeader title="Reorder Point Report" subtitle="Products currently below their reorder point" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Reorder Point</th><th>Urgency</th></tr>
          </thead>
          <tbody>
            <tr><td>Sapphire Crystal Glass Face</td><td>8</td><td>20</td><td><span className="r-badge r-badge-bad"><span className="r-dot" />Critical</span></td></tr>
            <tr><td>Automatic Movement Caliber</td><td>15</td><td>18</td><td><span className="r-badge r-badge-warn"><span className="r-dot" />Low</span></td></tr>
          </tbody>
        </table>
        <div className="r-supplier-note">
          📋 This report is formatted for direct export and hand-off to your supplier.
        </div>
      </div>
    </div>
  );
}

const TAB_COMPONENTS = [
  StockSummaryTab,
  StockMovementTab,
  TopMovingProductsTab,
  DemandForecastSummaryTab,
  AutoCalculatorSummaryTab,
  InventoryAgingReportTab,
  ReorderPointReportTab,
];

export default function ReportsAnalyticsDesign() {
  const [activeTab, setActiveTab] = useState(0);
  const ActiveTabContent = TAB_COMPONENTS[activeTab];

  return (
    <div className="r-root">
      <div className="r-tabbar">
        {TABS.map((label, i) => (
          <button
            key={label}
            className={`r-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {label}
          </button>
        ))}
      </div>

      <ActiveTabContent />
    </div>
  );
}