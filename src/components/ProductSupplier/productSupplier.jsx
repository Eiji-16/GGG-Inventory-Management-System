import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Trash2, X, Package, Info, Download, AlertTriangle } from 'lucide-react';

import './productSupplier.css';



/* ===== EMPTY FORM ===== */
const emptyForm = {
  id: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  unitMeasure: '',
  supplierInfo: '',
};

/* ===== PRODUCT DATA ===== */

/* ===== DETAIL FIELDS ===== */
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
  const PAGE_SIZE = 10;
  const [productsFromDatabase, setProductsFromDatabase] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [cursor, setCursor] = useState(0); /* ===== PAGE START ===== */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); /* ===== MODAL MODE ===== */
  const [formData, setFormData] = useState(emptyForm);
  const [detailProduct, setDetailProduct] = useState(null);
  const [query, setQuery] = useState(''); /* ===== SEARCH ===== */
  /* ===== DELETE TARGET ===== */
  const [confirmTarget, setConfirmTarget] = useState(null);

  /* ===== LOAD PRODUCTS ===== */
  useEffect(() => {
    fetch('/api/products', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`GET /api/products failed (${response.status})`);
        return response.json();
      })
      .then((data) => setProductsFromDatabase(data))
      .catch((error) => console.error('Could not load products:', error));
  }, []);

  /* ===== FILTER PRODUCTS ===== */
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productsFromDatabase;
    return productsFromDatabase.filter((p) =>
      [p.id, p.name, p.category, p.brand, p.model, p.unitMeasure, p.supplierInfo]
        .some((field) => String(field ?? '').toLowerCase().includes(q))
    );
  }, [productsFromDatabase, query]);

  /* ===== RESET PAGE ===== */
  useEffect(() => {
    setCursor(0);
  }, [query]);

  const total = filteredProducts.length;
  const safeCursor = total === 0 ? 0 : Math.min(cursor, total - 1);
  /* ===== PAGE START ===== */
  const pageCursor = Math.floor(safeCursor / PAGE_SIZE) * PAGE_SIZE;
  const visibleProducts = filteredProducts.slice(pageCursor, pageCursor + PAGE_SIZE);
  const hasNext = pageCursor + PAGE_SIZE < total;
  const hasPrev = pageCursor > 0;
  const pageLabel = total === 0
    ? 'No items'
    : `${pageCursor + 1}–${Math.min(pageCursor + PAGE_SIZE, total)} of ${total}`;

  const tableRef = useRef(null);

  /* ===== RESET SCROLL ===== */
  useEffect(() => {
    const win = document.querySelector('.main-content-window');
    if (win) win.scrollTop = 0;
  }, [cursor]);

  const goNext = () => {
    if (!hasNext) return;
    setCursor(pageCursor + PAGE_SIZE);
  };
  const goPrev = () => {
    if (!hasPrev) return;
    setCursor(Math.max(0, pageCursor - PAGE_SIZE));
  };

  const allSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleProducts.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleProducts.forEach((p) => next.add(p.id));
        return next;
      });
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

  /* ===== DETAILS MODAL ===== */
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

  /* ===== SAVE PRODUCT ===== */
  const handleSave = async (e) => {
    e.preventDefault();

    const payload = {
      name: formData.name,
      category: formData.category,
      brand: formData.brand,
      model: formData.model,
      unitMeasure: formData.unitMeasure,
      supplierName: formData.supplierInfo || null,
    };

    try {
      const isAdd = modalMode === 'add';
      const url = isAdd ? '/api/products' : `/api/products/${formData.id}`;
      const response = await fetch(url, {
        method: isAdd ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      const saved = await response.json(); /* ===== SAVED PRODUCT ===== */

      setProductsFromDatabase((prev) =>
        isAdd
          ? [...prev, saved]
          : prev.map((p) => (p.id === saved.id ? saved : p))
      );
      closeModal();
    } catch (error) {
      console.error('Could not save product:', error);
      alert('Sorry — that product could not be saved. Check the server is running and try again.');
    }
  };

  /* ===== DELETE PRODUCT ===== */
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
    } catch (error) {
      console.error('Could not delete product:', error);
      alert('Sorry — that product could not be deleted. Check the server is running and try again.');
      return;
    }

    setProductsFromDatabase((prev) => {
      const next = prev.filter((p) => p.id !== id);
      /* ===== PREVIOUS PAGE ===== */
      const newPageCursor = Math.floor(cursor / PAGE_SIZE) * PAGE_SIZE;
      if (newPageCursor >= next.length && newPageCursor > 0) {
        setCursor(Math.max(0, newPageCursor - PAGE_SIZE));
      }
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  /* ===== DELETE CHECK ===== */
  const requestDeleteSingle = (product) => setConfirmTarget({ type: 'single', product });
  const requestDeleteBulk = () => {
    if (selectedIds.size === 0) return;
    setConfirmTarget({ type: 'bulk', ids: Array.from(selectedIds) });
  };

  const confirmDelete = () => {
    if (!confirmTarget) return;
    if (confirmTarget.type === 'single') {
      handleDelete(confirmTarget.product.id);
    } else {
      confirmTarget.ids.forEach((id) => handleDelete(id));
      setSelectedIds(new Set());
    }
    setConfirmTarget(null);
  };

  /* ===== EXPORT CSV ===== */
  const exportCsv = () => {
    if (filteredProducts.length === 0) return;
    const headers = ['Product ID', 'Product Name', 'Category', 'Brand', 'Model', 'Unit Measure', 'Supplier Information'];
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...filteredProducts.map((p) =>
        [p.id, p.name, p.category, p.brand, p.model, p.unitMeasure, p.supplierInfo].map(escape).join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
/* ===== PRODUCT DATA END ===== */
  return (
    <div className="ps-table-parent">
      {/* ===== SEARCH BAR ===== */}
      <div className="ps-navigation-bar">
        <div className="ps-search-wrapper">
          <div className="ps-search-box">
            <Search size={13} className="ps-search-icon" />
            <input
              type="search"
              placeholder="Search products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search products"
            />
          </div>
        </div>
        <button
          className="ps-add-btn"
          onClick={exportCsv}
          type="button"
          disabled={filteredProducts.length === 0}
          title="Export the current list to CSV"
        >
          <p>Export</p>
          <Download size={12} />
        </button>
        {selectedIds.size > 0 && (
          <button
            className="ps-add-btn ps-delete-selected-btn"
            onClick={requestDeleteBulk}
            type="button"
            title={`Delete ${selectedIds.size} selected`}
          >
            <p>Delete ({selectedIds.size})</p>
            <Trash2 size={12} />
          </button>
        )}
        <button className="ps-add-btn ps-add-btn-primary" onClick={openAddModal} type="button">
          <p>Add</p>
          <Plus size={12} className="ps-add-icon" />
        </button>
      </div>

      {/* ===== TABLE ===== */}
      <div className="ps-table-scroll" ref={tableRef}>
        <table className="ps-table">
          <thead>
            <tr>
              <th className="ps-th-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
              <th>Product ID</th>
              <th className="ps-th-left">Product Name</th>
              <th>Category</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Unit Measure</th>
              <th className="ps-th-left">Supplier Information</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product, idx) => (
              <tr
                className={`ps-row-clickable ${selectedIds.has(product.id) ? 'is-selected' : ''}`}
                key={pageCursor + idx}
                title={`View full information for ${product.name}`}
                onClick={() => openDetails(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDetails(product);
                  }
                }}
                tabIndex={0}
              >
                <td className="ps-td-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleSelectRow(product.id)}
                    aria-label={`Select ${product.name}`}
                  />
                </td>
                <td className="ps-td-nowrap ps-td-muted" data-label="Product ID">{product.id}</td>
                <td className="ps-td-left ps-cell-name" data-label="Product Name" title={product.name}>{product.name}</td>
                <td data-label="Category">{product.category || '—'}</td>
                <td data-label="Brand">{product.brand || '—'}</td>
                <td data-label="Model">{product.model || '—'}</td>
                <td data-label="Unit Measure">{product.unitMeasure || '—'}</td>
                <td className="ps-td-left ps-td-muted" data-label="Supplier" title={product.supplierInfo}>{product.supplierInfo || '—'}</td>
                <td className="ps-td-actions" data-label="Actions" onClick={(e) => e.stopPropagation()}>
                  <div className="ps-action-cell-container">
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
                      onClick={() => requestDeleteSingle(product)}
                      aria-label="Delete Item"
                      title="Delete Item"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={9} className="ps-empty-state">
                  {productsFromDatabase.length === 0
                    ? 'No products registered yet. Click “Add” to register one.'
                    : 'No products match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== PAGE BAR ===== */}
      {total > PAGE_SIZE && (
        <div className="ps-pagination">
          <button
            className="ps-page-pill"
            onClick={goPrev}
            disabled={!hasPrev}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="ps-page-label">{pageLabel}</span>
          <button
            className="ps-page-pill"
            onClick={goNext}
            disabled={!hasNext}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}

      {/* ===== DETAILS MODAL ===== */}
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

      {/* ===== ADD EDIT MODAL ===== */}
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

      {/* ===== DELETE CHECK ===== */}
      {confirmTarget && createPortal(
        <div className="ps-modal-overlay" onClick={() => setConfirmTarget(null)}>
          <div
            className="ps-modal ps-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ps-confirm-title"
          >
            <div className="ps-confirm-body">
              <span className="ps-confirm-icon" aria-hidden="true">
                <AlertTriangle size={22} />
              </span>
              <h3 id="ps-confirm-title" className="ps-confirm-title">
                {confirmTarget.type === 'single'
                  ? 'Delete this item?'
                  : `Delete ${confirmTarget.ids.length} item${confirmTarget.ids.length !== 1 ? 's' : ''}?`}
              </h3>
              <p className="ps-confirm-text">
                {confirmTarget.type === 'single' ? (
                  <>You’re about to delete <strong>{confirmTarget.product.name || 'this product'}</strong>. </>
                ) : (
                  <>You’re about to delete the selected products. </>
                )}
                This can’t be undone.
              </p>
            </div>
            <div className="ps-modal-actions">
              <button type="button" className="ps-modal-cancel-btn" onClick={() => setConfirmTarget(null)}>
                Cancel
              </button>
              <button type="button" className="ps-confirm-delete-btn" onClick={confirmDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ProductSupplier;