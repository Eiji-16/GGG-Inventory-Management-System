import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  X,
  Edit,
  Trash2,
  AlertTriangle,
  Calculator,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Activity,
  PlusCircle,
  Pencil,
  Clock,
  ClipboardList } from 'lucide-react';

import './stockControl.css';
import {
  SAFETY_STOCK_DEFAULTS,
  safetyPointFor,
  stockStatusFor,
  annualDemandFor,
  STATUS_LABEL,
} from '../../data/safetyStock'; /* Safety Stock Policy */

/*--------------------------------------------------Sample data's--------------------------------------------------*/
/* emptyForm — blank shape for the Add/Edit Stock Entry modal. One key per column.
   BACKEND: this object is the POST/PUT body sent to /api/stock-movements. */
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

/* signedQty — turns a movement into a +/- number so balances can be summed.
   Stock Out is negative; Stock In and Adjustment are positive. Used to compute remaining stock. */
const signedQty = (row) => {
  const qty = Number(row.qty) || 0;
  return row.type === 'Stock Out' ? -qty : qty;
};

/* MOVEMENT_TYPES — the three kinds of stock movement, used for the Type toggle in the modal.
   BACKEND: store the `value` string in the `stock_movements.type` column. */
const MOVEMENT_TYPES = [
  { value: 'Stock In', label: 'Stock In', tone: 'in' },
  { value: 'Stock Out', label: 'Stock Out', tone: 'out' },
  { value: 'Adjustment', label: 'Adjustment', tone: 'adj' },
];

