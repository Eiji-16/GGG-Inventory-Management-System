import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Edit, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import apiFetch from '../../apiFetch';

const EMPTY_SUPPLIER = { id: null, name: '', contact: '', leadTimeDays: '' };

/* ===== SUPPLIER RECORDS (Figure 7) =====
   Supplier, contact, products supplied (from the products linked to it) and
   lead time in days. Lead time also feeds the reorder point when a product has
   no lead time of its own in the safety stock policy. */
export default function SupplierRecords({ onSuppliersChange }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/suppliers', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load suppliers (${response.status}).`);
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setSuppliers(list);
        // Drop selections for suppliers that no longer exist.
        setSelectedIds((prev) => new Set(list.filter((s) => prev.has(s.id)).map((s) => s.id)));
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load suppliers.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const visible = suppliers.filter((supplier) => {
    const q = query.trim().toLowerCase();
    return !q || [supplier.name, supplier.contact, ...(supplier.products || []).map((p) => p.name)]
      .some((value) => String(value || '').toLowerCase().includes(q));
  });

  /* ----- Checklist selection ----- */
  const allSelected = visible.length > 0 && visible.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visible.forEach((s) => next.delete(s.id));
      else visible.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ----- Delete (single or bulk) ----- */
  const requestDeleteSingle = (supplier) => {
    setDeleteError('');
    setConfirmTarget({ type: 'single', ids: [supplier.id], name: supplier.name });
  };

  const requestDeleteBulk = () => {
    if (selectedIds.size === 0) return;
    setDeleteError('');
    setConfirmTarget({ type: 'bulk', ids: Array.from(selectedIds) });
  };

  const linkedProductCount = (ids) => suppliers
    .filter((s) => ids.includes(s.id))
    .reduce((sum, s) => sum + (s.products?.length || 0), 0);

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    setDeleteError('');
    const results = await Promise.allSettled(confirmTarget.ids.map(async (id) => {
      const response = await apiFetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      return id;
    }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setDeleting(false);
    setReloadKey((key) => key + 1);
    onSuppliersChange?.();
    if (failed > 0) {
      setDeleteError(`${failed} of ${confirmTarget.ids.length} supplier${confirmTarget.ids.length !== 1 ? 's' : ''} could not be deleted. Please try again.`);
      return;
    }
    setConfirmTarget(null);
  };

  const openForm = (supplier = null) => {
    setDraft(supplier
      ? { id: supplier.id, name: supplier.name || '', contact: supplier.contact || '', leadTimeDays: supplier.leadTimeDays ?? '' }
      : { ...EMPTY_SUPPLIER });
    setFormError('');
  };

  const save = async (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    const leadText = String(draft.leadTimeDays).trim();
    const leadTimeDays = leadText === '' ? null : Number(leadText);
    if (!name) return setFormError('Enter the supplier name.');
    if (leadTimeDays !== null && (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365)) {
      return setFormError('Lead time must be a whole number of days from 0 to 365.');
    }

    setSaving(true);
    setFormError('');
    try {
      const response = await apiFetch(draft.id ? `/api/suppliers/${draft.id}` : '/api/suppliers', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact: draft.contact.trim() || null, leadTimeDays }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(message || `Could not save the supplier (${response.status}).`);
      }
      setDraft(null);
      setReloadKey((key) => key + 1);
      onSuppliersChange?.();
    } catch (saveError) {
      setFormError(saveError.message || 'Could not save the supplier.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ps-table-parent">
      <div className="ps-navigation-bar">
        <div className="ps-search-wrapper">
          <div className="ps-search-box">
            <Search size={13} className="ps-search-icon" />
            <input
              type="search"
              placeholder="Search suppliers or products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search suppliers"
            />
          </div>
        </div>
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
        <button className="ps-add-btn" type="button" onClick={() => openForm()} title="Add Supplier">
          <p>Add Supplier</p>
          <Plus size={12} className="ps-add-icon" />
        </button>
      </div>

      {error && <p className="ps-export-error" role="alert">{error}</p>}

      <div className="ps-table-scroll">
        <table className="ps-table ps-supplier-table">
          <thead>
            <tr>
              <th className="ps-th-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={loading || visible.length === 0}
                  aria-label="Select all suppliers"
                />
              </th>
              <th className="ps-th-left">Supplier</th>
              <th className="ps-th-left">Contact</th>
              <th className="ps-th-left">Products Supplied</th>
              <th>Lead Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="ps-empty-state">Loading suppliers…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="ps-empty-state">
                  {suppliers.length === 0 ? 'No suppliers yet. Click “Add Supplier” to register one.' : 'No suppliers match your search.'}
                </td>
              </tr>
            ) : visible.map((supplier) => {
              const supplied = supplier.products || [];
              return (
                <tr key={supplier.id} className={selectedIds.has(supplier.id) ? 'is-selected' : ''}>
                  <td className="ps-td-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(supplier.id)}
                      onChange={() => toggleSelectRow(supplier.id)}
                      aria-label={`Select ${supplier.name}`}
                    />
                  </td>
                  <td className="ps-td-left" data-label="Supplier"><strong>{supplier.name}</strong></td>
                  <td className="ps-td-left ps-td-muted" data-label="Contact">{supplier.contact || '—'}</td>
                  <td className="ps-td-left" data-label="Products Supplied" title={supplied.map((p) => p.name).join(', ')}>
                    {supplied.length ? (
                      <span className="ps-variant-list">
                        {supplied.slice(0, 3).map((product) => (
                          <span className="ps-variant-chip" key={product.id}>{product.name}</span>
                        ))}
                        {supplied.length > 3 && <span className="ps-variant-chip ps-variant-more">+{supplied.length - 3}</span>}
                      </span>
                    ) : <span className="ps-td-muted">No products linked</span>}
                  </td>
                  <td data-label="Lead Time">{supplier.leadTimeDays != null ? `${supplier.leadTimeDays} days` : '—'}</td>
                  <td className="ps-td-actions" data-label="Actions">
                    <div className="ps-action-cell-container">
                      <button className="ps-table-action-btn ps-edit-btn" type="button" onClick={() => openForm(supplier)} aria-label={`Edit ${supplier.name}`} title="Edit Supplier">
                        <Edit size={16} />
                      </button>
                      <button className="ps-table-action-btn ps-delete-btn" type="button" onClick={() => requestDeleteSingle(supplier)} aria-label={`Delete ${supplier.name}`} title="Delete Supplier">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {draft && createPortal(
        <div className="ps-modal-overlay" onClick={() => !saving && setDraft(null)}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ps-supplier-title">
            <div className="ps-modal-header">
              <div className="ps-modal-heading">
                <span className="ps-modal-icon" aria-hidden="true"><Truck size={18} /></span>
                <div className="ps-modal-titles">
                  <h3 id="ps-supplier-title">{draft.id ? 'Edit Supplier' : 'Add Supplier'}</h3>
                  <p className="ps-modal-subtitle">Contact details and how many days a delivery usually takes.</p>
                </div>
              </div>
              <button className="ps-modal-close-btn" onClick={() => setDraft(null)} type="button" aria-label="Close" disabled={saving}>
                <X size={16} />
              </button>
            </div>
            <form className="ps-modal-form" onSubmit={save}>
              <div className="ps-modal-body">
                <section className="ps-form-section">
                  <div className="ps-form-group ps-form-group-wide">
                    <label htmlFor="supplier-name">Supplier Name <span className="ps-required">*</span></label>
                    <input id="supplier-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Sunshine Garments" required />
                  </div>
                  <div className="ps-form-row">
                    <div className="ps-form-group">
                      <label htmlFor="supplier-contact">Contact</label>
                      <input id="supplier-contact" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} placeholder="Phone or email" />
                    </div>
                    <div className="ps-form-group">
                      <label htmlFor="supplier-lead">Lead Time (days)</label>
                      <input id="supplier-lead" type="number" min="0" max="365" step="1" value={draft.leadTimeDays} onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value })} placeholder="e.g. 3" />
                    </div>
                  </div>
                  {formError && <p className="ps-export-error" role="alert">{formError}</p>}
                </section>
              </div>
              <div className="ps-modal-actions">
                <button type="button" className="ps-modal-cancel-btn" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
                <button type="submit" className="ps-modal-save-btn" disabled={saving}>
                  {saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== DELETE CHECK ===== */}
      {confirmTarget && createPortal(
        <div className="ps-modal-overlay" onClick={() => !deleting && setConfirmTarget(null)}>
          <div
            className="ps-modal ps-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ps-supplier-confirm-title"
          >
            <div className="ps-confirm-body">
              <span className="ps-confirm-icon" aria-hidden="true">
                <AlertTriangle size={22} />
              </span>
              <h3 id="ps-supplier-confirm-title" className="ps-confirm-title">
                {confirmTarget.type === 'single'
                  ? 'Delete this supplier?'
                  : `Delete ${confirmTarget.ids.length} supplier${confirmTarget.ids.length !== 1 ? 's' : ''}?`}
              </h3>
              <p className="ps-confirm-text">
                {confirmTarget.type === 'single'
                  ? <>You’re about to delete <strong>{confirmTarget.name}</strong>. </>
                  : <>You’re about to delete the selected suppliers. </>}
                {linkedProductCount(confirmTarget.ids) > 0 && (
                  <>{linkedProductCount(confirmTarget.ids)} linked product{linkedProductCount(confirmTarget.ids) !== 1 ? 's' : ''} will be kept but will no longer have a supplier. </>
                )}
                This can’t be undone.
              </p>
              {deleteError && <p className="ps-export-error" role="alert">{deleteError}</p>}
            </div>
            <div className="ps-modal-actions">
              <button type="button" className="ps-modal-cancel-btn" onClick={() => setConfirmTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="ps-confirm-delete-btn" onClick={confirmDelete} disabled={deleting}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
