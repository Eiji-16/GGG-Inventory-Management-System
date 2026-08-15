import React, { useState, useEffect } from 'react';
import { Plus, Search, X, Edit, Trash2 } from 'lucide-react';

import './stockControl.css';

const emptyForm = {
  date: '',
  productName: '',
  category: '',
  type: '',
  qty: '',
  remainingStock: '',
  notes: '',
  recordedBy: '',
};

function StockControl({ onNavigate }) {
  const [stockFromDatabase, setStockFromDatabase] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetch('/stockControl.json')
      .then((response) => response.json())
      .then((data) => setStockFromDatabase(data))
      .catch((error) => console.error("Error reading your file:", error));
  }, []);

  const allSelected =
    stockFromDatabase.length > 0 &&
    selectedIds.size === stockFromDatabase.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(stockFromDatabase.map((_, i) => i)));
    }
  };

  const toggleSelectRow = (index) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const openAddModal = () => {
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    setStockFromDatabase((prev) => [...prev, formData]);
    closeModal();
  };

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
        <button className="sc-add-btn" onClick={openAddModal} type="button">
          <p>Add Item</p>
          <Plus size={12} className="sc-add-icon" />
        </button>
      </div>

      {/* Label bar */}
      <div className="sc-label-row-grid">
        <div className="sc-checkbox-cell">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all rows"
          />
        </div>
        <div>Date</div>
        <div>Product Name</div>
        <div>Category</div>
        <div>Type</div>
        <div>Qty</div>
        <div>Remaining Stock</div>
        <div>Safety Level</div>
        <div>Notes</div>
        <div>Recorded by</div>
        <div>Action</div>
      </div>

      {/* Data table */}
      <main className="sc-data-table">
        {stockFromDatabase.map((stock, index) => (
          <div
            className={`sc-data-row-grid ${selectedIds.has(index) ? 'is-selected' : ''}`}
            key={index}
          >
            <div className="sc-checkbox-cell">
              <input
                type="checkbox"
                checked={selectedIds.has(index)}
                onChange={() => toggleSelectRow(index)}
                aria-label={`Select entry ${index}`}
              />
            </div>
            <div className="sc-cell-text" data-label="Date">{stock.date}</div>
            <div className="sc-cell-text" data-label="Product Name" title={stock.productName}>{stock.productName}</div>
            <div className="sc-cell-text" data-label="Category">{stock.category}</div>
            <div className="sc-cell-text" data-label="Type">{stock.type}</div>
            <div className="sc-cell-text" data-label="Qty">{stock.qty}</div>
            <div className="sc-cell-text" data-label="Remaining Stock">{stock.remainingStock}</div>
            <div className="sc-cell-text" data-label="Safety Level">{stock.safetyLevel}</div>
            <div className="sc-cell-text" data-label="Notes" title={stock.notes}>{stock.notes || '—'}</div>
            <div className="sc-cell-text" data-label="Recorded by">{stock.recordedBy}</div>
            <div className="sc-action-cell-container" data-label="Actions">
              <button
                className="sc-table-action-btn sc-edit-btn"
                onClick={() => openEditModal(product)}
                aria-label="Edit Item"
                title="Edit Item"
                type="button"
              >
                <Edit size={16} />
              </button>
              <button
                className="sc-table-action-btn sc-delete-btn"
                onClick={() => handleDelete(product.id)}
                aria-label="Delete Item"
                title="Delete Item"
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {stockFromDatabase.length === 0 && (
          <div className="sc-empty-state">
            LOADING INVENTORY DATABASES OR NO LOGS RECORDED...
          </div>
        )}
      </main>

      {/* Add Item Modal */}
      {isModalOpen && (
        <div className="sc-modal-overlay" onClick={closeModal}>
          <div className="sc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sc-modal-header">
              <h3>Add Stock Entry</h3>
              <button className="sc-modal-close-btn" onClick={closeModal} type="button" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form className="sc-modal-form" onSubmit={handleSave}>
              <div className="sc-form-row">
                <div className="sc-form-group">
                  <label htmlFor="date">Date</label>
                  <input id="date" name="date" type="date" value={formData.date} onChange={handleFormChange} required />
                </div>
                <div className="sc-form-group">
                  <label htmlFor="type">Type</label>
                  <select id="type" name="type" value={formData.type} onChange={handleFormChange} required>
                    <option value="">Select type</option>
                    <option value="Stock In">Stock In</option>
                    <option value="Stock Out">Stock Out</option>
                    <option value="Adjustment">Adjustment</option>
                  </select>
                </div>
              </div>

              <div className="sc-form-group">
                <label htmlFor="productName">Product Name</label>
                <input id="productName" name="productName" value={formData.productName} onChange={handleFormChange} required />
              </div>

              <div className="sc-form-row">
                <div className="sc-form-group">
                  <label htmlFor="category">Category</label>
                  <input id="category" name="category" value={formData.category} onChange={handleFormChange} />
                </div>
                <div className="sc-form-group">
                  <label htmlFor="qty">Qty</label>
                  <input id="qty" name="qty" type="number" value={formData.qty} onChange={handleFormChange} required />
                </div>
              </div>

              <div className="sc-form-row">
                <div className="sc-form-group">
                  <label htmlFor="remainingStock">Remaining Stock</label>
                  <input id="remainingStock" name="remainingStock" type="number" value={formData.remainingStock} onChange={handleFormChange} />
                </div>
                <div className="sc-form-group">
                  <label htmlFor="recordedBy">Recorded by</label>
                  <input id="recordedBy" name="recordedBy" value={formData.recordedBy} onChange={handleFormChange} />
                </div>
              </div>

              <div className="sc-form-group">
                <label htmlFor="notes">Notes</label>
                <input id="notes" name="notes" value={formData.notes} onChange={handleFormChange} />
              </div>

              <div className="sc-modal-actions">
                <button type="button" className="sc-modal-cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="sc-modal-save-btn">
                  Add Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockControl;