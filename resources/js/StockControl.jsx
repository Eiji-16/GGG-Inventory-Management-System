import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';

import '../css/stockControl.css';

function StockControl({ onNavigate }) {

  const [stockFromDatabase, setStockFromDatabase] = useState([]);
  useEffect(() => {
    fetch('/stockControl.json')
      .then((response) => response.json())
      .then((data) => setStockFromDatabase(data))
      .catch((error) => console.error("Error reading your file:", error));
  }, []);

  return (
    <div className="sc-table-parent">

      {/* Search bar */}
      <div className="sc-navigation-bar">
        <div className="sc-search-wrapper">
          <form action="/search-result" method="get">
            <input type="search" placeholder="Search..." name="search-bar" id="sc-search-input" />
            <Search size={12} className="sc-search-icon" />
          </form>
        </div>
        <button className="sc-add-btn">
          <p>Add Item</p>
          <Plus size={12} className="sc-add-icon" />
        </button>
      </div>

      {/* Label bar */}
      <div className="sc-label-row-grid">
        <div>Date</div>
        <div>Product Name</div>
        <div>Category</div>
        <div>Type</div>
        <div>Qty</div>
        <div>Remaining Stock</div>
        <div>Notes</div>
        <div>Recorded by</div>
      </div>

      {/* Data table */}
      <main className="sc-data-table">
        {stockFromDatabase.map((stock, index) => (
          <div className="sc-data-row-grid" key={index}>
            <div className="sc-cell-text">{stock.date}</div>
            <div className="sc-cell-text" title={stock.productName}>{stock.productName}</div>
            <div className="sc-cell-text">{stock.category}</div>
            <div className="sc-cell-text">{stock.type}</div>
            <div className="sc-cell-text">{stock.qty}</div>
            <div className="sc-cell-text">{stock.remainingStock}</div>
            <div className="sc-cell-text" title={stock.notes}>{stock.notes || '—'}</div>
            <div className="sc-cell-text">{stock.recordedBy}</div>
          </div>
        ))}

        {stockFromDatabase.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '12px', color: '#666' }}>
            LOADING INVENTORY DATABASES OR NO LOGS RECORDED...
          </div>
        )}
      </main>
    </div>
  );
}

export default StockControl;