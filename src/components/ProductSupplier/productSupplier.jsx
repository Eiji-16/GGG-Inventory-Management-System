import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, X } from 'lucide-react';

import './productSupplier.css';

const emptyForm = {
  id: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  unitMeasure: '',
  supplierInfo: '',
};

function ProductSupplier({ onNavigate }) {
  const [productsFromDatabase, setProductsFromDatabase] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetch('/productSupplier.json')
      .then((response) => response.json())
      .then((data) => setProductsFromDatabase(data))
      .catch((error) => console.error('Error reading your file:', error));
  }, []);

  const allSelected =
    productsFromDatabase.length > 0 &&
    selectedIds.size === productsFromDatabase.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(productsFromDatabase.map((p) => p.id)));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openAddModal = () => {
    setModalMode('add');
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setModalMode('edit');
    setFormData(product);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (modalMode === 'add') {
      const newProduct = { ...formData, id: formData.id || Date.now() };
      setProductsFromDatabase((prev) => [...prev, newProduct]);
    } else {
      setProductsFromDatabase((prev) =>
        prev.map((p) => (p.id === formData.id ? formData : p))
      );
    }
    closeModal();
  };

  const handleDelete = (id) => {
    setProductsFromDatabase((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

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
        <button className="ps-add-btn" onClick={openAddModal} type="button">
          <p>Add</p>
          <Plus size={12} className="ps-add-icon" />
        </button>
      </div>

      {/* Label bar */}
      <div className="ps-label-row-grid">
        <div className="ps-checkbox-cell">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all rows"
          />
        </div>
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
          <div
            className={`ps-data-row-grid ${selectedIds.has(product.id) ? 'is-selected' : ''}`}
            key={product.id}
            data-label-name={product.name}
          >
            <div className="ps-checkbox-cell">
              <input
                type="checkbox"
                checked={selectedIds.has(product.id)}
                onChange={() => toggleSelectRow(product.id)}
                aria-label={`Select ${product.name}`}
              />
            </div>
            <div className="ps-cell-text" data-label="Product ID">{product.id}</div>
            <div className="ps-cell-text" data-label="Product Name" title={product.name}>{product.name}</div>
            <div className="ps-cell-text" data-label="Category">{product.category}</div>
            <div className="ps-cell-text" data-label="Brand">{product.brand}</div>
            <div className="ps-cell-text" data-label="Model">{product.model}</div>
            <div className="ps-cell-text" data-label="Unit Measure">{product.unitMeasure}</div>
            <div className="ps-cell-text" data-label="Supplier Info" title={product.supplierInfo}>{product.supplierInfo}</div>
            <div className="ps-action-cell-container" data-label="Actions">
              <button
                className="ps-table-action-btn ps-edit-btn"
                onClick={() => openEditModal(product)}
                aria-label="Edit Item"
                title="Edit Item"
                type="button"
              >
                <Edit size={16} />
              </button>
              <button
                className="ps-table-action-btn ps-delete-btn"
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

        {productsFromDatabase.length === 0 && (
          <div className="ps-empty-state">
            LOADING INVENTORY DATABASES OR NO LOGS RECORDED...
          </div>
        )}
      </main>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="ps-modal-overlay" onClick={closeModal}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>{modalMode === 'add' ? 'Add Product' : 'Edit Product'}</h3>
              <button className="ps-modal-close-btn" onClick={closeModal} type="button" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form className="ps-modal-form" onSubmit={handleSave}>
              <div className="ps-form-group">
                <label htmlFor="name">Product Name</label>
                <input id="name" name="name" value={formData.name} onChange={handleFormChange} required />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="category">Category</label>
                  <input id="category" name="category" value={formData.category} onChange={handleFormChange} />
                </div>
                <div className="ps-form-group">
                  <label htmlFor="brand">Brand</label>
                  <input id="brand" name="brand" value={formData.brand} onChange={handleFormChange} />
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="model">Model</label>
                  <input id="model" name="model" value={formData.model} onChange={handleFormChange} />
                </div>
                <div className="ps-form-group">
                  <label htmlFor="unitMeasure">Unit Measure</label>
                  <input id="unitMeasure" name="unitMeasure" value={formData.unitMeasure} onChange={handleFormChange} />
                </div>
              </div>

              <div className="ps-form-group">
                <label htmlFor="supplierInfo">Supplier Information</label>
                <input id="supplierInfo" name="supplierInfo" value={formData.supplierInfo} onChange={handleFormChange} />
              </div>

              <div className="ps-modal-actions">
                <button type="button" className="ps-modal-cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="ps-modal-save-btn">
                  {modalMode === 'add' ? 'Add Product' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductSupplier;