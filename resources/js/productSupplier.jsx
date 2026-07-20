import React, { useState } from 'react';
import {
  Search
} from 'lucide-react';

import '../css/productSupplier.css'; /*Product and Supplier CSS */

function ProductSupplier({ onNavigate }) {

  return (
    <div className="table-parent">
      
{/* Search bar */}
      <div className="navigation-bar">
        <search>
          <form action="/search-result" method="get">
            <input type="search" placeholder= "Search... "name="search-bar" id="search-input" />
            <Search size={12} className="search-icon" />
          </form>
        </search>
      </div>

{/* Label bar */}
      <div className="label-row-grid">
        <div>Product ID</div>
        <div>Product Name</div>
        <div>Category</div>
        <div>Brand</div>
        <div>Model</div>
        <div>Unit Measure</div>
        <div>Supplier Information</div>
        <div>Actions</div>
      </div>

{/* Data-tables */}
      <main className="data-table">
        all data here
      </main>
    </div>
  );
}

export default ProductSupplier;
