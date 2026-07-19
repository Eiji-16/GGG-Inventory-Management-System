import React, { useState } from 'react';
import {
  BarChart3,
  Users,
  Boxes,
  TrendingUp,
  Calculator,
  Package,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

import '../css/Product-Supplier.css'; /*Product and Supplier CSS */

function ProductSupplier({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [selectedValue, setSelectedValue] = useState('');

  const handleChange = (event) => {
    setSelectedValue(event.target.value);
  };

  return (
    <div className="product-supplier-parent">
      <div className="product-supplier-table">
        <div className="search-bar-container">
          <input
            type="text"
            placeholder="Search Products or Supplier..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
          />

          <div className="option-selector">
            <label htmlFor="options">Choose an option: </label>
            <select id="options" value={selectedValue} onChange={handleChange}>
              <option value="">-- Please choose --</option>
              <option value="apple">Apple</option>
              <option value="banana">Banana</option>
              <option value="orange">Orange</option>
            </select>

            <p>Selected: {selectedValue}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductSupplier;
