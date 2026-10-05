import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Trash2, X, Package, Info, Download, AlertTriangle, Upload, Image as ImageIcon } from 'lucide-react';

import './productSupplier.css';



/* ===== EMPTY FORM ===== */
const emptyForm = {
  id: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  unitMeasure: '',
  image: '',
  suppliers: [], /* ===== SUPPLIER LIST (add-row pattern) ===== */
};

const emptySupplier = { name: '', contact: '' };

/* ===== PRODUCT DATA ===== */

/* ===== DETAIL FIELDS ===== */
const DETAIL_FIELDS = [
  { key: 'id', label: 'Product ID', hint: 'System reference used across every tab' },
  { key: 'name', label: 'Product Name', hint: 'Name shown in Stock Movement and forecasts', wide: true },
  { key: 'category', label: 'Category', hint: 'Grouping used for reports' },
  { key: 'brand', label: 'Brand', hint: 'Manufacturer of the item' },
  { key: 'model', label: 'Model', hint: 'Manufacturer model or reference code' },
  { key: 'unitMeasure', label: 'Unit Measure', hint: 'How quantity is counted for this item' },
  { key: 'supplierName', label: 'Supplier', hint: 'Company this item is ordered from', wide: true },
  { key: 'supplierContact', label: 'Supplier Contact', hint: 'Phone or email used when a reorder is raised', wide: true },
];

