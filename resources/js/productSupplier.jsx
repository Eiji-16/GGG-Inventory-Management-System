import React, { useState, useEffect } from 'react';
import {
   Search, Plus, Edit, Trash2
} from 'lucide-react';

import '../css/productSupplier.css';

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
    <div className="ps-table-parent">

      {/* Search bar */}
      <div className="ps-navigation-bar">
        <div className="ps-search-wrapper">
          <form action="/search-result" method="get">
            <input type="search" placeholder="Search..." name="search-bar" id="search-input" />
            <Search size={12} className="ps-search-icon" />
          </form>
        </div>
        <button className="ps-add-btn">
          <p>Add</p>
          <Plus size={12} className="ps-add-icon" />
        </button>
      </div>

      {/* Label bar */}
      <div className="ps-label-row-grid">
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
      <main className="ps-data-table">
        {productsFromDatabase.map((product) => (
          <div className="ps-data-row-grid" key={product.id}>
            <div className="ps-cell-text">{product.id}</div>
            <div className="ps-cell-text" title={product.name}>{product.name}</div>
            <div className="ps-cell-text">{product.category}</div>
            <div className="ps-cell-text">{product.brand}</div>
            <div className="ps-cell-text">{product.model}</div>
            <div className="ps-cell-text">{product.unitMeasure}</div>
            <div className="ps-cell-text" title={product.supplierInfo}>{product.supplierInfo}</div>
            <div className="ps-action-cell-container">
              <button
                className="ps-table-action-btn ps-edit-btn"
                onClick={() => handleEdit(product.id)}
                aria-label="Edit Item"
                title="Edit Item"
              >
                <Edit size={16} />
              </button>
              <button
                className="ps-table-action-btn ps-delete-btn"
                onClick={() => handleDelete(product.id)}
                aria-label="Delete Item"
                title="Delete Item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {productsFromDatabase.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '12px', color: '#666' }}>
            LOADING INVENTORY DATABASES OR NO LOGS RECORDED...
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductSupplier;