import React, { useState } from 'react';
import {
  Search
} from 'lucide-react';

import '../css/Product-Supplier.css'; /*Product and Supplier CSS */

function ProductSupplier({ onNavigate }) {

  return (
    <div className="table-parent">
      
{/* Search bar */}
      <div className="navigation-bar">
        <search>
          <form action="/search-result" method="get">
            <input type="search" placeholder= "Search... "name="search-bar" id="search-input" />
            <Search size={18} className="search-icon" />
          </form>
        </search>
      </div>

{/* Label bar */}
      <div className="label-row-grid">
        <div>Product ID</div>
        
        <div>Product Name</div> <span></span>
        
        <div>Category</div>
        
        <div>Brand</div>
        
        <div>Model</div>
        
        <div>Unit Measure</div>
        
        <div>Supplier Information</div>
        
        <div>Actions</div>
      </div>

{/* Data-tables */}
      <main className="data-table">
        data
      </main>


    </div>
  );
}

export default ProductSupplier;
