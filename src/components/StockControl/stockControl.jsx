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
  ArrowRight,
  Download,
  Activity,
  Info,
  PlusCircle,
  Pencil,
  Clock,
  ClipboardList,
  Package } from 'lucide-react';

import './stockControl.css';
import {
  SAFETY_STOCK_DEFAULTS,
  safetyPointFor,
  stockStatusFor,
  annualDemandFor,
  maximumInventoryFor,
  STATUS_LABEL,
} from '../../data/safetyStock'; /* ===== SAFETY STOCK ===== */

/* ===== EMPTY FORM ===== */
const emptyForm = {
  date: '',
  productId: '',
  productName: '',
  variantName: '',
  category: '',
  type: 'Stock In',
  qty: '',
  notes: '',
  recordedBy: '',
};

/* ===== DISPLAY LABEL ===== */
/* Backend stores in / out / adjustment; staff see plain language.
   Stock In -> "Added", Stock Out -> "Sold", Adjustment -> "Correction". */
const movementLabel = (type) => {
  if (type === 'Adjustment') return 'Correction';
  if (type === 'Stock Out') return 'Sold';
  if (type === 'Stock In') return 'Added';
  return type;
};

/* ===== TODAY (local date, not UTC) ===== */
const todayLocal = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

/* ===== SIGNED QTY ===== */
const signedQty = (row) => {
  if (row.type === 'Adjustment') return Number(row.variance) || 0;
  const qty = Number(row.qty) || 0;
  return row.type === 'Stock Out' ? -qty : qty;
};

