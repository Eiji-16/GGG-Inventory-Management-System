import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  X,
  Edit,
  Trash2,
  Eraser,
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
  ClipboardList,
  ArrowUpDown,
  Check,
  Package } from 'lucide-react';

import './stockControl.css';
import SearchSuggestions from '../SearchSuggestions/SearchSuggestions';
import MobileSelectBar from '../MobileSelectBar/MobileSelectBar';
import apiFetch from '../../apiFetch';
import { useCurrency } from '../../CurrencyContext';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import {
  SAFETY_STOCK_DEFAULTS,
  safetyPointFor,
  reorderPointFor,
  stockStatusFor,
  annualDemandFor,
  policyFor,
  safetyCrossingFor,
  safetyReachedFor,
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
  unitPrice: '',
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

/* History "Date & time": the entry date, plus when it was recorded. */
const entryWhen = (row) => {
  const created = row.createdAt ? new Date(row.createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return row.date || '—';
  const time = created.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const createdDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
  return createdDay === row.date ? `${row.date} · ${time}` : `${row.date} (recorded ${createdDay} · ${time})`;
};

/* ===== SIGNED QTY ===== */
/* Variants a transaction can use for this product (see Product & Supplier). */
const variantChoicesFor = (product) => {
  if (!product) return [];
  const defined = product.definedVariants || [];
  return defined.length ? defined : (product.recordedVariants || product.variants || []);
};

const signedQty = (row) => {
  if (row.type === 'Adjustment') return Number(row.variance) || 0;
  const qty = Number(row.qty) || 0;
  return row.type === 'Stock Out' ? -qty : qty;
};

const activityPresentation = (item) => {
  if (item.action === 'stock.safety') return { Icon: AlertTriangle, cls: 'sc-act-delete', label: item.meta?.outOfStock ? 'Out of stock' : 'Below safety stock' };
  if (item.action === 'stock.clear') return { Icon: Trash2, cls: 'sc-act-delete', label: 'Cleared' };
  if (item.action === 'stock.edit') return { Icon: Pencil, cls: 'sc-act-edit', label: 'Updated' };
  if (item.action === 'stock.delete') return { Icon: Trash2, cls: 'sc-act-delete', label: 'Moved to Trash Bin' };
  if (item.action === 'stock.restore') return { Icon: History, cls: 'sc-act-add', label: 'Restored' };
  if (item.meta?.type === 'Adjustment') return { Icon: Activity, cls: 'sc-act-edit', label: 'Corrected' };
  if (item.action === 'stock.out') return { Icon: ArrowDownRight, cls: 'sc-act-delete', label: 'Stock Out' };
  return { Icon: PlusCircle, cls: 'sc-act-add', label: 'Stock In' };
};

function StockControl({
  onNavigate,
  safetyStock = SAFETY_STOCK_DEFAULTS,
  handoff = null,
  catalogRevision = 0,
  onInventoryChanged,
  currentUserName = '',
  canComputeEoq = false,
  // Role Access (Settings) decides these; the server checks the same boxes.
  canClearStock = false,
  canAddStock = true,
  canEditStock = true,
  canDeleteStock = true,
  canExportStock = true,
  canViewActivity = true,
}) {
  const { currency, currencySymbol, formatCurrency } = useCurrency();
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
  const [activityLog, setActivityLog] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [productActivityLog, setProductActivityLog] = useState([]);
  const [productActivityLoading, setProductActivityLoading] = useState(false);
  const [productActivityError, setProductActivityError] = useState('');
  const [productOptions, setProductOptions] = useState([]);
  const [openingStock, setOpeningStock] = useState('');
  const [openingSaving, setOpeningSaving] = useState(false);
  const [sortBy, setSortBy] = useState('date'); /* ===== SORT KEY ===== */
  const [sortDir, setSortDir] = useState('desc'); /* ===== SORT DIRECTION ===== */
  /* ===== PAGES =====
     Show 50 rows at a time so a long history stays quick to scroll. Search,
     sort and Excel export still use every matching row. */
  const [page, setPage] = useState(1);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null); /* row to flash from a Dashboard handoff */
  /* ===== TABS =====
     "stock":   the main Stock Control table (manage inventory here).
     "history": read-only log of every stock change — who, what, when. */
  const [view, setView] = useState('stock');
  const [historyPage, setHistoryPage] = useState(1);

  const loadStockActivities = async (productId = null) => {
    if (!canViewActivity) return; // "Activity history" is switched off for this role
    const isProductReport = productId !== null;
    if (isProductReport) {
      setProductActivityLoading(true);
      setProductActivityError('');
    } else {
      setActivityLoading(true);
      setActivityError('');
    }

    try {
      const params = new URLSearchParams();
      if (productId) params.set('productId', productId);
      const response = await fetch(`/api/stock-activities${params.size ? `?${params}` : ''}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Could not load stock activity (${response.status}).`);
      const logs = await response.json();
      if (!Array.isArray(logs)) throw new Error('The stock activity response was invalid.');
      if (isProductReport) setProductActivityLog(logs);
      else setActivityLog(logs);
    } catch (error) {
      if (isProductReport) setProductActivityError(error.message || 'Could not load product activity.');
      else setActivityError(error.message || 'Could not load stock activity.');
    } finally {
      if (isProductReport) setProductActivityLoading(false);
      else setActivityLoading(false);
    }
  };

  const refreshStockData = async () => {
    setStockError('');
    const [movementResponse, productResponse] = await Promise.all([
      fetch('/api/stock-movements', { headers: { Accept: 'application/json' } }),
      fetch('/api/products', { cache: 'no-store', headers: { Accept: 'application/json' } }),
    ]);
    if (!movementResponse.ok) throw new Error(`Could not load stock movements (${movementResponse.status}).`);
    if (!productResponse.ok) throw new Error(`Could not load products (${productResponse.status}).`);
    const [movements, products] = await Promise.all([movementResponse.json(), productResponse.json()]);
    setStockFromDatabase(movements);
    setProductOptions(products);
    if (formData.productId && !products.some((product) => product.id === formData.productId)) {
      setFormData(emptyForm);
      setOpeningStock('');
      setIsModalOpen(false);
      setEditId(null);
    }
  };

  useEffect(() => {
    refreshStockData()
      .catch((error) => setStockError(error.message || 'Could not load Stock Control data.'))
      .finally(() => setStockLoading(false));
  }, [catalogRevision]);

  /* Close the sort dropdown on any outside click. */
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDown = (e) => { if (!e.target.closest('.sc-sort-wrap')) setSortMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sortMenuOpen]);

  /* ===== HANDOFF HIGHLIGHT =====
     A Dashboard "Stock Alerts" click passes { highlightProductId }. We search
     for that product and flash its rows. If the product has no movement rows
     yet (nothing to show), we surface a short notice instead of highlighting
     nothing — "don't include it there" if it isn't listed. */
  useEffect(() => {
    const targetId = handoff?.highlightProductId;
    if (!targetId || stockLoading) return;

    const hasRows = stockFromDatabase.some((row) => row.productId === targetId);
    if (!hasRows) {
      const product = productOptions.find((p) => p.id === targetId);
      setStockError(
        `${product?.name || targetId} has no stock movements yet, so it isn't listed below. Use "Update Stock" to add an entry.`
      );
      return;
    }

    // Search for the product so its rows are together on page 1 (rows are
    // shown 50 at a time), then flash them.
    const targetName = stockFromDatabase.find((row) => row.productId === targetId)?.productName || '';
    setQuery(targetName);
    setHighlightId(targetId);
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [handoff, stockLoading, stockFromDatabase, productOptions]);

  /* ===== PICK PRODUCT ===== */
  const handleProductSelect = (e) => {
    const productId = e.target.value;
    const picked = productOptions.find((p) => p.id === productId);
    setFormData((prev) => ({
      ...prev,
      productId,
      productName: picked?.name || '',
      category: picked ? (picked.category || '') : prev.category,
      // Variants belong to a product, so clear one that the new product lacks.
      variantName: variantChoicesFor(picked).includes(prev.variantName) ? prev.variantName : '',
    }));
    // Seed the opening-stock editor with the product's current balance.
    setOpeningStock(picked ? String(picked.stock ?? 0) : '');
  };

  const productById = useMemo(() => new Map(productOptions.map((product) => [product.id, product])), [productOptions]);

  /* ===== VARIANT CHOICES =====
     Picked from the product's own list (set in Product & Supplier). Products
     without a list yet fall back to names used on earlier transactions. The
     row's current value is always kept so editing an older row loses nothing. */
  const selectedVariantChoices = (() => {
    const choices = [...variantChoicesFor(productById.get(formData.productId))];
    if (formData.variantName && !choices.includes(formData.variantName)) choices.push(formData.variantName);
    return choices;
  })();

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

  const openHistory = (productId) => {
    const id = productId || '—';
    setHistoryProduct(id);
    if (id !== '—') loadStockActivities(id);
  };
  const activeLedger = historyProduct ? ledgers.get(historyProduct) : null;

  /* ===== PRODUCT PHOTO LOOKUP (read-only, from the product master) ===== */
  const productImageByName = useMemo(() => {
    return new Map(productOptions.map((product) => [product.id, product.image]));
  }, [productOptions]);

  /* ===== CURRENT ON HAND ===== */
  const currentOnHand = useMemo(() => {
    const product = productById.get(formData.productId);
    if (!product) return null;

    const productStock = Number(product.stock);
    if (!Number.isInteger(productStock) || productStock < 0) return null;

    return productStock;
  }, [productById, formData.productId]);

  /* ===== ENTRY PREVIEW =====
     The quantity is always a positive number; the Type (Stock In / Stock Out)
     decides whether it adds or removes stock. Edit mode has no quantity at all:
     stock is changed with the − / + buttons in the QTY column instead. */
  const parsedQty = formData.qty === '' ? null : Number(formData.qty);
  const enteredQty = editId === null && Number.isInteger(parsedQty) && parsedQty >= 1 ? parsedQty : null;
  const projectedChange = enteredQty === null
    ? null
    : (formData.type === 'Stock Out' ? -enteredQty : enteredQty);
  const isOut = formData.type === 'Stock Out';
  const validMovementQuantity = editId !== null || (
    enteredQty !== null
    && currentOnHand !== null
    && (!isOut || enteredQty <= currentOnHand)
  );

  const projectedRemaining = !formData.productName || currentOnHand === null || projectedChange === null
    ? null
    : currentOnHand + projectedChange;

  // Plain-language label for the preview: removing stock reads as "Sold".
  const projectedType = isOut ? 'Sold / Removed' : 'Added stock';

  /* ===== SAFETY-STOCK HANDLER (warn, never block) =====
     True when this entry takes the product from above its safety stock to at
     or below it (Critical), or to zero. Shown as a warning above Save; after
     saving, a banner offers Order Now. The sale itself is never stopped. */
  const safetyCrossing = !canSetOpeningStock && projectedRemaining !== null
    ? safetyCrossingFor({
      productId: formData.productId,
      productName: formData.productName,
      safetyStock: productById.get(formData.productId)?.safetyStock,
    }, currentOnHand, projectedRemaining, safetyStock)
    : null;
  // Sale that leaves stock at/below safety stock → ask before saving.
  const safetyReached = !canSetOpeningStock && projectedRemaining !== null
    ? safetyReachedFor({
      productId: formData.productId,
      productName: formData.productName,
      safetyStock: productById.get(formData.productId)?.safetyStock,
    }, currentOnHand, projectedRemaining, safetyStock)
    : null;
  const [confirmSale, setConfirmSale] = useState(null);
  // In-app confirmation for deletes (replaces the browser's window.confirm).
  // { kind: 'entry', stock, changeText } or { kind: 'clear', productId, productName }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Shown after a new entry was added to an existing same-day entry.
  const [mergeNotice, setMergeNotice] = useState('');
  const [safetyAlert, setSafetyAlert] = useState(null);
  // Movement rows whose − / + adjustment is saving right now.
  const [quickBusy, setQuickBusy] = useState(new Set());
  const [safetyOrdering, setSafetyOrdering] = useState(false);
  const orderFromSafetyAlert = async () => {
    if (!safetyAlert || !onNavigate) return;
    setSafetyOrdering(true);
    const { handoff, reason } = await buildForecastHandoff(safetyAlert.productId, safetyAlert.productName);
    setSafetyOrdering(false);
    onNavigate('Auto-Calculator', handoff || {
      product: safetyAlert.productName,
      productId: safetyAlert.productId,
      annualDemand: productById.get(safetyAlert.productId)?.annualDemand,
      forecastUnavailable: reason,
    });
    setSafetyAlert(null);
  };

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
      annualDemand: productById.get(formData.productId)?.annualDemand
        || productById.get(formData.productId)?.demandFromHistory,
      leadTimeDays: productById.get(formData.productId)?.leadTimeDays,
      remainingStock: projectedRemaining,
    }, safetyStock);

  /* ===== SEND TO CALCULATOR ===== */
  // Navigation only — sends the product's forecast demand to the EOQ
  // Calculator (falls back to the previous demand figure if no forecast yet).
  const computeEoqFor = async (row) => {
    if (!onNavigate || !canComputeEoq) return;
    const { handoff, reason } = await buildForecastHandoff(row.productId, row.productName);
    onNavigate('Auto-Calculator', handoff || {
      product: row.productName,
      productId: row.productId,
    annualDemand: productById.get(row.productId)?.annualDemand
      || annualDemandFor(row.productId, safetyStock, row.productName),
      forecastUnavailable: reason,
    });
  };

  /* ===== VARIANT COUNTS (display) =====
     The server keeps ONE stock total per product (used by reorder points,
     forecasts, the Dashboard and Reports — unchanged). Each variant's own
     count is worked out here from its own entries: Stock In adds, Stock Out
     removes, a Correction adds its difference. Entries with no variant form
     their own group. */
  const variantKeyOf = (row) => `${row.productId || row.productName || '—'}||${String(row.variantName || '').trim().toLowerCase()}`;
  const variantData = useMemo(() => {
    const stockByKey = new Map();   // product+variant → current count
    const afterById = new Map();    // entry id → that variant's count right after it
    const latestByKey = new Map();  // product+variant → its newest entry
    ledgers.forEach((ledger) => {
      ledger.movements.forEach((movement) => {
        const key = variantKeyOf(movement);
        const next = (stockByKey.get(key) || 0) + movement.delta;
        stockByKey.set(key, next);
        afterById.set(movement.id, next);
        latestByKey.set(key, movement);   // movements are in date, then id order
      });
    });
    return { stockByKey, afterById, latestIds: new Set([...latestByKey.values()].map((movement) => movement.id)) };
  }, [ledgers]);

  const visibleRows = useMemo(() => {
  const q = query.trim().toLowerCase();
  const filtered = stockFromDatabase.filter((row) =>
    !q || [row.productName, row.category, row.type, row.notes, row.recordedBy, row.date, row.variantName]
      .some((field) => String(field || '').toLowerCase().includes(q))
  );

  // DISPLAY ONLY — nothing here changes stock. Each row shows its OWN signed
  // change and the balance right after it. That balance comes from the
  // product ledger (date, then id order), which uses the server's
  // remaining_stock — recalculated by the backend after every add/edit/delete.
  const balanceAfterById = new Map();
  const latestTotals = new Map();
  ledgers.forEach((ledger, key) => {
    ledger.movements.forEach((movement) => balanceAfterById.set(movement.id, movement.balance));
    const last = ledger.movements[ledger.movements.length - 1];
    if (last) latestTotals.set(key, last.balance);
  });

  const mapped = filtered.map((row) => {
    const key = row.productId || row.productName || '—';
    const product = productById.get(row.productId)
      || productOptions.find((item) => item.name === row.productName);
    // Current on-hand for the product (unchanged source); used only for the
    // reorder-status badge, which describes the product today.
    const productStock = row.totalQty ?? product?.stock;
    const latestTotal = latestTotals.get(key);
    const total = productStock !== null && productStock !== '' && Number.isFinite(Number(productStock))
      ? Number(productStock)
      : latestTotal !== null && latestTotal !== undefined && Number.isFinite(Number(latestTotal))
        ? Number(latestTotal)
        : 0;
    const after = balanceAfterById.get(row.id);
    return {
      row,
      id: row.id,
      totalQty: total,
      change: signedQty(row),
      balanceAfter: Number.isFinite(Number(after)) ? Number(after) : Number(row.remainingStock) || 0,
    };
  });

  // Apply the chosen sort (dropdown). Default: newest date first.
  const dir = sortDir === 'asc' ? 1 : -1;
  mapped.sort((a, b) => {
    let cmp;
    switch (sortBy) {
      case 'product':
        cmp = String(a.row.productName || '').localeCompare(String(b.row.productName || ''), undefined, { sensitivity: 'base' });
        break;
      case 'total':
        cmp = a.balanceAfter - b.balanceAfter;
        break;
      case 'date':
      default:
        cmp = (new Date(a.row.date) - new Date(b.row.date)) || (Number(a.id) - Number(b.id));
        break;
    }
    return cmp * dir;
  });

  return mapped;
}, [stockFromDatabase, ledgers, query, productById, productOptions, sortBy, sortDir]);

  /* ===== MAIN TABLE: one row per product + variant =====
     Each product + variant shows once, as its newest entry (the same row,
     columns and actions as before). The same product name can show more
     than once when the variants differ; the same product + variant never
     twice. Every entry is still kept and shown in the History tab, and the
     Excel export still lists every matching entry. */
  const tableRows = useMemo(() => visibleRows
    .filter(({ id }) => variantData.latestIds.has(id))
    .map((item) => ({ ...item, variantStock: variantData.stockByKey.get(variantKeyOf(item.row)) ?? 0 })),
  [visibleRows, variantData]);

  /* ===== HISTORY: every entry, newest first (matches the search) ===== */
  const historyRows = useMemo(() => [...visibleRows].sort((a, b) => (
    String(b.row.date).localeCompare(String(a.row.date)) || Number(b.id) - Number(a.id)
  )), [visibleRows]);

  const PAGE_SIZE = 50;
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = tableRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const historyPageRows = historyRows.slice((currentHistoryPage - 1) * PAGE_SIZE, currentHistoryPage * PAGE_SIZE);
  // A new search or sort starts again at page 1.
  useEffect(() => { setPage(1); setHistoryPage(1); }, [query, sortBy, sortDir]);
  // Ticks only count for entries that still match the search: an entry hidden
  // by a search (or removed) is unticked, so "Clear stock (N)" never counts
  // something you can't see.
  useEffect(() => {
    const shown = new Set(tableRows.map(({ id }) => id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => shown.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tableRows]);

  /* ===== EXPORT FORMATTED EXCEL REPORT ===== */
  const exportStockReport = async () => {
    if (visibleRows.length === 0) return;
    let XLSX;
    try {
      ({ default: XLSX } = await import('xlsx-js-style'));
    } catch (error) {
      console.error('Could not load spreadsheet export support:', error);
      setStockError('The Excel export could not be loaded. Please refresh the page and try again.');
      return;
    }
    const headers = ['Date', 'Product', 'Variant', 'Type', 'Change', 'QTY', 'Stock Status', 'Notes', 'Recorded By', `Unit Price (${currency})`];
    const exportedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const uniqueProducts = new Set(visibleRows.map(({ row }) => row.productId)).size;
    const stockInCount = visibleRows.filter(({ row }) => row.type === 'Stock In').length;
    const stockOutCount = visibleRows.filter(({ row }) => row.type === 'Stock Out').length;
    const bodyRows = visibleRows.map(({ row, totalQty, change, balanceAfter }) => {
      const product = productById.get(row.productId);
      const status = stockStatusFor({
        ...row,
        safetyStock: product?.safetyStock,
        annualDemand: product?.annualDemand || product?.demandFromHistory,
        leadTimeDays: product?.leadTimeDays,
        remainingStock: totalQty,
      }, safetyStock);
      const parsedDate = new Date(`${row.date}T00:00:00`);
      const date = Number.isNaN(parsedDate.getTime())
        ? String(row.date || '')
        : parsedDate.toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric' });

      return {
        values: [
          date,
          row.productName,
          row.variantName || '—',
          movementLabel(row.type),
          change,
          balanceAfter,
          STATUS_LABEL[status] || status,
          row.notes || '—',
          row.recordedBy || '—',
          row.unitPrice != null ? Number(row.unitPrice) : '—',
        ],
        status,
      };
    });

    const rows = [
      ['GGG INVENTORY MANAGEMENT SYSTEM'],
      ['STOCK MOVEMENT REPORT'],
      [`Generated: ${exportedAt}`, '', '', '', '', '', '', '', '', `Records: ${visibleRows.length}`],
      ['MOVEMENT SUMMARY', '', '', '', '', '', '', '', ''],
      [],
      [],
      ['MOVEMENT RECORDS', '', '', '', '', '', '', '', ''],
      headers,
      ...bodyRows.map(({ values }) => values),
      [],
      ['Report scope', query.trim() ? `Filtered by: ${query.trim()}` : 'All records in the current view'],
      ['Note', 'Change is the signed quantity of each transaction; QTY is the product stock right after that transaction. Stock Status reflects current stock.'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const lastDataRow = 7 + bodyRows.length;

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 9 } },
      { s: { r: 9 + bodyRows.length, c: 1 }, e: { r: 9 + bodyRows.length, c: 9 } },
      { s: { r: 10 + bodyRows.length, c: 1 }, e: { r: 10 + bodyRows.length, c: 9 } },
    ];
    worksheet['!cols'] = [
      { wch: 17 }, { wch: 25 }, { wch: 17 }, { wch: 16 }, { wch: 13 },
      { wch: 14 }, { wch: 17 }, { wch: 34 }, { wch: 20 }, { wch: 14 },
    ];
    worksheet['!rows'] = [
      { hpt: 30 }, { hpt: 25 }, { hpt: 22 }, { hpt: 21 }, { hpt: 22 }, { hpt: 30 },
      { hpt: 22 }, { hpt: 25 },
      ...bodyRows.map(() => ({ hpt: 22 })),
    ];
    worksheet['!autofilter'] = { ref: `A8:J${lastDataRow + 1}` };
    worksheet['!freeze'] = {
      xSplit: 0,
      ySplit: 8,
      topLeftCell: 'A9',
      activePane: 'bottomLeft',
      state: 'frozen',
    };
    worksheet['!views'] = [{ showGridLines: false }];

    const setCellStyle = (cell, style) => {
      if (worksheet[cell]) worksheet[cell].s = style;
    };
    const border = { bottom: { style: 'thin', color: { rgb: 'D9E2EC' } } };
    const summaryLabel = {
      font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '176B57' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const summaryValue = {
      font: { name: 'Aptos', sz: 15, bold: true, color: { rgb: '163A32' } },
      fill: { fgColor: { rgb: 'EAF4F0' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border,
    };
    setCellStyle('A1', {
      font: { name: 'Aptos Display', sz: 18, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '123B32' } },
      alignment: { vertical: 'center' },
    });
    setCellStyle('A2', {
      font: { name: 'Aptos Display', sz: 15, bold: true, color: { rgb: '176B57' } },
      alignment: { vertical: 'center' },
    });
    setCellStyle('A3', {
      font: { name: 'Aptos', sz: 10, color: { rgb: '5B6877' } },
      alignment: { vertical: 'center' },
    });
    setCellStyle('J3', {
      font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: '176B57' } },
      alignment: { horizontal: 'right', vertical: 'center' },
    });
    setCellStyle('A4', {
      font: { name: 'Aptos', sz: 11, bold: true, color: { rgb: '176B57' } },
      fill: { fgColor: { rgb: 'EAF4F0' } },
      alignment: { vertical: 'center' },
    });
    setCellStyle('A7', {
      font: { name: 'Aptos', sz: 11, bold: true, color: { rgb: '176B57' } },
      fill: { fgColor: { rgb: 'EAF4F0' } },
      alignment: { vertical: 'center' },
    });
    const summaryRanges = [
      ['A', 'B', 'Records', visibleRows.length],
      ['C', 'D', 'Products', uniqueProducts],
      ['E', 'F', 'Stock In', stockInCount],
      ['G', 'J', 'Stock Out', stockOutCount],
    ];
    summaryRanges.forEach(([start, end, label, value]) => {
      setCellStyle(`${start}5`, summaryLabel);
      setCellStyle(`${start}6`, summaryValue);
      worksheet[`${start}6`] = { t: 'n', v: value, s: summaryValue };
      worksheet['!merges'].push(
        { s: { r: 4, c: XLSX.utils.decode_col(start) }, e: { r: 4, c: XLSX.utils.decode_col(end) } },
        { s: { r: 5, c: XLSX.utils.decode_col(start) }, e: { r: 5, c: XLSX.utils.decode_col(end) } },
      );
      worksheet[`${start}5`] = { t: 's', v: label, s: summaryLabel };
    });
    headers.forEach((_, column) => {
      const address = XLSX.utils.encode_cell({ r: 7, c: column });
      if (worksheet[address]) {
        worksheet[address].s = {
          font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '244B43' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: { bottom: { style: 'medium', color: { rgb: '176B57' } } },
        };
      }
    });
    bodyRows.forEach(({ status }, index) => {
      const rowIndex = index + 8;
      for (let column = 0; column < headers.length; column += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
        if (worksheet[address]) {
          worksheet[address].s = {
            font: { name: 'Aptos', sz: 10, color: { rgb: '253247' } },
            fill: { fgColor: { rgb: index % 2 === 0 ? 'FFFFFF' : 'F5F8FA' } },
            alignment: { vertical: 'center', wrapText: column === 7 },
            border,
          };
        }
      }
      const changeCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 4 })];
      if (changeCell) {
        changeCell.z = '+0;-0;0';
        changeCell.s = {
          ...changeCell.s,
          font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: changeCell.v < 0 ? 'B42318' : '16804A' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      const statusCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 6 })];
      if (statusCell) {
        const statusColor = status === 'critical' || status === 'outofstock'
          ? ['FCE8E6', 'B42318']
          : status === 'warning'
            ? ['FFF4D6', '8A5A00']
            : ['E8F5EE', '16804A'];
        statusCell.s = {
          ...statusCell.s,
          font: { name: 'Aptos', sz: 10, bold: true, color: { rgb: statusColor[1] } },
          fill: { fgColor: { rgb: statusColor[0] } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Movement Report');
    workbook.Props = {
      Title: 'Stock Movement Report',
      Subject: 'Inventory stock movement and current quantity',
      Author: 'GGG Inventory Management System',
      CreatedDate: new Date(),
    };
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `stock-movement-report-${date}.xlsx`);
  };

  const selectedProductIds = [...new Set(
    stockFromDatabase
      // Deleted products can't be cleared (they're kept only as history).
      .filter((row) => selectedIds.has(row.id) && !row.productDeleted)
      .map((row) => row.productId)
  )];

  // "Select all" = the rows on this page (the ones you can see).
  const allSelected =
    pageRows.length > 0 &&
    pageRows.every(({ id }) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageRows.forEach(({ id }) => next.delete(id));
      } else {
        pageRows.forEach(({ id }) => next.add(id));
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
    setFormData({ ...emptyForm, date: todayLocal(), qty: '1', recordedBy: currentUserName });
    setEditId(null);
    setOpeningStock('');
    setIsModalOpen(true);
  };

  /* ===== SAVE OPENING STOCK =====
     Records the product's starting quantity as the first Stock In movement, so
     it shows as a row and the ledger stays the single source of truth. Allowed
     only before any other movement exists. */
  /* Unit Price is required on every Stock In / Stock Out (0 is allowed). */
  const PRICE_REQUIRED_MESSAGE = 'Enter the unit price: cost per unit for Stock In, selling price per unit for Stock Out.';
  // Older count corrections have no price, so their notes can be edited without one.
  const editingCorrection = editId !== null && stockFromDatabase.find((row) => row.id === editId)?.type === 'Adjustment';
  const priceMissing = () => !editingCorrection && (formData.unitPrice === '' || !(Number(formData.unitPrice) >= 0));

  const handleSaveOpeningStock = async () => {
    if (priceMissing()) {
      setStockError(PRICE_REQUIRED_MESSAGE);
      return;
    }
    const value = Number(openingStock);
    if (!Number.isInteger(value) || value < 1) {
      setStockError('Enter an opening stock of 1 or more.');
      return;
    }
    setOpeningSaving(true);
    try {
      const response = await apiFetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          productId: formData.productId,
          productName: formData.productName,
          variantName: formData.variantName || null,
          type: 'Stock In',
          qty: value,
          unitPrice: formData.unitPrice === '' ? null : Number(formData.unitPrice),
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
      setStockError('');
      closeModal();
      await refreshStockData();
      await loadStockActivities();
      onInventoryChanged?.();
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
      qty: '0',
      unitPrice: movement.unitPrice != null ? String(movement.unitPrice) : '',
      notes: movement.notes || '',
      // The server keeps the original recorder on edits; it only fills
      // this in when an older row has none.
      recordedBy: movement.recordedBy || currentUserName,
    });
    setEditId(id);
    setIsModalOpen(true);
  };

  const clearProductStock = async (productId, refresh = true, reportError = true) => {
    try {
      const response = await apiFetch(`/api/stock-movements/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || `Delete failed (${response.status}).`);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        stockFromDatabase
          .filter((row) => row.productId === productId)
          .forEach((row) => next.delete(row.id));
        return next;
      });
      if (refresh) {
        await refreshStockData();
        await loadStockActivities();
        onInventoryChanged?.();
      }
      return true;
    } catch (error) {
      if (reportError) setStockError(error.message || 'Could not clear stock for this product.');
      return error.message || 'Could not clear stock for this product.';
    }
  };

  const requestClearProductStock = async (productId) => {
    const product = productById.get(productId);
    if (!product) {
      setStockError('Could not find this product. Refresh the stock list and try again.');
      return;
    }
    setConfirmDelete({ kind: 'clear', productId, productName: product.name });
  };

  // Delete ONE stock entry. The server removes it and puts the product's
  // stock back to what it was before that entry (same as it never happened).
  const requestDeleteSingleEntry = (stock) => {
    const change = signedQty(stock);
    setConfirmDelete({
      kind: 'entry',
      stock,
      changeText: `${change >= 0 ? '+' : '−'}${Math.abs(change)}`,
    });
  };

  const deleteSingleEntry = async (stock) => {
    try {
      const response = await apiFetch(`/api/stock-movements/${encodeURIComponent(stock.id)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        const firstError = result.errors ? Object.values(result.errors).flat()[0] : null;
        throw new Error(firstError || result.message || `Delete failed (${response.status}).`);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(stock.id);
        return next;
      });
      setStockError('');
      setMergeNotice('');
      await refreshStockData();
      await loadStockActivities();
      onInventoryChanged?.();
    } catch (error) {
      setStockError(error.message || 'Could not delete this entry.');
    }
  };

  // "Clear stock (N)": clear every selected product (after the popup).
  const requestClearSelectedProducts = () => {
    const products = selectedProductIds
      .map((productId) => productById.get(productId))
      .filter(Boolean);
    if (products.length === 0) return;
    setConfirmDelete({ kind: 'bulk', products });
  };

  const clearSelectedProducts = async (selectedProducts) => {
    const failedProducts = [];
    for (const product of selectedProducts) {
      const result = await clearProductStock(product.id, false, false);
      if (result !== true) failedProducts.push({ product, error: result });
    }
    try {
      await refreshStockData();
      await loadStockActivities();
      if (selectedProducts.length > failedProducts.length) onInventoryChanged?.();
      setStockError(failedProducts.length
        ? failedProducts.map(({ product, error }) => `${product.name}: ${error}`).join(' ')
        : '');
    } catch (error) {
      setStockError(error.message || 'The stock list could not be refreshed.');
    }
    setSelectedIds(new Set(
      stockFromDatabase
        .filter((row) => failedProducts.some(({ product }) => product.id === row.productId))
        .map((row) => row.id)
    ));
  };

  // Runs when the user presses the red button in the delete popup.
  const confirmDeleteAction = async () => {
    if (!confirmDelete || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (confirmDelete.kind === 'entry') {
        await deleteSingleEntry(confirmDelete.stock);
      } else if (confirmDelete.kind === 'bulk') {
        await clearSelectedProducts(confirmDelete.products);
      } else {
        await clearProductStock(confirmDelete.productId);
      }
    } finally {
      setDeleteBusy(false);
      setConfirmDelete(null);
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

  /* The counter is a positive quantity (never below 1). */
  const adjustQuantity = (amount) => {
    setFormData((prev) => {
      const current = Number.isInteger(Number(prev.qty)) ? Number(prev.qty) : 1;
      return { ...prev, qty: String(Math.max(1, current + amount)) };
    });
  };

  const handleSave = async (e, { confirmed = false } = {}) => {
    if (priceMissing()) {
      e?.preventDefault?.();
      setStockError(PRICE_REQUIRED_MESSAGE);
      return;
    }
    e?.preventDefault?.();

    /* No movements yet → the form is in Opening Stock mode: set the starting
       balance directly instead of recording a movement. */
    if (canSetOpeningStock) {
      await handleSaveOpeningStock();
      return;
    }

    /* Editing updates only the details (variant, price, notes, recorded by)
       and keeps the entry's quantity as it is. Stock is changed with the
       − / + buttons in the QTY column, not here. */
    if (editId !== null) {
      try {
        const response = await apiFetch(`/api/stock-movements/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            detailsOnly: true,
            variantName: formData.variantName || null,
            notes: formData.notes || null,
            recordedBy: formData.recordedBy || null,
            unitPrice: formData.unitPrice === '' ? null : Number(formData.unitPrice),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const validationError = result.errors ? Object.values(result.errors).flat()[0] : result.message;
          throw new Error(validationError || `Save failed (${response.status}).`);
        }
        setStockError('');
        closeModal();
        await refreshStockData();
        await loadStockActivities();
        if (historyProduct && historyProduct !== '—') await loadStockActivities(historyProduct);
      } catch (error) {
        setStockError(error.message || 'Could not save the changes.');
      }
      return;
    }

    /* Quantity is a positive number; the Type decides Stock In or Stock Out. */
    const amount = Number(formData.qty);
    if (!Number.isInteger(amount) || amount < 1) {
      setStockError('Enter a quantity of 1 or more.');
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

    // Safety-stock confirmation: the sale is allowed, but only after the user
    // confirms they want to use the units kept in reserve.
    if (isStockOut && safetyReached && !confirmed) {
      setConfirmSale({ ...safetyReached, productName: formData.productName });
      return;
    }
    setConfirmSale(null);

    const crossedSafety = safetyCrossing;   // captured before saving
    const payload = {
      productId: formData.productId,
      productName: formData.productName,
      variantName: formData.variantName,
      notes: formData.notes || null,
      recordedBy: formData.recordedBy || null,
      date: formData.date || null,
      type: isStockOut ? 'Stock Out' : 'Stock In',
      qty: amount,
      unitPrice: formData.unitPrice === '' ? null : Number(formData.unitPrice),
    };

    try {
      const response = await apiFetch(editId === null ? '/api/stock-movements' : `/api/stock-movements/${editId}`, {
        method: editId === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationError = result.errors ? Object.values(result.errors).flat()[0] : result.message;
        throw new Error(validationError || `Save failed (${response.status}).`);
      }

      closeModal();
      if (result.merged) {
        const sign = payload.type === 'Stock Out' ? '−' : '+';
        setMergeNotice(
          `${payload.productName}: ${sign}${result.addedQty} was added to today's entry `
          + `(${sign}${result.mergedFromQty} → ${sign}${result.qty}), so no new row was created.`
        );
      } else {
        setMergeNotice('');
      }
      setSafetyAlert(crossedSafety
        ? { ...crossedSafety, productId: payload.productId, productName: payload.productName }
        : null);
      await refreshStockData();
      await loadStockActivities();
      if (historyProduct && historyProduct !== '—') await loadStockActivities(historyProduct);
      onInventoryChanged?.();
    } catch (error) {
      console.error('Could not save stock movement:', error);
      setStockError(error.message || 'Could not save stock movement.');
    }
  };

  /* ===== QUICK − / + / ✓ (QTY column) =====
     − and + only change a draft amount for that row (nothing is saved yet),
     so they can be pressed many times. ✓ creates a distinct ledger movement
     for the selected row's product and variant. The source movement ID is
     checked by the backend, and quick adjustments never merge into another
     same-day row. Stock remains a product-wide balance. */
  // Draft amount per row id, e.g. { 12: +3, 15: -2 }. Not saved until ✓.
  const [pendingQty, setPendingQty] = useState({});
  const pendingFor = (rowId) => pendingQty[rowId] || 0;

  const stepPending = (row, direction) => {
    // A typed count is waiting: − / + adjust that count instead.
    if (typedQty[row.id] !== undefined) {
      const current = Number.parseInt(typedQty[row.id], 10);
      const base = Number.isFinite(current) ? current : variantStockOf(row);
      setTypedQty((prev) => ({ ...prev, [row.id]: String(Math.max(0, base + direction)) }));
      return;
    }
    const product = productById.get(row.productId);
    const onHand = Number(product?.stock);
    if (!Number.isInteger(onHand)) return;
    const variantOnHand = variantStockOf(row);
    setPendingQty((prev) => {
      const next = (prev[row.id] || 0) + direction;
      if (onHand + next < 0 || variantOnHand + next < 0) return prev; // never below 0 on hand
      const updated = { ...prev };
      if (next === 0) delete updated[row.id];
      else updated[row.id] = next;
      return updated;
    });
  };

  /* ===== TYPED COUNT (the QTY box) =====
     Clicking the number and typing the real count saves a Correction for
     that product + variant (a physical count — not counted as a sale).
     − / + without typing still save Stock In / Stock Out exactly as before. */
  const [typedQty, setTypedQty] = useState({});   // e.g. { 12: '4' }
  const variantStockOf = (row) => variantData.stockByKey.get(variantKeyOf(row)) ?? 0;
  const typedCountFor = (rowId) => {
    const value = Number.parseInt(typedQty[rowId] ?? '', 10);
    return Number.isFinite(value) ? value : null;
  };
  const typeCount = (row, raw) => {
    const text = String(raw).replace(/\s+/g, '');
    if (!/^\d{0,6}$/.test(text)) return;
    setPendingQty((prev) => { const next = { ...prev }; delete next[row.id]; return next; });
    setTypedQty((prev) => ({ ...prev, [row.id]: text }));
  };
  const clearTyped = (rowId) => setTypedQty((prev) => { const next = { ...prev }; delete next[rowId]; return next; });
  /* Leaving the box empty or unchanged puts the saved count back. */
  const tidyTyped = (row) => {
    const value = typedCountFor(row.id);
    if (typedQty[row.id] !== undefined && (value === null || value === variantStockOf(row))) clearTyped(row.id);
  };

  const applyCount = async (row) => {
    const product = productById.get(row.productId);
    const counted = typedCountFor(row.id);
    const variantOnHand = variantStockOf(row);
    if (!product || counted === null || counted === variantOnHand || quickBusy.has(row.id)) return;
    const before = Number(product.stock);
    // The server's correction rule sets the PRODUCT total to the counted
    // number, so send the total changed by this variant's difference.
    const after = before + (counted - variantOnHand);
    if (!Number.isInteger(before) || after < 0) {
      setStockError(`${product.name} has only ${before} on hand in total — this count would make it negative.`);
      return;
    }
    const safetyInfo = { productId: product.id, productName: product.name, safetyStock: product.safetyStock };
    const crossed = after < before ? safetyCrossingFor(safetyInfo, before, after, safetyStock) : null;

    setQuickBusy((prev) => new Set(prev).add(row.id));
    try {
      const response = await apiFetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          variantName: row.variantName || null,
          type: 'Adjustment',
          countedStock: after,
          notes: null,
          recordedBy: currentUserName || null,
          date: todayLocal(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationError = result.errors ? Object.values(result.errors).flat()[0] : result.message;
        throw new Error(validationError || `Could not save the count (${response.status}).`);
      }
      clearTyped(row.id);
      setStockError('');
      setMergeNotice('');
      setSafetyAlert(crossed ? { ...crossed, productId: product.id, productName: product.name } : null);
      await refreshStockData();
      await loadStockActivities();
      if (historyProduct && historyProduct !== '—') await loadStockActivities(historyProduct);
      onInventoryChanged?.();
    } catch (error) {
      setStockError(error.message || 'Could not save the count.');
    } finally {
      setQuickBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const clearPending = (rowId) => {
    setPendingQty((prev) => {
      const updated = { ...prev };
      delete updated[rowId];
      return updated;
    });
  };

  const lastPriceFor = (productId, type) => {
    let latest = null;
    stockFromDatabase.forEach((row) => {
      if (row.productId !== productId || row.type !== type || row.unitPrice == null) return;
      if (!latest
        || new Date(row.date) - new Date(latest.date) > 0
        || (row.date === latest.date && Number(row.id) > Number(latest.id))) {
        latest = row;
      }
    });
    return latest ? Number(latest.unitPrice) : null;
  };

  const applyPending = async (row, { confirmed = false } = {}) => {
    const product = productById.get(row.productId);
    const amount = pendingFor(row.id);
    if (!product || amount === 0 || quickBusy.has(row.id)) return;

    const before = Number(product.stock);
    if (!Number.isInteger(before) || before < 0) {
      setStockError('This product does not have a valid stock balance. Refresh and try again.');
      return;
    }
    const after = before + amount;
    if (after < 0) {
      setStockError(`Only ${before} of ${product.name} on hand — you can't deduct ${Math.abs(amount)}.`);
      return;
    }

    const safetyInfo = { productId: product.id, productName: product.name, safetyStock: product.safetyStock };
    if (amount < 0 && !confirmed) {
      const reached = safetyReachedFor(safetyInfo, before, after, safetyStock);
      if (reached) {
        setConfirmSale({ ...reached, productName: product.name, quick: { row } });
        return;
      }
    }
    setConfirmSale(null);
    const crossed = amount < 0 ? safetyCrossingFor(safetyInfo, before, after, safetyStock) : null;

    const type = amount > 0 ? 'Stock In' : 'Stock Out';
    // Unit price stays the same per unit: reuse the last price recorded for
    // this product and type, then this row's price, then 0.
    const unitPrice = lastPriceFor(product.id, type) ?? (row.unitPrice != null ? Number(row.unitPrice) : 0);

    setQuickBusy((prev) => new Set(prev).add(row.id));
    try {
      const response = await apiFetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          sourceMovementId: row.id,
          mergeSameDay: false,
          variantName: row.variantName || null,
          type,
          qty: Math.abs(amount),
          unitPrice,
          notes: null,
          recordedBy: currentUserName || null,
          date: todayLocal(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationError = result.errors ? Object.values(result.errors).flat()[0] : result.message;
        throw new Error(validationError || `Could not update the quantity (${response.status}).`);
      }
      clearPending(row.id);
      setStockError('');
      setMergeNotice('');
      setSafetyAlert(crossed ? { ...crossed, productId: product.id, productName: product.name } : null);
      await refreshStockData();
      await loadStockActivities();
      if (historyProduct && historyProduct !== '—') await loadStockActivities(historyProduct);
      onInventoryChanged?.();
    } catch (error) {
      setStockError(error.message || 'Could not update the quantity.');
    } finally {
      setQuickBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  /* Unit Price field: beside Notes on a new entry, beside Category when editing. */
  const unitPriceField = (
    <>
                      <label htmlFor="unitPrice">
                        Unit Price ({currencySymbol}) {!editingCorrection && <span className="sc-required">*</span>}
                      </label>
                      <input
                        id="unitPrice"
                        name="unitPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={formData.unitPrice}
                        onChange={handleFormChange}
                        placeholder="e.g. 299.00"
                        required={!editingCorrection}
                      />
                      {/* Helper text until a price is typed; then the computed total,
                          which stays visible even with field descriptions turned off. */}
                      <span className={`sc-field-hint${formData.unitPrice === '' || !(Number(formData.unitPrice) >= 0) ? '' : ' sc-field-total'}`}>
                        {(() => {
                          if (formData.unitPrice === '' || !(Number(formData.unitPrice) >= 0)) {
                            return 'Required · cost per unit (Stock In) or selling price per unit (Stock Out).';
                          }
                          const units = canSetOpeningStock ? Number(openingStock) : Math.abs(Number(projectedChange));
                          return Number.isFinite(units) && units > 0
                            ? `Total: ${formatCurrency(Number(formData.unitPrice) * units)} for ${units} unit${units === 1 ? '' : 's'}`
                            : `${formatCurrency(Number(formData.unitPrice))} per unit`;
                        })()}
                      </span>
    </>
  );

  return (
    <div className="sc-table-parent">

      {/* ===== TABS: Stock (manage inventory) | History (change log) ===== */}
      <div className="sc-view-tabs" role="tablist" aria-label="Stock Control view">
        <button type="button" role="tab" aria-selected={view === 'stock'} className={view === 'stock' ? 'is-active' : ''} onClick={() => setView('stock')}>
          <Package size={13} aria-hidden="true" /> Stock
        </button>
        <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>
          <History size={13} aria-hidden="true" /> History
        </button>
      </div>

      {/* ===== SEARCH BAR ===== */}
      <div className="sc-navigation-bar">
        <div className="sc-search-wrapper">
          {/* Preset searches: the categories your products already use. */}
          <SearchSuggestions
            query={query}
            suggestions={productOptions.map((product) => product.category)}
            onPick={setQuery}
            label="Categories"
          >
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
          </SearchSuggestions>
        </div>

        {canExportStock && (
        <button
          className="sc-add-btn sc-icon-only"
          onClick={exportStockReport}
          type="button"
          disabled={visibleRows.length === 0}
          title="Export the current view to a formatted Excel report"
          aria-label="Export Excel report"
        >
          <Download size={14} />
        </button>
        )}

        {/* ===== SORT DROPDOWN (icon button, Stock tab) ===== */}
        {view === 'stock' && (
        <div className="sc-sort-wrap">
          <button
            className="sc-add-btn sc-icon-only"
            onClick={() => setSortMenuOpen((o) => !o)}
            type="button"
            title="Sort movements"
            aria-label="Sort movements"
            aria-expanded={sortMenuOpen}
          >
            <ArrowUpDown size={14} />
          </button>
          {sortMenuOpen && (
            <div className="sc-sort-menu" role="menu">
              {[
                { key: 'date', label: 'Date' },
                { key: 'product', label: 'Product' },
                { key: 'total', label: 'QTY' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortBy === opt.key}
                  className={`sc-sort-item${sortBy === opt.key ? ' is-active' : ''}`}
                  onClick={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                >
                  {opt.label}
                </button>
              ))}
              <div className="sc-sort-divider" />
              <button
                type="button"
                className="sc-sort-item"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
              </button>
            </div>
          )}
        </div>
        )}

        {canClearStock && selectedProductIds.length > 0 && (
          <button
            className="sc-add-btn sc-delete-selected-btn sc-add-collapse"
            onClick={requestClearSelectedProducts}
            type="button"
            data-count={selectedProductIds.length}
            aria-label={`Clear stock for ${selectedProductIds.length} selected product(s)`}
            title={`Clear stock for ${selectedProductIds.length} selected product(s)`}
          >
            <p>Clear stock ({selectedProductIds.length})</p>
            <Eraser size={12} />
          </button>
        )}
        {canAddStock && (
        <button className="sc-add-btn sc-add-btn-primary sc-add-collapse" onClick={openAddModal} type="button" title="Update Stock" aria-label="Update Stock">
          <p>Update Stock</p>
          <Plus size={12} className="sc-add-icon" />
        </button>
        )}
        {canViewActivity && (
        <button
          className="sc-add-btn sc-icon-only"
          onClick={() => {
            setShowActivity(true);
            loadStockActivities();
          }}
          type="button"
          title="View transaction & activity history"
          aria-label="Activity history"
        >
          <Activity size={14} />
        </button>
        )}
      </div>

      {stockError && (
        <div className="sc-error-banner" role="alert">
          <span>{stockError}</span>
          <button type="button" onClick={() => refreshStockData().catch((error) => setStockError(error.message))}>Retry</button>
        </div>
      )}

      {mergeNotice && (
        <div className="sc-merge-notice" role="status">
          <span>{mergeNotice}</span>
          <button type="button" className="sc-safety-alert-close" onClick={() => setMergeNotice('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {safetyAlert && (
        <div className={`sc-safety-alert is-${safetyAlert.level}`} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>{safetyAlert.productName}</strong>
            {safetyAlert.level === 'out'
              ? ' is now out of stock.'
              : ` is now below safety stock — ${safetyAlert.after} left, minimum ${safetyAlert.safety}.`}
          </span>
          {canComputeEoq && onNavigate && (
            <button type="button" className="sc-safety-alert-order" onClick={orderFromSafetyAlert} disabled={safetyOrdering}>
              {safetyOrdering ? 'Loading forecast…' : 'Order Now'}
            </button>
          )}
          <button type="button" className="sc-safety-alert-close" onClick={() => setSafetyAlert(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ===== TABLE (Stock tab) ===== */}
      {view === 'stock' && (<>
      <MobileSelectBar
        total={pageRows.length}
        count={selectedIds.size}
        allSelected={allSelected}
        onToggleAll={toggleSelectAll}
        onClear={() => setSelectedIds(new Set())}
      />
      <div className="sc-table-scroll">
        <table className="sc-table m-folders">
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
              <th className="sc-th-quantity" title="Stock on hand for this product + variant. − / + save a Stock In / Stock Out; typing the real count saves a Correction.">QTY</th>
              <th className="sc-th-quantity" title="Unit price recorded on this transaction (cost on Stock In, selling price on Stock Out).">Price</th>
              <th>Reorder Point</th>
              <th className="sc-th-left">Notes</th>
              <th>Recorded by</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stockLoading ? (
              <tr><td colSpan={11} className="sc-empty-state">Loading stock movements…</td></tr>
            ) : pageRows.map(({ row: stock, id, totalQty, change, balanceAfter, variantStock }) => {
              const product = productById.get(stock.productId);
              const statusRow = {
                ...stock,
                safetyStock: product?.safetyStock,
                annualDemand: product?.annualDemand || product?.demandFromHistory,
                leadTimeDays: product?.leadTimeDays,
                remainingStock: totalQty,
              };
              const after = balanceAfter;
              const signedText = `${change >= 0 ? '+' : '-'}${Math.abs(change)}`;
              const status = stockStatusFor(statusRow, safetyStock);
              const point = reorderPointFor(statusRow, safetyStock);
              return (
                <tr
                  className={`${status ? `sc-row-${status}` : ''} ${selectedIds.has(id) ? 'is-selected' : ''} ${highlightId && stock.productId === highlightId ? 'sc-row-highlight' : ''}`}
                  key={id}
                >
                  <td className="sc-td-check m-keep">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(id)}
                      onChange={() => toggleSelectRow(id)}
                      aria-label={`Select movement ${id}`}
                    />
                  </td>
                  <td className="sc-td-nowrap" data-label="Date">{stock.date}</td>
                  <td className="sc-td-left sc-cell-name m-title" data-label="Product" title={stock.productName}>
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
                      {stock.productDeleted && <small className="sc-deleted-tag" title="This product was deleted. The entry stays as history and can't be edited.">(deleted product)</small>}
                    </span>
                  </td>
                  <td data-label="Variant">{stock.variantName || '—'}</td>
                  <td className="m-peek" data-label="Type">
                    <span
                      className={`sc-type-pill sc-type-${(stock.type || '').replace(/\s+/g, '').toLowerCase()}`}
                      title={`${movementLabel(stock.type)} on ${stock.date}: ${signedText} units`}
                    >
                      {movementLabel(stock.type)}
                    </span>
                  </td>
                  <td className="sc-td-nowrap sc-td-strong" data-label="QTY">
                    {canAddStock && !stock.productDeleted ? (() => {
                      // QTY = this product + variant's own count (all variants together: totalQty).
                      const pending = pendingFor(id);
                      const typed = typedCountFor(id);
                      const isTyping = typedQty[id] !== undefined;
                      const busy = quickBusy.has(id);
                      const shown = isTyping ? typed ?? variantStock : variantStock + pending;
                      const countChange = isTyping && typed !== null ? typed - variantStock : 0;
                      const hasChange = isTyping ? countChange !== 0 : pending !== 0;
                      const pendingText = `${pending > 0 ? '+' : '−'}${Math.abs(pending)}`;
                      const save = () => (isTyping ? applyCount(stock) : applyPending(stock));
                      return (
                        <span className={`sc-qty-control sc-qty-typed${hasChange ? ' has-pending' : ''}`}>
                          <button
                            type="button"
                            className="sc-qty-btn sc-qty-minus"
                            onClick={() => stepPending(stock, -1)}
                            disabled={busy || !(shown > 0)}
                            aria-label={`Deduct one ${stock.productName}`}
                            title={shown > 0 ? (isTyping ? 'One less in your count' : 'Deduct 1 (press ✓ to save)') : 'Nothing left to deduct'}
                          >
                            −
                          </button>
                          <input
                            className={`sc-qty-input${isTyping ? ' is-count' : pending > 0 ? ' sc-in' : pending < 0 ? ' sc-out' : ''}`}
                            type="text"
                            inputMode="numeric"
                            value={isTyping ? typedQty[id] : String(shown)}
                            onChange={(e) => typeCount(stock, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => tidyTyped(stock)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); save(); }
                              if (e.key === 'Escape') { clearTyped(id); clearPending(id); }
                            }}
                            disabled={busy}
                            aria-label={`Quantity of ${stock.productName}${stock.variantName ? ` ${stock.variantName}` : ''} — type the real count to save a Correction`}
                            title={`${variantStock} on hand for this ${stock.variantName ? 'variant' : 'product'}${totalQty !== variantStock ? ` · ${totalQty} for the whole product` : ''}. Type the real count to save a Correction.`}
                          />
                          <button
                            type="button"
                            className="sc-qty-btn sc-qty-plus"
                            onClick={() => stepPending(stock, 1)}
                            disabled={busy}
                            aria-label={`Add one ${stock.productName}`}
                            title={isTyping ? 'One more in your count' : 'Add 1 (press ✓ to save)'}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="sc-qty-btn sc-qty-apply"
                            onClick={save}
                            disabled={busy || !hasChange}
                            aria-label={hasChange ? `Save the change for ${stock.productName}` : 'No change to save'}
                            title={!hasChange
                              ? 'Use − / + or type the real count, then press ✓'
                              : isTyping
                                ? `Save a Correction: ${variantStock} → ${typed}`
                                : `Save ${pendingText} (${pending > 0 ? 'Stock In' : 'Stock Out / sale'})`}
                          >
                            {busy ? '…' : <Check size={12} strokeWidth={3} />}
                          </button>
                          {hasChange && (
                            <small className={`sc-qty-hint ${(isTyping ? countChange : pending) > 0 ? 'sc-in' : 'sc-out'}`}>
                              {isTyping
                                ? `Correction ${countChange > 0 ? '+' : '−'}${Math.abs(countChange)}`
                                : `${pending > 0 ? 'Stock In' : 'Stock Out'} ${pendingText}`}
                            </small>
                          )}
                        </span>
                      );
                    })() : (
                      <span title={`${variantStock} on hand for this ${stock.variantName ? 'variant' : 'product'} · ${totalQty} for the whole product`}>{variantStock}</span>
                    )}
                  </td>
                  <td
                    className="sc-td-nowrap"
                    data-label="Price"
                    title={stock.unitPrice != null ? `${formatCurrency(stock.unitPrice)} × ${stock.qty} = ${formatCurrency(Number(stock.unitPrice) * Number(stock.qty || 0))}` : 'No price recorded'}
                  >
                    {stock.unitPrice != null ? formatCurrency(stock.unitPrice) : '—'}
                  </td>
                  <td data-label="Reorder Point">
                    {status ? (
                      <span
                        className={`sc-safety-badge sc-safety-${status}`}
                        title={`${statusRow.remainingStock} on hand now · reorder point ${point} (safety stock plus demand during lead time)`}
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
                      {/* Economic Order Quantity Calculator: follows the calculator box in Role Access */}
                      {canComputeEoq && !stock.productDeleted && status && status !== 'healthy' && (
                        <button
                          className="sc-table-action-btn sc-eoq-btn"
                          onClick={() => computeEoqFor(stock)}
                          aria-label={`Compute order quantity for ${stock.productName}`}
                          title={`Reorder needed — compute order quantity for ${stock.productName}`}
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
                      {canEditStock && !stock.productDeleted && (
                      <button
                        className="sc-table-action-btn sc-edit-btn"
                        onClick={() => openEditModal(id)}
                        aria-label="Edit Item"
                        title="Edit Item"
                        type="button"
                      >
                        <Edit size={14} />
                      </button>
                      )}
                      {canDeleteStock && !stock.productDeleted && (
                      <button
                        className="sc-table-action-btn sc-delete-btn"
                        onClick={() => requestDeleteSingleEntry(stock)}
                        aria-label={`Delete this entry for ${stock.productName}`}
                        title="Delete this entry only (stock goes back to before it)"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                      )}
                      {canClearStock && !stock.productDeleted && (
                      <button
                        className="sc-table-action-btn sc-delete-btn sc-clear-all-btn"
                        onClick={() => requestClearProductStock(stock.productId)}
                        aria-label={`Clear all stock records for ${stock.productName}`}
                        title={`Clear ALL stock and movement records for ${stock.productName}`}
                        type="button"
                      >
                        <Eraser size={14} />
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!stockLoading && !stockError && tableRows.length === 0 && (
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
      {!stockLoading && tableRows.length > PAGE_SIZE && (
        <nav className="sc-pager" aria-label="Stock movement pages">
          <span>
            Showing {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, tableRows.length).toLocaleString()} of {tableRows.length.toLocaleString()}
          </span>
          <span className="sc-pager-buttons">
            <button type="button" className="sc-add-btn" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Previous</button>
            <span aria-live="polite">Page {currentPage} of {pageCount}</span>
            <button type="button" className="sc-add-btn" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount}>Next</button>
          </span>
        </nav>
      )}
      </>)}

      {/* ===== HISTORY TAB: read-only log of stock changes ===== */}
      {view === 'history' && (<>
      <div className="sc-table-scroll">
        <table className="sc-table sc-history-table m-folders">
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th className="sc-th-left">Product</th>
              <th className="sc-th-left">Variant</th>
              <th className="sc-th-left">User</th>
              <th>Type</th>
              <th className="sc-th-quantity">Change</th>
              <th className="sc-th-quantity" title="Stock of this product + variant before and after the change.">Before → After</th>
            </tr>
          </thead>
          <tbody>
            {stockLoading ? (
              <tr><td colSpan={7} className="sc-empty-state">Loading stock history…</td></tr>
            ) : historyPageRows.map(({ row: stock, id, change }) => {
              const after = variantData.afterById.get(id) ?? 0;
              const before = after - change;
              return (
                <tr key={id}>
                  <td className="sc-td-nowrap" data-label="Date & time">{entryWhen(stock)}</td>
                  <td className="sc-td-left m-title" data-label="Product">
                    {stock.productName}
                    {stock.productDeleted && <small className="sc-deleted-tag"> (deleted product)</small>}
                  </td>
                  <td className="sc-td-left" data-label="Variant">{stock.variantName || '—'}</td>
                  <td className="sc-td-left" data-label="User">{stock.recordedBy || '—'}</td>
                  <td className="m-peek" data-label="Type">
                    <span className={`sc-type-pill sc-type-${(stock.type || '').replace(/\s+/g, '').toLowerCase()}`}>{movementLabel(stock.type)}</span>
                  </td>
                  <td className="sc-td-nowrap sc-td-strong" data-label="Change">
                    <span className={change >= 0 ? 'sc-in' : 'sc-out'}>{change >= 0 ? '+' : '−'}{Math.abs(change)}</span>
                  </td>
                  <td className="sc-td-nowrap" data-label="Before → After">{before} → {after}</td>
                </tr>
              );
            })}
            {!stockLoading && !stockError && historyRows.length === 0 && (
              <tr>
                <td colSpan={7} className="sc-empty-state">
                  {stockFromDatabase.length === 0 ? 'No stock changes recorded yet.' : 'No changes match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!stockLoading && historyRows.length > PAGE_SIZE && (
        <nav className="sc-pager" aria-label="Stock history pages">
          <span>
            Showing {((currentHistoryPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentHistoryPage * PAGE_SIZE, historyRows.length).toLocaleString()} of {historyRows.length.toLocaleString()}
          </span>
          <span className="sc-pager-buttons">
            <button type="button" className="sc-add-btn" onClick={() => setHistoryPage(currentHistoryPage - 1)} disabled={currentHistoryPage <= 1}>Previous</button>
            <span aria-live="polite">Page {currentHistoryPage} of {historyPageCount}</span>
            <button type="button" className="sc-add-btn" onClick={() => setHistoryPage(currentHistoryPage + 1)} disabled={currentHistoryPage >= historyPageCount}>Next</button>
          </span>
        </nav>
      )}
      </>)}

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
                      ? 'Change the details of this entry. To change the quantity, use − / + in the QTY column.'
                      : canSetOpeningStock
                        ? 'This product has no movements yet. Set its starting quantity on hand.'
                        : 'Pick a product, choose Stock In or Stock Out, then enter how many.'}
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
                      <input id="date" name="date" type="date" value={formData.date} onChange={handleFormChange} max={todayLocal()} required disabled={editId !== null} />
                    </div>
                    <div className="sc-form-group">
                      <label htmlFor="recordedBy">Recorded by</label>
                      <input
                        id="recordedBy"
                        name="recordedBy"
                        value={formData.recordedBy}
                        readOnly
                        aria-readonly="true"
                        title="Filled in automatically from the signed-in account"
                        placeholder="Signed-in user"
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
                        disabled={editId !== null}
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

                      <label htmlFor="variantName">Variant</label>
                      <select
                        id="variantName"
                        name="variantName"
                        value={formData.variantName}
                        onChange={(e) => setFormData({ ...formData, variantName: e.target.value })}
                        disabled={!formData.productId}
                      >
                        <option value="">
                          {!formData.productId
                            ? 'Select a product first'
                            : selectedVariantChoices.length
                              ? 'No specific variant'
                              : 'No variants — add them in Product & Supplier'}
                        </option>
                        {selectedVariantChoices.map((variant) => (
                          <option key={variant} value={variant}>{variant}</option>
                        ))}
                      </select>
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
                      ) : editId !== null ? (
                        /* Edit mode: no quantity changer (stock is changed with
                           − / + in the table's QTY column) and no Type field.
                           Unit Price takes this spot, beside Category. */
                        unitPriceField
                      ) : (
                        <>
                          <label htmlFor="type">
                            Type <span className="sc-required">*</span>
                          </label>
                          <select id="type" name="type" value={formData.type} onChange={handleFormChange} required>
                            <option value="Stock In">Stock In (Added)</option>
                            <option value="Stock Out">Stock Out (Sold)</option>
                          </select>
                          <label htmlFor="qty">
                            Quantity <span className="sc-required">*</span>
                          </label>
                          <div className="sc-stepper">
                            <button
                              type="button"
                              className="sc-stepper-btn sc-stepper-minus"
                              aria-label="Decrease quantity by one"
                              onClick={() => adjustQuantity(-1)}
                              disabled={!(Number(formData.qty) > 1)}
                              title="Decrease quantity by one"
                            >
                              <span>−</span>
                            </button>
                            <input
                              id="qty"
                              name="qty"
                              type="number"
                              className="sc-stepper-value"
                              aria-describedby="sc-qty-hint"
                              min="1"
                              max={isOut && currentOnHand !== null ? currentOnHand : undefined}
                              step="1"
                              value={formData.qty}
                              onChange={handleFormChange}
                              required
                            />
                            <button
                              type="button"
                              className="sc-stepper-btn sc-stepper-plus"
                              aria-label="Increase quantity by one"
                              onClick={() => adjustQuantity(1)}
                              disabled={isOut && currentOnHand !== null && Number(formData.qty) >= currentOnHand}
                              title="Increase quantity by one"
                            >
                              <span>+</span>
                            </button>
                          </div>
                          <span className="sc-field-hint" id="sc-qty-hint">
                            {!formData.productName
                              ? 'Select a product first.'
                              : isOut
                                ? `${currentOnHand} units on hand. You can sell up to ${currentOnHand}.`
                                : `${currentOnHand} units on hand. This many will be added.`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ===== PRICE + NOTES (below quantity) =====
                      New entry: Unit Price | Notes side by side.
                      Edit: Unit Price sits beside Category (above), and Notes
                      gets its own full-width last row. */}
                  <div className={editId === null ? 'sc-form-row' : 'sc-form-row sc-form-row-full'}>
                    {editId === null && <div className="sc-form-group">{unitPriceField}</div>}
                    <div className="sc-form-group">
                      <label htmlFor="notes">Notes</label>
                      {editId === null ? (
                        <input
                          id="notes"
                          name="notes"
                          value={formData.notes}
                          onChange={handleFormChange}
                          placeholder="Delivery reference, sales batch…"
                        />
                      ) : (
                        <textarea
                          id="notes"
                          name="notes"
                          rows={3}
                          maxLength={255}
                          value={formData.notes}
                          onChange={handleFormChange}
                          placeholder="Delivery reference, sales batch…"
                        />
                      )}
                    </div>
                  </div>
                </section>

                {/* Result preview only for new entries; editing keeps the quantity. */}
                {editId === null && (
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
                        <span className="sc-computed-empty">Pick a product and enter a quantity</span>
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
                        <small>≤{reorderPointFor({
                          ...formData,
                          annualDemand: productById.get(formData.productId)?.annualDemand
                            || productById.get(formData.productId)?.demandFromHistory,
                          leadTimeDays: productById.get(formData.productId)?.leadTimeDays,
                        }, safetyStock)}</small>
                      </span>
                      <span className="sc-status-preview-note">
                        {projectedStatus === 'healthy'
                          ? 'This entry keeps the item above its reorder point.'
                          : projectedStatus === 'low'
                            ? 'This entry puts the item at or below its reorder point — time to order.'
                            : projectedStatus === 'critical'
                              ? 'This entry puts the item at or below its safety stock.'
                              : 'This entry leaves the item out of stock.'}
                      </span>
                    </div>
                  )}

                </section>
                )}
              </div>

              {safetyReached && (
                <div className={`sc-safety-warning is-${safetyReached.level}`} role="alert">
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>
                    {safetyReached.level === 'out'
                      ? <>This leaves <strong>0</strong> of {formData.productName}. It will be <strong>out of stock</strong>.</>
                      : <>This leaves <strong>{safetyReached.after}</strong> of {formData.productName}, at or below its safety stock of <strong>{safetyReached.safety}</strong>.</>}
                    {' '}You’ll be asked to confirm before it’s saved.
                  </span>
                </div>
              )}

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
                      : !validMovementQuantity)
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
      {/* ===== SAFETY STOCK CONFIRMATION ===== */}
      {confirmDelete && createPortal(
        <div className="sc-modal-overlay sc-confirm-overlay" onClick={() => !deleteBusy && setConfirmDelete(null)}>
          <div
            className="sc-modal sc-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sc-delete-title"
            aria-describedby="sc-delete-text"
          >
            <span className="sc-confirm-icon is-out" aria-hidden="true">
              {confirmDelete.kind === 'entry' ? <Trash2 size={22} /> : <Eraser size={22} />}
            </span>
            {confirmDelete.kind === 'entry' ? (
              <>
                <h3 id="sc-delete-title">Delete this variant’s latest entry?</h3>
                <p id="sc-delete-text">
                  The stock will go back to what it was before this entry. Other entries are not affected. The entry moves to the Trash Bin, where it can be restored.
                  <span className="sc-confirm-detail">
                    {confirmDelete.stock.productName}
                    {confirmDelete.stock.variantName ? ` (${confirmDelete.stock.variantName})` : ''}
                    {' · '}{movementLabel(confirmDelete.stock.type)}{' '}
                    <strong>{confirmDelete.changeText}</strong>
                    {' · '}{confirmDelete.stock.date}
                  </span>
                </p>
              </>
            ) : confirmDelete.kind === 'bulk' ? (
              <>
                <h3 id="sc-delete-title">Clear stock for {confirmDelete.products.length} product{confirmDelete.products.length === 1 ? '' : 's'}?</h3>
                <p id="sc-delete-text">
                  This moves <strong>every</strong> stock entry for the selected products to the Trash Bin and sets their stock to 0.
                  <span className="sc-confirm-detail">
                    {confirmDelete.products.map((product) => product.name).join(', ')}
                    <br />The products themselves stay. Entries can be restored from the Trash Bin.
                  </span>
                </p>
              </>
            ) : (
              <>
                <h3 id="sc-delete-title">Clear all stock records?</h3>
                <p id="sc-delete-text">
                  This moves <strong>every</strong> stock entry for {confirmDelete.productName} to the Trash Bin and sets its stock to 0.
                  <span className="sc-confirm-detail">The product itself stays. Entries can be restored from the Trash Bin.</span>
                </p>
              </>
            )}
            <div className="sc-modal-actions">
              <button
                type="button"
                className="sc-modal-cancel-btn"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteBusy}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="sc-modal-save-btn sc-confirm-danger-btn"
                onClick={confirmDeleteAction}
                disabled={deleteBusy}
              >
                {deleteBusy
                  ? 'Deleting…'
                  : confirmDelete.kind === 'entry' ? 'Delete entry' : 'Clear all records'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmSale && createPortal(
        <div className="sc-modal-overlay sc-confirm-overlay" onClick={() => setConfirmSale(null)}>
          <div
            className="sc-modal sc-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sc-confirm-title"
            aria-describedby="sc-confirm-text"
          >
            <span className={`sc-confirm-icon is-${confirmSale.level}`} aria-hidden="true"><AlertTriangle size={22} /></span>
            <h3 id="sc-confirm-title">Stock has reached the safety stock level.</h3>
            <p id="sc-confirm-text">
              Do you still want to proceed with this sale?
              <span className="sc-confirm-detail">
                {confirmSale.productName}: {confirmSale.before} → <strong>{confirmSale.after}</strong> left
                {' '}(safety stock {confirmSale.safety}{confirmSale.level === 'out' ? ', this will be out of stock' : ''}).
              </span>
            </p>
            <div className="sc-modal-actions">
              <button type="button" className="sc-modal-cancel-btn" onClick={() => setConfirmSale(null)} autoFocus>
                Cancel
              </button>
              <button type="button" className="sc-modal-save-btn" onClick={() => (confirmSale.quick
                ? applyPending(confirmSale.quick.row, { confirmed: true })
                : handleSave(null, { confirmed: true }))}>
                Proceed with sale
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

              <h4 className="sc-product-activity-title">Activity Report</h4>
              {productActivityLoading ? (
                <div className="sc-empty-state">Loading product activity…</div>
              ) : productActivityError ? (
                <div className="sc-error-banner" role="alert">{productActivityError}</div>
              ) : productActivityLog.length > 0 ? (
                <ol className="sc-activity-list">
                  {productActivityLog.map((item) => {
                    const { Icon, cls, label } = activityPresentation(item);
                    return (
                      <li className="sc-activity-item" key={item.id}>
                        <span className={`sc-activity-dot ${cls}`}><Icon size={14} /></span>
                        <div className="sc-activity-main">
                          <div className="sc-activity-top">
                            <span className="sc-activity-action">{label}</span>
                          </div>
                          <div className="sc-activity-detail">{item.description}</div>
                          <div className="sc-activity-actor">By {item.userName || 'Unknown user'}</div>
                          <div className="sc-activity-time">
                            <Clock size={10} />
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                              : '—'}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="sc-empty-state">No stock activity recorded for this product yet.</div>
              )}
            </div>
          </div>
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
              {activityLoading ? (
                <div className="sc-empty-state">Loading stock activity…</div>
              ) : activityError ? (
                <div className="sc-error-banner" role="alert">{activityError}</div>
              ) : activityLog.length === 0 ? (
                <div className="sc-empty-state">
                  No activity yet. Adding, editing or deleting an entry will show up here.
                </div>
              ) : (
                <ol className="sc-activity-list">
                  {activityLog.map((item) => {
                    const { Icon, cls, label } = activityPresentation(item);
                    return (
                      <li className="sc-activity-item" key={item.id}>
                        <span className={`sc-activity-dot ${cls}`}>
                          <Icon size={14} />
                        </span>
                        <div className="sc-activity-main">
                          <div className="sc-activity-top">
                            <span className="sc-activity-action">{label}</span>
                            <span className="sc-activity-product">{item.meta?.product || '—'}</span>
                          </div>
                          <div className="sc-activity-detail">{item.description}</div>
                          <div className="sc-activity-actor">By {item.userName || 'Unknown user'}</div>
                          <div className="sc-activity-time">
                            <Clock size={10} />
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                              : '—'}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {!activityLoading && !activityError && activityLog.length > 0 && (
              <div className="sc-drawer-footer">
                <span className="sc-drawer-count">{activityLog.length} record{activityLog.length !== 1 ? 's' : ''}</span>
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