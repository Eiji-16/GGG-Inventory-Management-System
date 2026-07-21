import React, { useState, useEffect } from 'react'; 
import {
  Plus,
  Search
} from 'lucide-react';

import '../css/productSupplier.css'; /*Product and Supplier CSS */

function ProductSupplier({ onNavigate }) {

const [productsFromDatabase, setProductsFromDatabase] = useState([]);
useEffect(() => {
  fetch('/productSupplier.json')
  .then((response) => response.json())
  .then((data) => setProductsFromDatabase(data))
  .catch((error) => console.error("Error reading your file:", error));
}, []);
  const handleEdit = (id) => alert(`Editing item: ${id}`);
  const handleDelete = (id) => alert(`Deleting item: ${id}`);



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

         <button className="Add-btn" >
          <p>Add Item</p>
          <Plus size={12} className="Add-icon"  />
         </button>

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
    {/* Sample Data AI GENERATE */}
      <main className="data-table">
        {/* Loop reads from the state basket array safely */}
        {productsFromDatabase.map((product) => (
          <div className="data-row-grid" key={product.id}>
            <div className="cell-id">{product.id}</div>
            <div className="cell-text" title={product.name}>{product.name}</div>
            <div className="cell-text">{product.category}</div>
            <div className="cell-text">{product.brand}</div>
            <div className="cell-text">{product.model}</div>
            <div className="cell-text">{product.unitMeasure}</div>
            <div className="cell-text" title={product.supplierInfo}>{product.supplierInfo}</div>
            <div>
              <button className="table-action-btn edit-btn" onClick={() => handleEdit(product.id)}>Edit</button>
              <button className="table-action-btn delete-btn" onClick={() => handleDelete(product.id)}>Delete</button>
            </div>
          </div>
        ))}

        {/* Dynamic empty layout container preventing white voids if data is zero */}
        {productsFromDatabase.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '12px', color: '#666', background: '#fff' }}>
            LOADING INVENTORY DATABASES OR NO LOGS RECORDED...
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductSupplier;