function StockControl({ onNavigate, safetyStock = SAFETY_STOCK_DEFAULTS }) {
  const [stockFromDatabase, setStockFromDatabase] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [query, setQuery] = useState('');
  const [showActivity, setShowActivity] = useState(false);
  const [showReorderPlan, setShowReorderPlan] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [openingStock, setOpeningStock] = useState('');
  const [openingSaving, setOpeningSaving] = useState(false);

  const logActivity = (action, product, detail) => {
    setActivityLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        action,
        product,
        detail,
        time: new Date(),
      },
      ...prev,
    ]);
  };

  const refreshStockData = async () => {
    setStockError('');
    const [movementResponse, productResponse] = await Promise.all([
      fetch('/api/stock-movements', { headers: { Accept: 'application/json' } }),
      fetch('/api/products', { headers: { Accept: 'application/json' } }),
    ]);
    if (!movementResponse.ok) throw new Error(`Could not load stock movements (${movementResponse.status}).`);
    if (!productResponse.ok) throw new Error(`Could not load products (${productResponse.status}).`);
    const [movements, products] = await Promise.all([movementResponse.json(), productResponse.json()]);
    setStockFromDatabase(movements);
    setProductOptions(products);
  };

  useEffect(() => {
    refreshStockData()
      .catch((error) => setStockError(error.message || 'Could not load Stock Control data.'))
      .finally(() => setStockLoading(false));
  }, []);

  /* ===== PICK PRODUCT ===== */
  const handleProductSelect = (e) => {
    const productId = e.target.value;
    const picked = productOptions.find((p) => p.id === productId);
    setFormData((prev) => ({
      ...prev,
      productId,
      productName: picked?.name || '',
      category: picked ? (picked.category || '') : prev.category,
    }));
    // Seed the opening-stock editor with the product's current balance.
    setOpeningStock(picked ? String(picked.stock ?? 0) : '');
  };

  const productById = useMemo(() => new Map(productOptions.map((product) => [product.id, product])), [productOptions]);
  const reorderPlans = useMemo(() => productOptions.map((product) => {
    const policy = safetyStock?.[product.name] || {};
    const safetyStockValue = safetyPointFor({
      productName: product.name,
      safetyStock: product.safetyStock,
    }, safetyStock);
    const configuredDemand = Number(policy.annualDemand) > 0
      ? policy.annualDemand
      : product.annualDemand;
    const historicalDemand = Number(product.demandFromHistory) > 0 ? product.demandFromHistory : '';
    const annualDemandValue = Number(configuredDemand) > 0 ? configuredDemand : historicalDemand;
    const maximumInventory = maximumInventoryFor(
      annualDemandValue,
      safetyStockValue,
      policy.leadTimeDays,
      policy.orderCycleDays
    );
    const currentStock = Number(product.stock) || 0;
    const reorderDue = currentStock <= safetyStockValue;

    return {
      id: product.id,
      name: product.name,
      currentStock,
      safetyStock: safetyStockValue,
      maximumInventory,
      suggestedTopUp: reorderDue && maximumInventory !== null
        ? Math.max(0, maximumInventory - currentStock)
        : null,
      reorderDue,
    };
  }), [productOptions, safetyStock]);
  const reorderExampleProduct = productOptions.find((product) => (
    Number(product.annualDemand) > 0 || Number(product.demandFromHistory) > 0
  )) || productOptions[0] || null;
  const reorderExamplePlan = reorderPlans.find((plan) => plan.id === reorderExampleProduct?.id);
  const reorderExampleDemand = Number(reorderExampleProduct?.annualDemand) > 0
    ? Number(reorderExampleProduct.annualDemand)
    : Number(reorderExampleProduct?.demandFromHistory) > 0
      ? Number(reorderExampleProduct.demandFromHistory)
      : 1500;
  const reorderExampleHasDemand = Boolean(
    Number(reorderExampleProduct?.annualDemand) > 0 ||
    Number(reorderExampleProduct?.demandFromHistory) > 0
  );
  const reorderExampleSafetyStock = reorderExamplePlan?.safetyStock
    ?? safetyPointFor({ productName: reorderExampleProduct?.name }, safetyStock);
  const maximumInventoryExample = maximumInventoryFor(reorderExampleDemand, reorderExampleSafetyStock, 7, 30);

  /* ===== MOVEMENT COUNT PER PRODUCT =====
     Opening stock may only be set before the first movement exists — the same
     rule the backend enforces — so the cached balance can't drift from the ledger. */
  const movementCountByProduct = useMemo(() => {
    const counts = new Map();
    stockFromDatabase.forEach((row) => {
      const key = row.productId || row.productName || '—';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [stockFromDatabase]);

  const selectedHasMovements = (movementCountByProduct.get(formData.productId) ?? 0) > 0;
  // New entries default to Opening Stock (a plain starting quantity). It only
  // reverts to the add/reduce Change stepper once the chosen product already
  // has movements, so its balance stays governed by the ledger.
  const canSetOpeningStock = editId === null && !selectedHasMovements;

  /* ===== PRODUCT LEDGERS ===== */
  const ledgers = useMemo(() => {
    const grouped = new Map();
    stockFromDatabase.forEach((row) => {
      const key = row.productId || row.productName || '—';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    const result = new Map();
    grouped.forEach((rows, key) => {
      const ordered = [...rows].sort((a, b) => (
        new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id)
      ));
      let balance = 0;
      let totalIn = 0;
      let totalOut = 0;

      const movements = ordered.map((row) => {
        const delta = signedQty(row);
        balance += delta;
        if (delta >= 0) totalIn += delta;
        else totalOut += -delta;
        return { ...row, delta, balance: Number(row.remainingStock ?? balance) };
      });

      const product = productById.get(key);
      result.set(key, {
        movements,
        totalIn,
        totalOut,
        net: totalIn - totalOut,
        closing: Number(product?.stock ?? balance),
        productName: product?.name || rows[0]?.productName || '—',
      });
    });

    return result;
  }, [stockFromDatabase, productById]);

  const openHistory = (productId) => setHistoryProduct(productId || '—');
  const activeLedger = historyProduct ? ledgers.get(historyProduct) : null;

  /* ===== PRODUCT PHOTO LOOKUP (read-only, from the product master) ===== */
  const productImageByName = useMemo(() => {
    return new Map(productOptions.map((product) => [product.id, product.image]));
  }, [productOptions]);

  const editingMovement = editId === null ? null : stockFromDatabase.find((row) => row.id === editId);

  /* ===== CURRENT ON HAND (excluding the movement being replaced) ===== */
  const currentOnHand = useMemo(() => {
    const product = productById.get(formData.productId);
    if (!product) return null;

    const productStock = Number(product.stock);
    if (!Number.isInteger(productStock) || productStock < 0) return null;

    const replacedMovementDelta = editingMovement?.productId === formData.productId
      ? signedQty(editingMovement)
      : 0;

    return productStock - replacedMovementDelta;
  }, [productById, formData.productId, editingMovement]);

  /* ===== ENTRY PREVIEW =====
     formData.qty is the CHANGE amount (always ≥ 1). formData.type ('Stock In'
     or 'Stock Out') is the direction set by the + / − controls. */
  const parsedQty = formData.qty === '' ? null : Number(formData.qty);
  const enteredValue = Number.isInteger(parsedQty) && parsedQty >= 1 ? parsedQty : null;
  const isOut = formData.type === 'Stock Out';
  const projectedChange = enteredValue === null ? null : (isOut ? -enteredValue : enteredValue);

  const projectedRemaining = !formData.productName || projectedChange === null
    ? null
    : currentOnHand + projectedChange;

  // Plain-language label for the preview: removing stock reads as "Sold".
  const projectedType = isOut ? 'Sold / Removed' : 'Added stock';

  /* ===== OPENING STOCK PREVIEW =====
     When the selected product has no movements, the Change stepper is replaced
     by an Opening Stock field and Total Qty equals the entered opening balance. */
  const parsedOpening = openingStock === '' ? null : Number(openingStock);
  const openingValid = Number.isInteger(parsedOpening) && parsedOpening >= 1;

  /* ===== PROJECTED STATUS ===== */
  const projectedStatus = projectedRemaining === null
    ? null
    : stockStatusFor({
        ...formData,
        safetyStock: productById.get(formData.productId)?.safetyStock,
        remainingStock: projectedRemaining,
      }, safetyStock);

  /* ===== SEND TO CALCULATOR ===== */
  const computeEoqFor = (row) => {
    if (!onNavigate) return;
    onNavigate('Auto-Calculator', {
      product: row.productName,
      productId: row.productId,
      annualDemand: productById.get(row.productId)?.annualDemand || annualDemandFor(row.productName, safetyStock),
    });
  };

  const visibleRows = useMemo(() => {
  const q = query.trim().toLowerCase();
  const filtered = stockFromDatabase.filter((row) =>
    !q || [row.productName, row.category, row.type, row.notes, row.recordedBy, row.date]
      .some((field) => String(field || '').toLowerCase().includes(q))
  );

  // Compute running balance per product, oldest → newest.
  // Sort oldest first so each row's running total = previous running total
  // + its own change, seeded from the product's opening stock (not 0).
  const ordered = [...filtered].sort((a, b) =>
    new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id)
  );

  // Seed each product's running balance with its opening stock so Total Qty
  // reflects startingStock + movements, not just movements from 0.
  // openingByProduct = product.stock (current on-hand) − net of all its movements.
  const netByProduct = new Map();
  ordered.forEach((row) => {
    const key = row.productId || row.productName || '—';
    netByProduct.set(key, (netByProduct.get(key) ?? 0) + signedQty(row));
  });

  const runningByProduct = new Map();
  const runningTotals = new Map();
  ordered.forEach((row) => {
    const key = row.productId || row.productName || '—';
    const delta = signedQty(row);
    const opening = runningByProduct.has(key)
      ? runningByProduct.get(key)
      : Number(productById.get(key)?.stock ?? 0) - (netByProduct.get(key) ?? 0);
    const next = opening + delta;
    runningByProduct.set(key, next);
    runningTotals.set(row.id, next);
  });

  // Prefer the backend's authoritative remaining_stock (already opening-balance
  // aware via reconcileMovementBalances); fall back to the client computation.
  return filtered.map((row) => ({
    row,
    id: row.id,
    runningTotal: Number(row.remainingStock ?? runningTotals.get(row.id) ?? 0),
  }));
}, [stockFromDatabase, query, productById]);

  /* ===== EXPORT CSV ===== */
  const exportCsv = () => {
    if (visibleRows.length === 0) return;
    const headers = ['Date', 'Product', 'Variant', 'Type', 'Changes', 'Total Qty', 'Safety Stock', 'Notes', 'Recorded By'];
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...visibleRows.map(({ row }) => {
        const change = signedQty(row);
        return [
          row.date,
          row.productName,
          row.variantName,
          movementLabel(row.type),
          `${change >= 0 ? '+' : '-'}${Math.abs(change)}`,
          row.remainingStock,
          stockStatusFor({
            ...row,
            safetyStock: productById.get(row.productId)?.safetyStock,
            remainingStock: row.remainingStock,
          }, safetyStock),
          row.notes,
          row.recordedBy,
        ]
          .map(escape).join(',');
      }),
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
    visibleRows.every(({ id }) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleRows.forEach(({ id }) => next.delete(id));
      } else {
        visibleRows.forEach(({ id }) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openAddModal = () => {
    setFormData({ ...emptyForm, date: todayLocal() });
    setEditId(null);
    setOpeningStock('');
    setIsModalOpen(true);
  };

  /* ===== SAVE OPENING STOCK =====
     Records the product's starting quantity as the first Stock In movement, so
     it shows as a row and the ledger stays the single source of truth. Allowed
     only before any other movement exists. */
  const handleSaveOpeningStock = async () => {
    const value = Number(openingStock);
    if (!Number.isInteger(value) || value < 1) {
      setStockError('Enter an opening stock of 1 or more.');
      return;
    }
    setOpeningSaving(true);
    try {
      const response = await fetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          productId: formData.productId,
          productName: formData.productName,
          variantName: formData.variantName || null,
          type: 'Stock In',
          qty: value,
          notes: formData.notes || 'Opening stock',
          recordedBy: formData.recordedBy || null,
          date: formData.date || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationError = result.errors ? Object.values(result.errors).flat()[0] : result.message;
        throw new Error(validationError || `Could not set opening stock (${response.status}).`);
      }
      logActivity('add', formData.productName, `Opening stock of ${value} unit(s) recorded.`);
      setStockError('');
      closeModal();
      await refreshStockData();
    } catch (error) {
      setStockError(error.message || 'Could not set opening stock.');
    } finally {
      setOpeningSaving(false);
    }
  };

  const openEditModal = (id) => {
    const movement = stockFromDatabase.find((row) => row.id === id);
    if (!movement) return;
    const change = signedQty(movement);
    setFormData({
      ...emptyForm,
      date: movement.date || '',
      productId: movement.productId || '',
      productName: movement.productName || '',
      variantName: movement.variantName || '',
      category: movement.category || '',
      type: change < 0 ? 'Stock Out' : 'Stock In',
      /* The stepper edits the change amount of this movement. */
      qty: String(Math.abs(change) || 1),
      notes: movement.notes || '',
      recordedBy: movement.recordedBy || '',
    });
    setEditId(id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id, refresh = true, reportError = true) => {
    const removed = stockFromDatabase.find((row) => row.id === id);
    if (!removed) return;
    try {
      const response = await fetch(`/api/stock-movements/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || `Delete failed (${response.status}).`);
      }
      logActivity('delete', removed.productName, `Removed ${removed.type} of ${removed.qty} unit(s) dated ${removed.date}.`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (refresh) await refreshStockData();
      return true;
    } catch (error) {
      if (reportError) setStockError(error.message || 'Could not delete the stock movement.');
      return false;
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditId(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /* The − / + buttons are DIRECTION toggles, not number spinners:
     − marks this entry as a removal (sold), + as an addition (received).
     The quantity itself is typed in the number field. */
  const setRemove = () => {
    setFormData((prev) => ({
      ...prev,
      type: 'Stock Out',
      qty: prev.qty === '' ? '1' : prev.qty,
    }));
  };

  const setAdd = () => {
    setFormData((prev) => ({
      ...prev,
      type: 'Stock In',
      qty: prev.qty === '' ? '1' : prev.qty,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    /* No movements yet → the form is in Opening Stock mode: set the starting
       balance directly instead of recording a movement. */
    if (canSetOpeningStock) {
      await handleSaveOpeningStock();
      return;
    }

    /* formData.qty = change amount (≥ 1); formData.type = direction. */
    const amount = Number(formData.qty);

    if (!Number.isInteger(amount) || amount < 1) {
      setStockError('Enter a change quantity of 1 or more.');
      return;
    }

    if (currentOnHand === null || currentOnHand < 0) {
      setStockError('The selected product does not have a valid current stock balance. Refresh stock data and try again.');
      return;
    }

    const isStockOut = formData.type === 'Stock Out';
    if (isStockOut && currentOnHand - amount < 0) {
      setStockError(`Only ${currentOnHand} on hand — a Stock Out of ${amount} would make the total negative.`);
      return;
    }

    const payload = {
      productId: formData.productId,
      productName: formData.productName,
      variantName: formData.variantName,
      notes: formData.notes || null,
      recordedBy: formData.recordedBy || null,
      date: formData.date || null,
      type: isStockOut ? 'Stock Out' : 'Stock In',
      qty: amount,
    };

    /* ===== TEMP DEBUG — remove after tracing ===== */
    console.debug('[STOCK DEBUG] BEFORE SAVE', {
      'formData.productId': formData.productId,
      'formData.productName': formData.productName,
      'formData.type': formData.type,
      'formData.qty': formData.qty,
      'productById.get().stock': productById.get(formData.productId)?.stock,
      currentOnHand,
      projectedChange,
      projectedRemaining,
    });
    console.debug('[STOCK DEBUG] PAYLOAD', {
      'payload.type': payload.type,
      'payload.qty': payload.qty,
      'payload.productId': payload.productId,
    });

    try {
      const response = await fetch(editId === null ? '/api/stock-movements' : `/api/stock-movements/${editId}`, {
        method: editId === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationError = result.errors ? Object.values(result.errors).flat()[0] : result.message;
        throw new Error(validationError || `Save failed (${response.status}).`);
      }

      /* ===== TEMP DEBUG — remove after tracing ===== */
      console.debug('[STOCK DEBUG] API RESPONSE', {
        'result.type': result.type,
        'result.qty': result.qty,
        'result.remainingStock': result.remainingStock,
      });

      const saved = result;
      logActivity(editId === null ? 'add' : 'edit', saved.productName,
        `${movementLabel(saved.type)} ${saved.qty} unit(s) → remaining ${saved.remainingStock}`);
      closeModal();
      await refreshStockData();

      /* ===== TEMP DEBUG — remove after tracing ===== */
      const savedProductId = payload.productId;
      const savedMovementId = saved.id;
      setTimeout(() => {
        setProductOptions((currentProducts) => {
          const prod = currentProducts.find((p) => p.id === savedProductId);
          console.debug('[STOCK DEBUG] AFTER refreshStockData', {
            'product.stock after refresh': prod?.stock,
          });
          return currentProducts;
        });
        setStockFromDatabase((currentMovements) => {
          const mv = currentMovements.find((m) => m.id === savedMovementId);
          console.debug('[STOCK DEBUG] AFTER refreshStockData (movement)', {
            'saved movement qty': mv?.qty,
            'saved movement remainingStock': mv?.remainingStock,
          });
          return currentMovements;
        });
      }, 0);
    } catch (error) {
      console.error('Could not save stock movement:', error);
      setStockError(error.message || 'Could not save stock movement.');
    }
  };
  return (
    <div className="sc-table-parent">

      {/* ===== SEARCH BAR ===== */}
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
            onClick={async () => {
              const failedIds = [];
              for (const id of selectedIds) {
                if (!await handleDelete(id, false, false)) failedIds.push(id);
              }
              try {
                await refreshStockData();
                setStockError(failedIds.length
                  ? `Could not delete ${failedIds.length} selected stock movement(s). Check whether removing them would make stock negative.`
                  : '');
              } catch (error) {
                setStockError(error.message || 'The stock list could not be refreshed.');
              }
              setSelectedIds(new Set(failedIds));
            }}
            type="button"
            title={`Delete ${selectedIds.size} selected`}
          >
            <p>Delete ({selectedIds.size})</p>
            <Trash2 size={12} />
          </button>
        )}
        <button className="sc-add-btn sc-add-btn-primary" onClick={openAddModal} type="button">
          <p>Update Stock</p>
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
        <button
          className="sc-add-btn"
          onClick={() => setShowReorderPlan(true)}
          type="button"
          title="View maximum inventory and reorder planning"
        >
          <p>Reorder Plan</p>
          <Info size={12} />
        </button>
      </div>

      {stockError && (
        <div className="sc-error-banner" role="alert">
          <span>{stockError}</span>
          <button type="button" onClick={() => refreshStockData().catch((error) => setStockError(error.message))}>Retry</button>
        </div>
      )}

      {/* ===== TABLE ===== */}
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
              <th className="sc-th-left">Product</th>
              <th>Variant</th>
              <th>Type</th>
              <th className="sc-th-quantity" title="Signed quantity added or removed by this transaction.">Change</th>
              <th className="sc-th-quantity" title="Current total stock for this product.">Total Qty</th>
              <th>Safety Stock</th>
              <th className="sc-th-left">Notes</th>
              <th>Recorded by</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stockLoading ? (
              <tr><td colSpan={11} className="sc-empty-state">Loading stock movements…</td></tr>
            ) : visibleRows.map(({ row: stock, id, runningTotal }) => {
              const product = productById.get(stock.productId);
              const statusRow = {
                ...stock,
                safetyStock: product?.safetyStock,
              };
              const change = signedQty(stock);
              const after = runningTotal;
              const before = after - change;
              const signedText = `${change >= 0 ? '+' : '-'}${Math.abs(change)}`;
              const status = stockStatusFor(statusRow, safetyStock);
              const point = safetyPointFor(statusRow, safetyStock);
              return (
                <tr
                  className={`${status ? `sc-row-${status}` : ''} ${selectedIds.has(id) ? 'is-selected' : ''}`}
                  key={id}
                >
                  <td className="sc-td-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(id)}
                      onChange={() => toggleSelectRow(id)}
                      aria-label={`Select movement ${id}`}
                    />
                  </td>
                  <td className="sc-td-nowrap" data-label="Date">{stock.date}</td>
                  <td className="sc-td-left sc-cell-name" data-label="Product" title={stock.productName}>
                    <span className="sc-name-cell">
                      {productImageByName.get(stock.productId) ? (
                        <img className="sc-thumb" src={productImageByName.get(stock.productId)} alt="" loading="lazy" />
                      ) : (
                        <span className="sc-thumb sc-thumb-empty" aria-hidden="true"><Package size={12} /></span>
                      )}
                      <button
                        type="button"
                        className="sc-product-link"
                        onClick={() => openHistory(stock.productId)}
                        title={`View movement history for ${stock.productName}`}
                      >
                        {stock.productName}
                      </button>
                    </span>
                  </td>
                  <td data-label="Variant">{stock.variantName || '—'}</td>
                  <td data-label="Type">
                    <span className={`sc-type-pill sc-type-${(stock.type || '').replace(/\s+/g, '').toLowerCase()}`}>
                      {movementLabel(stock.type)}
                    </span>
                  </td>
                  <td className="sc-td-nowrap" data-label="Change">
                    <span
                      className={`sc-qty-change ${stock.type === 'Adjustment' ? 'sc-adj' : change >= 0 ? 'sc-in' : 'sc-out'}`}
                      title={`${stock.type === 'Adjustment' ? 'Correction' : 'Movement'} balance: ${before} ${change >= 0 ? '+' : '−'} ${Math.abs(change)} = ${after}`}
                    >
                      {signedText}
                    </span>
                  </td>
                  <td className="sc-td-nowrap sc-td-strong" data-label="Total Qty">{after}</td>
                  <td data-label="Safety Stock">
                    {status ? (
                      <span
                        className={`sc-safety-badge sc-safety-${status}`}
                        title={`${statusRow.remainingStock} on hand · safety stock ${point} (set by Super Admin)`}
                      >
                        {status !== 'healthy' && <AlertTriangle size={10} />}
                        {STATUS_LABEL[status]}
                        <small>≤{point}</small>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="sc-td-left sc-td-muted" data-label="Notes" title={stock.notes}>{stock.notes || '—'}</td>
                  <td data-label="Recorded by">{stock.recordedBy || '—'}</td>
                  <td className="sc-td-actions" data-label="Actions">
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
                        onClick={() => openHistory(stock.productId)}
                        aria-label="View movement history"
                        title="View movement history"
                        type="button"
                      >
                        <History size={14} />
                      </button>
                      <button
                        className="sc-table-action-btn sc-edit-btn"
                        onClick={() => openEditModal(id)}
                        aria-label="Edit Item"
                        title="Edit Item"
                        type="button"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="sc-table-action-btn sc-delete-btn"
                        onClick={() => handleDelete(id)}
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

            {!stockLoading && !stockError && visibleRows.length === 0 && (
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

      {/* ===== ADD ITEM MODAL ===== */}
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
                  <h3 id="sc-modal-title">
                    {editId !== null
                      ? 'Edit Entry'
                      : canSetOpeningStock
                        ? 'Set Opening Stock'
                        : 'Update Stock'}
                  </h3>
                  <p className="sc-modal-subtitle">
                    {editId !== null
                      ? 'Saving replaces this entry.'
                      : canSetOpeningStock
                        ? 'This product has no movements yet. Set its starting quantity on hand.'
                        : 'Pick a product, then + to add new stock or − to record items sold.'}
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

                  <div className="sc-form-group">
                    <div className = "product-variant-Name" aria-label="div-alignment">
                      <label htmlFor="productName">
                        Product Name <span className="sc-required">*</span>
                      </label>
                      <select
                        id="productName"
                        name="productName"
                        value={formData.productId}
                        onChange={handleProductSelect}
                        required
                      >
                        <option value="" disabled hidden>
                          {productOptions.length === 0
                            ? 'No products yet — add one under Product & Supplier'
                            : 'Select a product…'}
                        </option>
                        {productOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>

                      <label htmlFor="variantName">
                        Variant <span className="sc-required">*</span>
                      </label>
                       <input
                          type="text"
                          id="variantName"
                          name="variantName"
                          value={formData.variantName}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              variantName: e.target.value
                            })
                          }
                          placeholder="Enter variant name"
                        />  
                    </div>  
                  </div>

                  <div className="sc-form-row">
                    <div className="sc-form-group">
                      <label htmlFor="category">Category</label>
                      <input
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleFormChange}
                        placeholder="Auto-filled from the selected product"
                        readOnly
                      />
                    </div>
                    <div className="sc-form-group">
                      {canSetOpeningStock ? (
                        <>
                          <label htmlFor="openingStock">
                            Opening Stock <span className="sc-required">*</span>
                          </label>
                          <input
                            id="openingStock"
                            name="openingStock"
                            type="number"
                            min="1"
                            step="1"
                            value={openingStock}
                            onChange={(e) => setOpeningStock(e.target.value)}
                            placeholder="0"
                            required
                          />
                          <span className="sc-field-hint">
                            This product has no movements yet. Set its starting quantity
                            on hand — Total Qty counts up from here. Can only be set
                            before the first movement.
                          </span>
                        </>
                      ) : (
                        <>
                          <label htmlFor="qty">
                            Quantity <span className="sc-required">*</span>
                          </label>
                          <div className="sc-stepper">
                            <button
                              type="button"
                              className={`sc-stepper-btn sc-stepper-minus${isOut ? ' is-active' : ''}`}
                              aria-label="Remove / sold"
                              aria-pressed={isOut}
                              onClick={setRemove}
                              title="This entry removes stock (counts as sold)"
                            >
                              <span>−</span>
                            </button>
                            <input
                              id="qty"
                              name="qty"
                              type="number"
                              className="sc-stepper-value"
                              min="1"
                              step="1"
                              value={formData.qty}
                              onChange={handleFormChange}
                              required
                            />
                            <button
                              type="button"
                              className={`sc-stepper-btn sc-stepper-plus${!isOut ? ' is-active' : ''}`}
                              aria-label="Add stock"
                              aria-pressed={!isOut}
                              onClick={setAdd}
                              title="This entry adds stock (received)"
                            >
                              <span>+</span>
                            </button>
                          </div>
                          <span className="sc-field-hint">
                            {!formData.productName
                              ? 'Select a product first.'
                              : editId === null
                                ? `${currentOnHand} on hand. Type a quantity, then pick − (sold) or + (added).`
                                : `${currentOnHand} on hand before this entry. Saving replaces it.`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                <section className="sc-form-section">
                  <h4 className="sc-form-section-title">Result</h4>

                  {/* ===== RESULT (Current Stock / Change / New Total) ===== */}
                  <div className="sc-computed-field" aria-live="polite">
                    <div className="sc-computed-copy">
                      <span className="sc-computed-label">Total Qty</span>
                      {canSetOpeningStock ? (
                        openingValid ? (
                          <span className="sc-computed-note">
                            Opening balance · starting Total Qty {parsedOpening}
                          </span>
                        ) : (
                          <span className="sc-computed-empty">Set the opening stock for this product</span>
                        )
                      ) : projectedRemaining === null ? (
                        <span className="sc-computed-empty">Pick a product and set a change quantity</span>
                      ) : (
                        <span className="sc-computed-note">
                          Current {currentOnHand} · Change {projectedChange >= 0 ? '+' : '−'}{Math.abs(projectedChange)} · New total {projectedRemaining}
                        </span>
                      )}
                    </div>
                    {canSetOpeningStock
                      ? openingValid && (
                          <span className="sc-computed-value">
                            {parsedOpening}
                            <small>units</small>
                          </span>
                        )
                      : projectedRemaining !== null && (
                          <span className="sc-computed-value">
                            {projectedRemaining}
                            <small>units</small>
                          </span>
                        )}
                  </div>

                  {!canSetOpeningStock && projectedChange !== null && (
                    <div className="sc-variant-preview" aria-live="polite">
                      <div className="sc-computed-copy">
                        <span className="sc-computed-label">{projectedType}</span>
                        <span className="sc-computed-note">
                          {`${currentOnHand} on hand → ${projectedRemaining}`}
                        </span>
                      </div>
                      <span className={`sc-variant-value ${projectedChange > 0 ? 'sc-in' : projectedChange < 0 ? 'sc-out' : ''}`}>
                        {projectedChange >= 0 ? '+' : '−'}{Math.abs(projectedChange)}
                        <small>units</small>
                      </span>
                    </div>
                  )}

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
                <button
                  type="submit"
                  className="sc-modal-save-btn"
                  disabled={
                    openingSaving ||
                    !formData.productName ||
                    (canSetOpeningStock
                      ? !openingValid
                      : !Number.isInteger(parsedQty) || parsedQty < 1 || currentOnHand === null)
                  }
                >
                  {canSetOpeningStock
                    ? (openingSaving ? 'Saving…' : 'Set Opening Stock')
                    : (editId === null ? 'Save' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* ===== MOVEMENT HISTORY ===== */}
      {historyProduct && createPortal(
        <div className="sc-modal-overlay" onClick={() => setHistoryProduct(null)}>
          <div className="sc-history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sc-modal-header">
              <div>
                <h3>Movement History</h3>
                <p className="sc-history-product">{activeLedger?.productName || 'Product'}</p>
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
                  {activeLedger.movements.map((move) => (
                    <li className="sc-history-item" key={move.id}>
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

      {showReorderPlan && createPortal(
        <div className="sc-reorder-fullscreen-overlay">
          <aside
            className="sc-reorder-fullscreen"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-reorder-planning-title"
          >
            <div className="sc-reorder-fullscreen-header">
              <button
                className="sc-reorder-back"
                onClick={() => setShowReorderPlan(false)}
                type="button"
                aria-label="Close reorder plan"
                title="Close"
              >
                <ArrowRight size={18} />
              </button>
              <div className="sc-reorder-fullscreen-title">
                <div className="sc-modal-titles">
                  <h2 id="sc-reorder-planning-title">Maximum Inventory &amp; Reorder Plan</h2>
                  <p className="sc-modal-subtitle">
                    Maximum inventory = safety stock + daily demand × (lead time + order cycle).
                    Set lead time and order cycle in Settings → Advanced Options.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="sc-reorder-settings"
                onClick={() => {
                  setShowReorderPlan(false);
                  onNavigate?.('Setting');
                }}
              >
                Configure policy
              </button>
            </div>
            <div className="sc-reorder-fullscreen-body">
              <div className="sc-reorder-table-scroll">
                <table className="sc-reorder-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>On hand</th>
                      <th>Safety-stock trigger</th>
                      <th>Maximum inventory</th>
                      <th>Suggested top-up*</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLoading ? (
                      <tr><td colSpan={5} className="sc-reorder-empty">Loading reorder plans…</td></tr>
                    ) : reorderPlans.length ? reorderPlans.map((plan) => (
                      <tr key={plan.id}>
                        <td>{plan.name}</td>
                        <td>{plan.currentStock} units</td>
                        <td>{plan.safetyStock} units</td>
                        <td>
                          {plan.maximumInventory === null
                            ? <span className="sc-reorder-unconfigured">Configure annual demand, lead time &amp; order cycle</span>
                            : `${plan.maximumInventory} units`}
                        </td>
                        <td>
                          {plan.suggestedTopUp === null
                            ? (plan.reorderDue ? 'Configure maximum inventory' : 'Not at reorder point')
                            : `${plan.suggestedTopUp} units`}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="sc-reorder-empty">No products available for reorder planning.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {reorderExampleProduct && (
                <section className="sc-maximum-example-card" aria-labelledby="sc-maximum-example-title">
                  <h3 id="sc-maximum-example-title">
                    Worked example — {reorderExampleProduct.name}
                  </h3>
                  <div className="sc-maximum-example-inputs">
                    <span>
                      Annual demand: <strong>{reorderExampleDemand.toLocaleString()} units</strong>
                      {!reorderExampleHasDemand && ' (illustrative; no demand recorded)'}
                    </span>
                    <span>Safety stock: <strong>{reorderExampleSafetyStock} units</strong></span>
                    <span>Illustrative lead time: <strong>7 days</strong></span>
                    <span>Illustrative order cycle: <strong>30 days</strong></span>
                  </div>
                  <div className="sc-maximum-example-formula">
                    {reorderExampleSafetyStock} + ({reorderExampleDemand.toLocaleString()} ÷ 365) × (7 + 30)
                    <strong>{maximumInventoryExample} units maximum inventory</strong>
                  </div>
                  <p>
                    Product comes from your database; safety stock uses its configured value or the system
                    default. Lead time and order cycle are examples only, not actual supplier settings.
                    Configure verified values in Settings.
                  </p>
                </section>
              )}
              <p className="sc-reorder-footnote">
                *Suggested top-up is based on current on-hand stock only. Open purchase orders are not tracked, so account for them before ordering.
                EOQ is a separate cost-based order quantity and does not change the reorder threshold or maximum-stock target.
              </p>
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* ===== ACTIVITY DRAWER ===== */}
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