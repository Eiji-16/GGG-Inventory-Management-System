import React, { useState, useEffect } from 'react'; 
import {
  Edit,
  Plus,
  Search,
  Trash2
} from 'lucide-react';

import '../css/stockControl.css'; /*Product and Supplier CSS */

function ProductSupplier({ onNavigate }) {

const [productsFromDatabase, setProductsFromDatabase] = useState([]);
useEffect(() => {
  fetch('/stockControl.json')
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
        <div>Date</div>
        <div>Product Name</div>
        <div>Category</div>
        <div>Type</div>
        <div>Qty</div>
        <div>Remaining Stock</div>
        <div>Notes</div>
        <div>Recorded by</div>
      </div>

{/* Data-tables */}
    {/* Sample Data AI GENERATE */}
      <main className="data-table">
        {/* Loop reads from the state basket array safely */}
        {productsFromDatabase.map((product) => (
          <div className="data-row-grid" key={product.id}>
            <div className="cell-id">{product.date}</div>
            <div className="cell-text" title={product.productName}>{product.productName}</div>
            <div className="cell-text">{product.category}</div>
            <div className="cell-text">{product.type}</div>
            <div className="cell-text">{product.qty}</div>
            <div className="cell-text">{product.remainingStock}</div>
            <div className="cell-text" title={product.notes}>{product.notes}</div>
            <div className="action-cell-container">
              <button
                className="table-action-btn edit-btn"
                onClick={() => handleEdit(product.id)}
                aria-label="Edit Item"
                title="Edit Item"
              >
                <Edit size={16} />
              </button>
              
              <button
                className="table-action-btn delete-btn"
                onClick={() => handleDelete(product.id)}
                aria-label="Delete Item"
                title="Delete Item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {/* Dynamic empty layout container preventing white voids if data is zero */}
        {productsFromDatabase.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '12px', color: '#666', background: '#fff' }}>
            LOADINGS INVENTORY DATABASES OR NO LOGS RECORDED...
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductSupplier;
