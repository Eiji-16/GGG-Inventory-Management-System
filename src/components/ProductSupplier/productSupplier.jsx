import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Trash2, X, Package, Info } from 'lucide-react';

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

/* Detail Fields */
const DETAIL_FIELDS = [
  { key: 'id', label: 'Product ID', hint: 'System reference used across every tab' },
  { key: 'name', label: 'Product Name', hint: 'Name shown in Stock Movement and forecasts', wide: true },
  { key: 'category', label: 'Category', hint: 'Grouping used for reports' },
  { key: 'brand', label: 'Brand', hint: 'Manufacturer of the item' },
  { key: 'model', label: 'Model', hint: 'Manufacturer model or reference code' },
  { key: 'unitMeasure', label: 'Unit Measure', hint: 'How quantity is counted for this item' },
  { key: 'supplierInfo', label: 'Supplier Information', hint: 'Contacted when a reorder is raised', wide: true },
];

function ProductSupplier({ onNavigate }) {
  const [productsFromDatabase, setProductsFromDatabase] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [formData, setFormData] = useState(emptyForm);
  const [detailProduct, setDetailProduct] = useState(null);

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

  /* Full Information Modal */
  const openDetails = (product) => setDetailProduct(product);

  const closeDetails = () => setDetailProduct(null);

  const editFromDetails = () => {
    const product = detailProduct;
    closeDetails();
    openEditModal(product);
  };

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
            className={`ps-data-row-grid ps-row-clickable ${selectedIds.has(product.id) ? 'is-selected' : ''}`}
            key={product.id}
            data-label-name={product.name}
            role="button"
            tabIndex={0}
            title={`View full information for ${product.name}`}
            onClick={() => openDetails(product)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDetails(product);
              }
            }}
          >
            <div className="ps-checkbox-cell" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedIds.has(product.id)}
                onChange={() => toggleSelectRow(product.id)}
                aria-label={`Select ${product.name}`}
              />
            </div>
            <div className="ps-cell-text" data-label="Product ID">{product.id}</div>
            <div className="ps-cell-text ps-cell-name" data-label="Product Name" title={product.name}>{product.name}</div>
            <div className="ps-cell-text" data-label="Category">{product.category || '—'}</div>
            <div className="ps-cell-text" data-label="Brand">{product.brand || '—'}</div>
            <div className="ps-cell-text" data-label="Model">{product.model || '—'}</div>
            <div className="ps-cell-text" data-label="Unit Measure">{product.unitMeasure || '—'}</div>
            <div className="ps-cell-text" data-label="Supplier Info" title={product.supplierInfo}>{product.supplierInfo || '—'}</div>
            <div className="ps-action-cell-container" data-label="Actions" onClick={(e) => e.stopPropagation()}>
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

      {/* Full Information Modal */}
      {detailProduct && createPortal(
        <div className="ps-modal-overlay" onClick={closeDetails}>
          <div
            className="ps-modal ps-detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-detail-title"
          >
            <div className="ps-modal-header">
              <div className="ps-modal-heading">
                <span className="ps-modal-icon" aria-hidden="true">
                  <Package size={18} />
                </span>
                <div className="ps-modal-titles">
                  <h3 id="ps-detail-title">{detailProduct.name || 'Product'}</h3>
                  <p className="ps-modal-subtitle">
                    Full item specification and assigned supplier record.
                  </p>
                </div>
              </div>
              <button className="ps-modal-close-btn" onClick={closeDetails} type="button" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="ps-modal-body">
              <div className="ps-modal-idtag">
                <span className="ps-modal-idtag-label">Product ID</span>
                <span className="ps-modal-idtag-value">{detailProduct.id}</span>
              </div>

              <div className="ps-detail-grid">
                {DETAIL_FIELDS.map((field) => (
                  <div
                    className={`ps-detail-item${field.wide ? ' ps-detail-item-wide' : ''}`}
                    key={field.key}
                  >
                    <span className="ps-detail-label">{field.label}</span>
                    <span className="ps-detail-value">{detailProduct[field.key] || '—'}</span>
                    <span className="ps-detail-hint">{field.hint}</span>
                  </div>
                ))}
              </div>

              <p className="ps-field-note ps-detail-note">
                <Info size={12} />
                Safety stock and reorder flags for this item live in Stock Control and are set by
                the Super Admin under Settings → Advanced Options.
              </p>
            </div>

            <div className="ps-modal-actions">
              <button type="button" className="ps-modal-cancel-btn" onClick={closeDetails}>
                Close
              </button>
              <button type="button" className="ps-modal-save-btn" onClick={editFromDetails}>
                Edit Product
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="ps-modal-overlay" onClick={closeModal}>
          <div
            className="ps-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-modal-title"
          >
            <div className="ps-modal-header">
              <div className="ps-modal-heading">
                <span className="ps-modal-icon" aria-hidden="true">
                  <Package size={18} />
                </span>
                <div className="ps-modal-titles">
                  <h3 id="ps-modal-title">{modalMode === 'add' ? 'Add Product' : 'Edit Product'}</h3>
                  <p className="ps-modal-subtitle">
                    {modalMode === 'add'
                      ? 'Register a new item and the supplier it comes from.'
                      : 'Update this item’s specifications or assigned supplier.'}
                  </p>
                </div>
              </div>
              <button className="ps-modal-close-btn" onClick={closeModal} type="button" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form className="ps-modal-form" onSubmit={handleSave}>
              <div className="ps-modal-body">
                {modalMode === 'edit' && formData.id && (
                  <div className="ps-modal-idtag">
                    <span className="ps-modal-idtag-label">Product ID</span>
                    <span className="ps-modal-idtag-value">{formData.id}</span>
                  </div>
                )}

                <section className="ps-form-section">
                  <h4 className="ps-form-section-title">Item specifications</h4>

                  <div className="ps-form-group ps-form-group-wide">
                    <label htmlFor="name">
                      Product Name <span className="ps-required">*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="e.g. Precision Steel Chronograph"
                      required
                    />
                  </div>

                  <div className="ps-form-row">
                    <div className="ps-form-group">
                      <label htmlFor="category">Category</label>
                      <input
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleFormChange}
                        placeholder="e.g. Timepieces"
                      />
                    </div>
                    <div className="ps-form-group">
                      <label htmlFor="brand">Brand</label>
                      <input
                        id="brand"
                        name="brand"
                        value={formData.brand}
                        onChange={handleFormChange}
                        placeholder="e.g. Seiko"
                      />
                    </div>
                  </div>

                  <div className="ps-form-row">
                    <div className="ps-form-group">
                      <label htmlFor="model">Model</label>
                      <input
                        id="model"
                        name="model"
                        value={formData.model}
                        onChange={handleFormChange}
                        placeholder="e.g. SKX-007"
                      />
                    </div>
                    <div className="ps-form-group">
                      <label htmlFor="unitMeasure">Unit Measure</label>
                      <input
                        id="unitMeasure"
                        name="unitMeasure"
                        value={formData.unitMeasure}
                        onChange={handleFormChange}
                        placeholder="Units, Pairs, Boxes…"
                      />
                    </div>
                  </div>
                </section>

                <section className="ps-form-section">
                  <h4 className="ps-form-section-title">Supplier</h4>

                  <div className="ps-form-group ps-form-group-wide">
                    <label htmlFor="supplierInfo">Supplier Information</label>
                    <input
                      id="supplierInfo"
                      name="supplierInfo"
                      value={formData.supplierInfo}
                      onChange={handleFormChange}
                      placeholder="Company name or contact"
                    />
                    <p className="ps-field-note">
                      Used by Stock Movement and the Auto Calculator when a reorder is raised.
                    </p>
                  </div>
                </section>
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
        </div>,
        document.body
      )}
    </div>
  );
}

export default ProductSupplier;