function StockControl({ onNavigate, safetyStock = SAFETY_STOCK_DEFAULTS }) {
  const [stockFromDatabase, setStockFromDatabase] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [query, setQuery] = useState(''); /* live text typed in the search bar (client-side filter) */
  const [showActivity, setShowActivity] = useState(false); /* right-side transaction-history drawer */
  /* activityLog — running audit trail of every change (add / edit / delete / bulk delete).
     Front-end only for now; a backend would persist this to an `activity_logs` table. */
  const [activityLog, setActivityLog] = useState([]);

  /* Append one entry to the audit trail (newest first). */
  const logActivity = (action, product, detail) => {
    setActivityLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        action,          // 'add' | 'edit' | 'delete' | 'bulk-delete'
        product,
        detail,
        time: new Date(),
      },
      ...prev,
    ]);
  };

  useEffect(() => {
    fetch('/stockControl.json')
      .then((response) => response.json())
      .then((data) => setStockFromDatabase(data))
      .catch((error) => console.error("Error reading your file:", error));
  }, []);

  /* Product Ledgers */
  const ledgers = useMemo(() => {
    const grouped = new Map();
    stockFromDatabase.forEach((row, index) => {
      const key = row.productName || '—';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ ...row, index });
    });

    const result = new Map();
    grouped.forEach((rows, key) => {
      const ordered = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
      let balance = 0;
      let totalIn = 0;
      let totalOut = 0;

      const movements = ordered.map((row) => {
        const delta = signedQty(row);
        balance += delta;
        if (delta >= 0) totalIn += delta;
        else totalOut += -delta;
        return { ...row, delta, balance };
      });

      result.set(key, { movements, totalIn, totalOut, net: totalIn - totalOut, closing: balance });
    });

    return result;
  }, [stockFromDatabase]);

  const openHistory = (productName) => setHistoryProduct(productName || '—');
  const activeLedger = historyProduct ? ledgers.get(historyProduct) : null;

  /* Projected Remaining Stock */
  const projectedRemaining = useMemo(() => {
    if (!formData.productName || !formData.type || formData.qty === '') return null;
    const base = stockFromDatabase.reduce((sum, row, i) => (
      i === editIndex || row.productName !== formData.productName ? sum : sum + signedQty(row)
    ), 0);
    return base + signedQty(formData);
  }, [stockFromDatabase, formData, editIndex]);

  /* Projected Safety Status */
  const projectedStatus = projectedRemaining === null
    ? null
    : stockStatusFor({ ...formData, remainingStock: projectedRemaining }, safetyStock);

  /* Send To Auto Calculator */
  const computeEoqFor = (row) => {
    if (!onNavigate) return;
    onNavigate('Auto-Calculator', {
      product: row.productName,
      annualDemand: annualDemandFor(row.productName, safetyStock),
    });
  };

  /* Visible rows — filtered by the search box but each item keeps its ORIGINAL
     index so selection, edit and delete still line up with stockFromDatabase. */
  const visibleRows = useMemo(() => {
    const withIndex = stockFromDatabase.map((row, index) => ({ row, index }));
    const q = query.trim().toLowerCase();
    if (!q) return withIndex;
    return withIndex.filter(({ row }) =>
      [row.productName, row.category, row.type, row.notes, row.recordedBy, row.date]
        .some((field) => String(field || '').toLowerCase().includes(q))
    );
  }, [stockFromDatabase, query]);

  /* Export the currently visible rows to a CSV file (front-end only, no backend). */
  const exportCsv = () => {
    if (visibleRows.length === 0) return;
    const headers = ['Date', 'Product Name', 'Category', 'Type', 'Qty', 'Remaining Stock', 'Notes', 'Recorded By'];
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...visibleRows.map(({ row }) =>
        [row.date, row.productName, row.category, row.type, row.qty, row.remainingStock, row.notes, row.recordedBy]
          .map(escape).join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const allSelected =
    visibleRows.length > 0 &&
    visibleRows.every(({ index }) => selectedIds.has(index));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleRows.forEach(({ index }) => next.delete(index));
      } else {
        visibleRows.forEach(({ index }) => next.add(index));
      }
      return next;
    });
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
    setEditIndex(null);
    setIsModalOpen(true);
  };

  const openEditModal = (index) => {
    setFormData({ ...emptyForm, ...stockFromDatabase[index] });
    setEditIndex(index);
    setIsModalOpen(true);
  };

  const handleDelete = (index) => {
    const removed = stockFromDatabase[index];
    if (removed) {
      logActivity('delete', removed.productName, `Removed ${removed.type || 'entry'} of ${removed.qty || 0} unit(s) dated ${removed.date || '—'}`);
    }
    setStockFromDatabase((prev) => prev.filter((_, i) => i !== index));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditIndex(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    const entry = {
      ...formData,
      remainingStock: projectedRemaining === null ? formData.remainingStock : projectedRemaining,
    };
    if (editIndex === null) {
      logActivity('add', entry.productName, `${entry.type || 'Movement'} of ${entry.qty || 0} unit(s) → remaining ${entry.remainingStock}`);
    } else {
      logActivity('edit', entry.productName, `Updated ${entry.type || 'entry'} — qty ${entry.qty || 0}, remaining ${entry.remainingStock}`);
    }
    setStockFromDatabase((prev) =>
      editIndex === null
        ? [...prev, entry]
        : prev.map((row, i) => (i === editIndex ? entry : row))
    );
    closeModal();
  };
/*--------------------------------------------------Sample data's End--------------------------------------------------*/
  return (
    <div className="sc-table-parent">

      {/* Search bar */}
      <div className="sc-navigation-bar">
        <div className="sc-search-wrapper">
          <div className="sc-search-box">
            <Search size={13} className="sc-search-icon" />
            <input
              type="search"
              placeholder="Search movements…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search stock movements"
            />
          </div>
        </div>
        <button
          className="sc-add-btn"
          onClick={exportCsv}
          type="button"
          disabled={visibleRows.length === 0}
          title="Export the current view to CSV"
        >
          <p>Export</p>
          <Download size={12} />
        </button>
        {selectedIds.size > 0 && (
          <button
            className="sc-add-btn sc-delete-selected-btn"
            onClick={() => {
              const indices = Array.from(selectedIds).sort((a, b) => b - a);
              indices.forEach(i => handleDelete(i));
              setSelectedIds(new Set());
            }}
            type="button"
            title={`Delete ${selectedIds.size} selected`}
          >
            <p>Delete ({selectedIds.size})</p>
            <Trash2 size={12} />
          </button>
        )}
        <button className="sc-add-btn sc-add-btn-primary" onClick={openAddModal} type="button">
          <p>Add Item</p>
          <Plus size={12} className="sc-add-icon" />
        </button>
        <button
          className="sc-add-btn"
          onClick={() => setShowActivity(true)}
          type="button"
          title="View transaction & activity history"
        >
          <p>Activity</p>
          <Activity size={12} />
        </button>
      </div>

      {/* Table */}
      <div className="sc-table-scroll">
        <table className="sc-table">
          <thead>
            <tr>
              <th className="sc-th-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
              <th>Date</th>
              <th className="sc-th-left">Product Name</th>
              <th>Category</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Remaining</th>
              <th>Safety Stock</th>
              <th className="sc-th-left">Notes</th>
              <th>Recorded by</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row: stock, index }) => {
              const status = stockStatusFor(stock, safetyStock);
              const point = safetyPointFor(stock, safetyStock);
              return (
                <tr
                  className={`${status ? `sc-row-${status}` : ''} ${selectedIds.has(index) ? 'is-selected' : ''}`}
                  key={index}
                >
                  <td className="sc-td-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(index)}
                      onChange={() => toggleSelectRow(index)}
                      aria-label={`Select entry ${index}`}
                    />
                  </td>
                  <td className="sc-td-nowrap">{stock.date}</td>
                  <td className="sc-td-left" title={stock.productName}>
                    <button
                      type="button"
                      className="sc-product-link"
                      onClick={() => openHistory(stock.productName)}
                      title={`View movement history for ${stock.productName}`}
                    >
                      {stock.productName}
                    </button>
                  </td>
                  <td>{stock.category || '—'}</td>
                  <td>
                    <span className={`sc-type-pill sc-type-${(stock.type || '').replace(/\s+/g, '').toLowerCase()}`}>
                      {stock.type || '—'}
                    </span>
                  </td>
                  <td className="sc-td-nowrap">{stock.qty}</td>
                  <td className="sc-td-nowrap sc-td-strong">{stock.remainingStock}</td>
                  <td>
                    {status ? (
                      <span
                        className={`sc-safety-badge sc-safety-${status}`}
                        title={`${stock.remainingStock} on hand · safety stock ${point} (set by Super Admin)`}
                      >
                        {status !== 'healthy' && <AlertTriangle size={10} />}
                        {STATUS_LABEL[status]}
                        <small>≤{point}</small>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="sc-td-left sc-td-muted" title={stock.notes}>{stock.notes || '—'}</td>
                  <td>{stock.recordedBy || '—'}</td>
                  <td>
                    <div className="sc-action-cell-container">
                      {status && status !== 'healthy' && (
                        <button
                          className="sc-table-action-btn sc-eoq-btn"
                          onClick={() => computeEoqFor(stock)}
                          aria-label={`Compute EOQ for ${stock.productName}`}
                          title={`Reorder needed — compute EOQ for ${stock.productName}`}
                          type="button"
                        >
                          <Calculator size={14} />
                        </button>
                      )}
                      <button
                        className="sc-table-action-btn sc-history-btn"
                        onClick={() => openHistory(stock.productName)}
                        aria-label="View movement history"
                        title="View movement history"
                        type="button"
                      >
                        <History size={14} />
                      </button>
                      <button
                        className="sc-table-action-btn sc-edit-btn"
                        onClick={() => openEditModal(index)}
                        aria-label="Edit Item"
                        title="Edit Item"
                        type="button"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="sc-table-action-btn sc-delete-btn"
                        onClick={() => handleDelete(index)}
                        aria-label="Delete Item"
                        title="Delete Item"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={11} className="sc-empty-state">
                  {stockFromDatabase.length === 0
                    ? 'No stock movements recorded yet. Click “Add Item” to record one.'
                    : 'No movements match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Item Modal */}
      {isModalOpen && createPortal(
        <div className="sc-modal-overlay" onClick={closeModal}>
          <div
            className="sc-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-modal-title"
          >
            <div className="sc-modal-header">
              <div className="sc-modal-heading">
                <span className="sc-modal-icon" aria-hidden="true">
                  <ClipboardList size={18} />
                </span>
                <div className="sc-modal-titles">
                  <h3 id="sc-modal-title">{editIndex === null ? 'Add Stock Entry' : 'Edit Stock Entry'}</h3>
                  <p className="sc-modal-subtitle">
                    Every movement recalculates remaining stock and can trigger a reorder alert.
                  </p>
                </div>
              </div>
              <button className="sc-modal-close-btn" onClick={closeModal} type="button" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <form className="sc-modal-form" onSubmit={handleSave}>
              <div className="sc-modal-body">
                <section className="sc-form-section">
                  <h4 className="sc-form-section-title">Movement</h4>

                  <div className="sc-form-group sc-form-group-wide">
                    <span className="sc-form-label" id="sc-type-label">
                      Type <span className="sc-required">*</span>
                    </span>
                    <div className="sc-segmented" role="group" aria-labelledby="sc-type-label">
                      {MOVEMENT_TYPES.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`sc-segment sc-segment-${option.tone}${
                            formData.type === option.value ? ' sc-segment-active' : ''
                          }`}
                          onClick={() => setFormData((prev) => ({ ...prev, type: option.value }))}
                          aria-pressed={formData.type === option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sc-form-row">
                    <div className="sc-form-group">
                      <label htmlFor="date">
                        Date <span className="sc-required">*</span>
                      </label>
                      <input id="date" name="date" type="date" value={formData.date} onChange={handleFormChange} required />
                    </div>
                    <div className="sc-form-group">
                      <label htmlFor="recordedBy">Recorded by</label>
                      <input
                        id="recordedBy"
                        name="recordedBy"
                        value={formData.recordedBy}
                        onChange={handleFormChange}
                        placeholder="Super Admin"
                      />
                    </div>
                  </div>
                </section>

                <section className="sc-form-section">
                  <h4 className="sc-form-section-title">Item</h4>

                  <div className="sc-form-group sc-form-group-wide">
                    <label htmlFor="productName">
                      Product Name <span className="sc-required">*</span>
                    </label>
                    <input
                      id="productName"
                      name="productName"
                      value={formData.productName}
                      onChange={handleFormChange}
                      placeholder="e.g. Precision Steel Chronograph"
                      required
                    />
                  </div>

                  <div className="sc-form-row">
                    <div className="sc-form-group">
                      <label htmlFor="category">Category</label>
                      <input
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleFormChange}
                        placeholder="e.g. Timepieces"
                      />
                    </div>
                    <div className="sc-form-group">
                      <label htmlFor="qty">
                        Qty <span className="sc-required">*</span>
                      </label>
                      <input id="qty" name="qty" type="number" min="0" value={formData.qty} onChange={handleFormChange} required />
                    </div>
                  </div>
                </section>

                <section className="sc-form-section">
                  <h4 className="sc-form-section-title">Result</h4>

                  {/* Computed remaining stock */}
                  <div className="sc-computed-field" aria-live="polite">
                    <div className="sc-computed-copy">
                      <span className="sc-computed-label">Remaining Stock</span>
                      {projectedRemaining === null ? (
                        <span className="sc-computed-empty">Pick a product, type and qty to compute</span>
                      ) : (
                        <span className="sc-computed-note">
                          Computed from this product’s previous movements
                        </span>
                      )}
                    </div>
                    {projectedRemaining !== null && (
                      <span className="sc-computed-value">
                        {projectedRemaining}
                        <small>units</small>
                      </span>
                    )}
                  </div>

                  {projectedStatus && (
                    <div className="sc-status-preview" aria-live="polite">
                      <span className={`sc-safety-badge sc-safety-${projectedStatus}`}>
                        {projectedStatus !== 'healthy' && <AlertTriangle size={10} />}
                        {STATUS_LABEL[projectedStatus]}
                        <small>≤{safetyPointFor(formData, safetyStock)}</small>
                      </span>
                      <span className="sc-status-preview-note">
                        {projectedStatus === 'healthy'
                          ? 'This entry keeps the item above its safety stock.'
                          : 'This entry puts the item at or below its safety stock — the row will be flagged and a Compute EOQ shortcut appears.'}
                      </span>
                    </div>
                  )}

                  <div className="sc-form-group sc-form-group-wide">
                    <label htmlFor="notes">Notes</label>
                    <input
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleFormChange}
                      placeholder="Delivery reference, sales batch, reason for adjustment…"
                    />
                  </div>
                </section>
              </div>

              <div className="sc-modal-actions">
                <button type="button" className="sc-modal-cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="sc-modal-save-btn" disabled={!formData.type}>
                  {editIndex === null ? 'Add Entry' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Movement history panel */}
      {historyProduct && createPortal(
        <div className="sc-modal-overlay" onClick={() => setHistoryProduct(null)}>
          <div className="sc-history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sc-modal-header">
              <div>
                <h3>Movement History</h3>
                <p className="sc-history-product">{historyProduct}</p>
              </div>
              <button
                className="sc-modal-close-btn"
                onClick={() => setHistoryProduct(null)}
                type="button"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sc-history-summary">
              <div className="sc-history-stat">
                <span className="sc-history-stat-label">Total In</span>
                <span className="sc-history-stat-value sc-in">+{activeLedger?.totalIn ?? 0}</span>
              </div>
              <div className="sc-history-stat">
                <span className="sc-history-stat-label">Total Out</span>
                <span className="sc-history-stat-value sc-out">−{activeLedger?.totalOut ?? 0}</span>
              </div>
              <div className="sc-history-stat">
                <span className="sc-history-stat-label">Net Change</span>
                <span className="sc-history-stat-value">
                  {(activeLedger?.net ?? 0) >= 0 ? '+' : '−'}{Math.abs(activeLedger?.net ?? 0)}
                </span>
              </div>
              <div className="sc-history-stat">
                <span className="sc-history-stat-label">On Hand</span>
                <span className="sc-history-stat-value sc-history-closing">
                  {activeLedger?.closing ?? 0}
                </span>
              </div>
            </div>

            <div className="sc-history-body">
              {activeLedger && activeLedger.movements.length > 0 ? (
                <ol className="sc-history-list">
                  {activeLedger.movements.map((move, i) => (
                    <li className="sc-history-item" key={`${move.index}-${i}`}>
                      <span className={`sc-history-dir ${move.delta >= 0 ? 'sc-in' : 'sc-out'}`}>
                        {move.delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      </span>

                      <div className="sc-history-main">
                        <div className="sc-history-top">
                          <span className="sc-history-type">{move.type || 'Movement'}</span>
                          <span className="sc-history-date">{move.date || '—'}</span>
                        </div>
                        <div className="sc-history-meta">
                          {move.recordedBy ? `Recorded by ${move.recordedBy}` : 'Recorded by —'}
                          {move.notes ? ` · ${move.notes}` : ''}
                        </div>
                      </div>

                      <div className="sc-history-numbers">
                        <span className={`sc-history-delta ${move.delta >= 0 ? 'sc-in' : 'sc-out'}`}>
                          {move.delta >= 0 ? '+' : '−'}{Math.abs(move.delta)}
                        </span>
                        <span className="sc-history-balance">balance {move.balance}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="sc-empty-state">NO MOVEMENTS RECORDED FOR THIS ITEM YET.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Transaction & activity history drawer (right side, 30–40% of screen) */}
      {showActivity && createPortal(
        <div className="sc-drawer-overlay" onClick={() => setShowActivity(false)}>
          <aside
            className="sc-activity-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-activity-title"
          >
            <div className="sc-drawer-header">
              <div className="sc-drawer-heading">
                <span className="sc-modal-icon" aria-hidden="true"><Activity size={18} /></span>
                <div className="sc-modal-titles">
                  <h3 id="sc-activity-title">Transaction History</h3>
                  <p className="sc-modal-subtitle">
                    Every change to inventory — adds, edits and deletions.
                  </p>
                </div>
              </div>
              <button
                className="sc-modal-close-btn"
                onClick={() => setShowActivity(false)}
                type="button"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sc-drawer-body">
              {activityLog.length === 0 ? (
                <div className="sc-empty-state">
                  No activity yet. Adding, editing or deleting an entry will show up here.
                </div>
              ) : (
                <ol className="sc-activity-list">
                  {activityLog.map((item) => {
                    const meta = {
                      add:            { Icon: PlusCircle, cls: 'sc-act-add',    label: 'Added' },
                      edit:           { Icon: Pencil,     cls: 'sc-act-edit',   label: 'Updated' },
                      delete:         { Icon: Trash2,     cls: 'sc-act-delete', label: 'Deleted' },
                    }[item.action] || { Icon: Activity, cls: '', label: item.action };
                    const { Icon } = meta;
                    return (
                      <li className="sc-activity-item" key={item.id}>
                        <span className={`sc-activity-dot ${meta.cls}`}>
                          <Icon size={14} />
                        </span>
                        <div className="sc-activity-main">
                          <div className="sc-activity-top">
                            <span className="sc-activity-action">{meta.label}</span>
                            <span className="sc-activity-product">{item.product || '—'}</span>
                          </div>
                          <div className="sc-activity-detail">{item.detail}</div>
                          <div className="sc-activity-time">
                            <Clock size={10} />
                            {item.time.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {activityLog.length > 0 && (
              <div className="sc-drawer-footer">
                <span className="sc-drawer-count">{activityLog.length} record{activityLog.length !== 1 ? 's' : ''}</span>
                <button className="sc-add-btn sc-delete-selected-btn" type="button" onClick={() => setActivityLog([])}>
                  <p>Clear</p>
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}

export default StockControl;