function ProductSupplier({ onNavigate }) {
  const PAGE_SIZE = 10;
  const [productsFromDatabase, setProductsFromDatabase] = useState([]);
  const [suppliers, setSuppliers] = useState([]); /* ===== SUPPLIER LIST (type-ahead + reuse) ===== */
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

  /* ===== LOAD SUPPLIERS (for the picker dropdown) ===== */
  useEffect(() => {
    fetch('/api/suppliers', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`GET /api/suppliers failed (${response.status})`);
        return response.json();
      })
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch((error) => console.error('Could not load suppliers:', error));
  }, []);

  /* ===== FILTER PRODUCTS ===== */
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productsFromDatabase;
    return productsFromDatabase.filter((p) =>
      [p.id, p.name, p.category, p.brand, p.model, p.unitMeasure, p.supplierName, p.supplierContact]
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
    setFormData({ ...emptyForm, suppliers: [{ ...emptySupplier }] });
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setModalMode('edit');
    setFormData({
      ...emptyForm,
      ...product,
      suppliers: product.supplierName
        ? [{ name: product.supplierName, contact: product.supplierContact || '' }]
        : [{ ...emptySupplier }],
    });
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

  /* ===== PRODUCT PHOTO (pick a file -> data URL, client-side) ===== */
  const handleImageFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('That image is larger than 2 MB. Please pick a smaller one.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({ ...prev, image: reader.result })); /* base64 data URL */
    };
    reader.readAsDataURL(file);
    e.target.value = ''; /* allow re-picking the same file */
  };

  const clearImage = () => setFormData((prev) => ({ ...prev, image: '' }));

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /* ===== SUPPLIER LIST (inline editable rows) ===== */
  const updateSupplier = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const removeSupplier = (index) => {
    setFormData((prev) => {
      const next = prev.suppliers.filter((_, i) => i !== index);
      /* Always keep one editable row so there is somewhere to type. */
      return { ...prev, suppliers: next.length ? next : [{ ...emptySupplier }] };
    });
  };

  /* ===== SAVE PRODUCT ===== */
  const handleSave = async (e) => {
    e.preventDefault();

    /* Keep only rows that actually name a supplier; first = primary. */
    const allSuppliers = formData.suppliers.filter((s) => s.name.trim());
    const primary = allSuppliers[0] || null;

    const payload = {
      name: formData.name,
      category: formData.category,
      brand: formData.brand,
      model: formData.model,
      unitMeasure: formData.unitMeasure,
      supplierName: primary ? primary.name.trim() : null,
      supplierContact: primary ? (primary.contact || '').trim() || null : null,
      image: formData.image || null, /* backend ignores until an image column exists */
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

      /* Keep the newly selected image for this session; the API doesn't persist it yet. */
      setProductsFromDatabase((prev) => {
        const updated =
          isAdd
            ? [...prev, { ...saved, image: formData.image }]
            : prev.map((p) => (p.id === saved.id ? { ...saved, image: formData.image } : p));
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });

      /* Keep the picker in sync: if this save introduced a new supplier name,
         add it to the dropdown list so it's reusable right away. */
      if (saved.supplierName && !suppliers.some((s) => s.name === saved.supplierName)) {
        setSuppliers((prev) => [
          ...prev,
          { id: `tmp-${Date.now()}`, name: saved.supplierName, contact: saved.supplierContact || '' },
        ]);
      }
      closeModal();

      try {
        const refreshResponse = await fetch('/api/products', { headers: { Accept: 'application/json' } });
        if (!refreshResponse.ok) throw new Error(`Refresh failed (${refreshResponse.status})`);
        const refreshedProducts = await refreshResponse.json();
        setProductsFromDatabase(refreshedProducts);
      } catch (refreshError) {
        console.error('Product was saved, but the product list could not be refreshed:', refreshError);
        alert('Product saved successfully, but the list could not refresh. Reload the page to see the latest database data.');
      }
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
    const headers = ['Product ID', 'Product Name', 'Category', 'Brand', 'Model', 'Unit Measure', 'Supplier', 'Supplier Contact'];
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...filteredProducts.map((p) =>
        [p.id, p.name, p.category, p.brand, p.model, p.unitMeasure, p.supplierName, p.supplierContact].map(escape).join(',')
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
              <th className="ps-th-pic">Picture</th>
              <th className="ps-th-left">Product Name</th>
              <th>Category</th>
              <th>Brand</th>
              <th>Model</th>
              <th>Unit Measure</th>
              <th className="ps-th-left">Supplier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product, idx) => (
              <tr
                className={`ps-row-clickable ${selectedIds.has(product.id) ? 'is-selected' : ''}`}
                key={product.id}
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
                <td className="ps-td-pic" data-label="Picture">
                  {product.image ? (
                    <img className="ps-thumb" src={product.image} alt="" loading="lazy" />
                  ) : (
                    <span className="ps-thumb ps-thumb-empty" aria-hidden="true"><Package size={13} /></span>
                  )}
                </td>
                <td className="ps-td-left ps-cell-name" data-label="Product Name" title={product.name}>
                  <span className="ps-name-cell">
                    <span className="ps-name-text">{product.name}</span>
                  </span>
                </td>
                <td data-label="Category">{product.category || '—'}</td>
                <td data-label="Brand">{product.brand || '—'}</td>
                <td data-label="Model">{product.model || '—'}</td>
                <td data-label="Unit Measure">{product.unitMeasure || '—'}</td>
                <td className="ps-td-left ps-td-muted" data-label="Supplier" title={product.supplierName}>
                  {product.supplierName ? (
                    <span className="ps-supplier-cell">
                      <span className="ps-supplier-name">{product.supplierName}</span>
                      {product.supplierContact && (
                        <span className="ps-supplier-contact">{product.supplierContact}</span>
                      )}
                    </span>
                  ) : '—'}
                </td>
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
                <td colSpan={10} className="ps-empty-state">
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

              {detailProduct.image ? (
                <div className="ps-detail-photo">
                  <img src={detailProduct.image} alt={detailProduct.name || 'Product photo'} />
                </div>
              ) : (
                <div className="ps-detail-photo ps-detail-photo-empty">
                  <Package size={26} />
                  <span>No photo on file</span>
                </div>
              )}

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

                  <div className="ps-form-group ps-form-group-wide">
                    <label htmlFor="image">Product Photo</label>
                    <div className="ps-photo-field">
                      <label className={`ps-photo-box${formData.image ? ' has-image' : ''}`}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFile}
                          aria-label="Choose product photo"
                          hidden
                        />
                        {formData.image ? (
                          <>
                            <img src={formData.image} alt="Preview" />
                            <span className="ps-photo-overlay">
                              <Upload size={14} /> Change
                            </span>
                            <button
                              type="button"
                              className="ps-photo-remove"
                              onClick={(e) => { e.preventDefault(); clearImage(); }}
                              aria-label="Remove photo"
                              title="Remove photo"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <span className="ps-photo-placeholder">
                            <ImageIcon size={22} />
                            <span className="ps-photo-placeholder-main">Choose image</span>
                            <span className="ps-photo-placeholder-sub">PNG or JPG, up to 2 MB</span>
                          </span>
                        )}
                      </label>

                      <div className="ps-photo-input">
                        <input
                          id="image"
                          name="image"
                          value={formData.image.startsWith('data:') ? '' : formData.image}
                          onChange={handleFormChange}
                          placeholder="…or paste an image URL"
                        />
                        <p className="ps-field-note">
                          Click the box to upload, or paste a URL. Mock for now — the photo shows this
                          session but isn't stored until the backend image field lands.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="ps-form-section">
                  <h4 className="ps-form-section-title">Supplier</h4>

                  <div className="ps-form-group ps-form-group-wide">
                    <label>Supplier</label>

                    <div className="ps-supplier-list">
                      {formData.suppliers.map((s, i) => (
                        <div className="ps-supplier-item" key={i}>
                          <input
                            list="ps-supplier-list"
                            autoComplete="off"
                            value={s.name}
                            onChange={(e) => updateSupplier(i, 'name', e.target.value)}
                            placeholder="Supplier name"
                            aria-label={`Supplier ${i + 1} name`}
                          />
                          <input
                            autoComplete="off"
                            value={s.contact}
                            onChange={(e) => updateSupplier(i, 'contact', e.target.value)}
                            placeholder="Contact — phone or email"
                            aria-label={`Supplier ${i + 1} contact`}
                          />
                          <button
                            type="button"
                            className="ps-supplier-remove"
                            onClick={() => removeSupplier(i)}
                            aria-label={`Clear supplier ${i + 1}`}
                            title="Clear supplier"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <datalist id="ps-supplier-list">
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                    <p className="ps-field-note">
                      Edit the supplier directly, or start typing to reuse a saved one. This supplier
                      is used by Stock Movement and the Auto Calculator when a reorder is raised.
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