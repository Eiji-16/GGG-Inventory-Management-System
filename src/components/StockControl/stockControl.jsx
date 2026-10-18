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
  ArrowUpDown,
  Package } from 'lucide-react';

import './stockControl.css';
import apiFetch from '../../apiFetch';
import {
  SAFETY_STOCK_DEFAULTS,
  safetyPointFor,
  reorderPointFor,
  stockStatusFor,
  annualDemandFor,
  policyFor,
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

const activityPresentation = (item) => {
  if (item.action === 'stock.clear') return { Icon: Trash2, cls: 'sc-act-delete', label: 'Cleared' };
  if (item.action === 'stock.edit') return { Icon: Pencil, cls: 'sc-act-edit', label: 'Updated' };
  if (item.action === 'stock.delete') return { Icon: Trash2, cls: 'sc-act-delete', label: 'Deleted' };
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
}) {
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
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null); /* row to flash from a Dashboard handoff */

  const loadStockActivities = async (productId = null) => {
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

    setQuery('');            // clear any filter so the row is visible
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
    }));
    // Seed the opening-stock editor with the product's current balance.
    setOpeningStock(picked ? String(picked.stock ?? 0) : '');
  };

  const productById = useMemo(() => new Map(productOptions.map((product) => [product.id, product])), [productOptions]);
  const reorderPlans = useMemo(() => productOptions.map((product) => {
    const policy = policyFor({ productId: product.id, productName: product.name }, safetyStock);
    const safetyStockValue = safetyPointFor({
      productId: product.id,
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
    const reorderPoint = reorderPointFor({
      productId: product.id,
      productName: product.name,
      safetyStock: safetyStockValue,
      annualDemand: annualDemandValue,
      leadTimeDays: policy.leadTimeDays,
    }, safetyStock);
    const reorderDue = currentStock <= reorderPoint;

    return {
      id: product.id,
      name: product.name,
      currentStock,
      safetyStock: safetyStockValue,
      reorderPoint,
      maximumInventory,
      suggestedTopUp: reorderDue && maximumInventory !== null
        ? Math.max(0, maximumInventory - currentStock)
        : null,
      reorderDue,
    };
  }), [productOptions, safetyStock]);
  const reorderSummary = useMemo(() => reorderPlans.reduce((summary, plan) => {
    if (!plan.reorderDue) {
      summary.healthy += 1;
    } else if (plan.maximumInventory === null) {
      summary.needsSetup += 1;
    } else {
      summary.reorderNow += 1;
    }
    return summary;
  }, { total: reorderPlans.length, healthy: 0, needsSetup: 0, reorderNow: 0 }), [reorderPlans]);

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
     The signed quantity is the movement: positive adds stock, negative removes it. */
  const parsedQty = formData.qty === '' ? null : Number(formData.qty);
  const projectedChange = Number.isInteger(parsedQty) ? parsedQty : null;
  const isOut = projectedChange !== null && projectedChange < 0;
  const validMovementQuantity = projectedChange !== null
    && projectedChange !== 0
    && currentOnHand !== null
    && projectedChange >= -currentOnHand;

  const projectedRemaining = !formData.productName || currentOnHand === null || projectedChange === null
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
      annualDemand: productById.get(formData.productId)?.annualDemand
        || productById.get(formData.productId)?.demandFromHistory,
      leadTimeDays: productById.get(formData.productId)?.leadTimeDays,
      remainingStock: projectedRemaining,
    }, safetyStock);

  /* ===== SEND TO CALCULATOR ===== */
  const computeEoqFor = (row) => {
    if (!onNavigate) return;
    onNavigate('Auto-Calculator', {
      product: row.productName,
      productId: row.productId,
    annualDemand: productById.get(row.productId)?.annualDemand
      || annualDemandFor(row.productId, safetyStock, row.productName),
    });
  };

  const visibleRows = useMemo(() => {
  const q = query.trim().toLowerCase();
  const filtered = stockFromDatabase.filter((row) =>
    !q || [row.productName, row.category, row.type, row.notes, row.recordedBy, row.date]
      .some((field) => String(field || '').toLowerCase().includes(q))
  );

  // Keep a fallback current balance for movements whose product record cannot
  // be matched by ID. Use the full ledger, not the filtered rows.
  const ordered = [...stockFromDatabase].sort((a, b) =>
    new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id)
  );
  const latestTotals = new Map();
  const latestChanges = new Map();
  ordered.forEach((row) => {
    const key = row.productId || row.productName || '—';
    latestTotals.set(key, row.remainingStock);
    latestChanges.set(key, { delta: signedQty(row), type: row.type, date: row.date });
  });

  // Show the latest movement's change on every row for the product; total qty
  // remains the product's current overall balance.
  const mapped = filtered.map((row) => {
    const key = row.productId || row.productName || '—';
    const product = productById.get(row.productId)
      || productOptions.find((item) => item.name === row.productName);
    const productStock = row.totalQty ?? product?.stock;
    const latestTotal = latestTotals.get(key);
    const total = productStock !== null && productStock !== '' && Number.isFinite(Number(productStock))
      ? Number(productStock)
      : latestTotal !== null && latestTotal !== '' && Number.isFinite(Number(latestTotal))
        ? Number(latestTotal)
        : 0;
    return {
      row,
      id: row.id,
      totalQty: total,
      latestChange: latestChanges.get(key) || {
        delta: signedQty(row),
        type: row.type,
        date: row.date,
      },
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
      case 'change':
        cmp = a.latestChange.delta - b.latestChange.delta;
        break;
      case 'total':
        cmp = a.totalQty - b.totalQty;
        break;
      case 'date':
      default:
        cmp = (new Date(a.row.date) - new Date(b.row.date)) || (Number(a.id) - Number(b.id));
        break;
    }
    return cmp * dir;
  });

  return mapped;
}, [stockFromDatabase, query, productById, productOptions, sortBy, sortDir]);

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
    const headers = ['Date', 'Product', 'Variant', 'Type', 'Changes', 'Total Qty', 'Stock Status', 'Notes', 'Recorded By'];
    const exportedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const uniqueProducts = new Set(visibleRows.map(({ row }) => row.productId)).size;
    const stockInCount = visibleRows.filter(({ row }) => row.type === 'Stock In').length;
    const stockOutCount = visibleRows.filter(({ row }) => row.type === 'Stock Out').length;
    const bodyRows = visibleRows.map(({ row, totalQty, latestChange }) => {
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
          latestChange.delta,
          totalQty,
          STATUS_LABEL[status] || status,
          row.notes || '—',
          row.recordedBy || '—',
        ],
        status,
      };
    });

    const rows = [
      ['GGG INVENTORY MANAGEMENT SYSTEM'],
      ['STOCK MOVEMENT REPORT'],
      [`Generated: ${exportedAt}`, '', '', '', '', '', '', '', `Records: ${visibleRows.length}`],
      ['MOVEMENT SUMMARY', '', '', '', '', '', '', '', ''],
      [],
      [],
      ['MOVEMENT RECORDS', '', '', '', '', '', '', '', ''],
      headers,
      ...bodyRows.map(({ values }) => values),
      [],
      ['Report scope', query.trim() ? `Filtered by: ${query.trim()}` : 'All records in the current view'],
      ['Note', 'Change shows the latest signed movement for the product; Total Qty shows its current overall stock.'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const lastDataRow = 7 + bodyRows.length;

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 8 } },
      { s: { r: 9 + bodyRows.length, c: 1 }, e: { r: 9 + bodyRows.length, c: 8 } },
      { s: { r: 10 + bodyRows.length, c: 1 }, e: { r: 10 + bodyRows.length, c: 8 } },
    ];
    worksheet['!cols'] = [
      { wch: 17 }, { wch: 25 }, { wch: 17 }, { wch: 16 }, { wch: 13 },
      { wch: 14 }, { wch: 17 }, { wch: 34 }, { wch: 20 },
    ];
    worksheet['!rows'] = [
      { hpt: 30 }, { hpt: 25 }, { hpt: 22 }, { hpt: 21 }, { hpt: 22 }, { hpt: 30 },
      { hpt: 22 }, { hpt: 25 },
      ...bodyRows.map(() => ({ hpt: 22 })),
    ];
    worksheet['!autofilter'] = { ref: `A8:I${lastDataRow + 1}` };
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
    setCellStyle('I3', {
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
      ['G', 'I', 'Stock Out', stockOutCount],
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
      .filter((row) => selectedIds.has(row.id))
      .map((row) => row.productId)
  )];

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
    setFormData({ ...emptyForm, date: todayLocal(), qty: '0' });
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
      const response = await apiFetch('/api/stock-movements', {
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
      notes: movement.notes || '',
      recordedBy: movement.recordedBy || '',
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
    if (!window.confirm(`Clear ${product.name}'s stock balance and movement records? Product information will remain.`)) return;
    await clearProductStock(productId);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditId(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /* The counter stores a signed change: positive adds stock, negative removes it. */
  const adjustQuantity = (amount) => {
    setFormData((prev) => ({
      ...prev,
      qty: String((Number.isInteger(Number(prev.qty)) ? Number(prev.qty) : 0) + amount),
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

    /* The signed quantity determines whether this is Stock In or Stock Out. */
    const signedAmount = Number(formData.qty);

    if (!Number.isInteger(signedAmount) || signedAmount === 0) {
      setStockError('Use + or − to enter a non-zero stock change.');
      return;
    }

    if (currentOnHand === null || currentOnHand < 0) {
      setStockError('The selected product does not have a valid current stock balance. Refresh stock data and try again.');
      return;
    }

    const isStockOut = signedAmount < 0;
    const amount = Math.abs(signedAmount);
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
      await refreshStockData();
      await loadStockActivities();
      if (historyProduct && historyProduct !== '—') await loadStockActivities(historyProduct);
      onInventoryChanged?.();
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
          className="sc-add-btn sc-icon-only"
          onClick={exportStockReport}
          type="button"
          disabled={visibleRows.length === 0}
          title="Export the current view to a formatted Excel report"
          aria-label="Export Excel report"
        >
          <Download size={14} />
        </button>

        {/* ===== SORT DROPDOWN (icon button) ===== */}
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
                { key: 'change', label: 'Change' },
                { key: 'total', label: 'Total Qty' },
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

        {selectedIds.size > 0 && (
          <button
            className="sc-add-btn sc-delete-selected-btn"
            onClick={async () => {
              const selectedProducts = selectedProductIds
                .map((productId) => productById.get(productId))
                .filter(Boolean);
              const confirmed = window.confirm(
                `Clear stock balances and movement records for ${selectedProducts.length} selected product(s)? Product information will remain.`
              );
              if (!confirmed) return;
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
            }}
            type="button"
            title={`Clear stock for ${selectedProductIds.length} selected product(s)`}
          >
            <p>Clear stock ({selectedProductIds.length})</p>
            <Trash2 size={12} />
          </button>
        )}
        <button className="sc-add-btn sc-add-btn-primary" onClick={openAddModal} type="button">
          <p>Update Stock</p>
          <Plus size={12} className="sc-add-icon" />
        </button>
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
        <button
          className="sc-add-btn sc-icon-only"
          onClick={() => setShowReorderPlan(true)}
          type="button"
          title="View maximum inventory and reorder planning"
          aria-label="Reorder plan"
        >
          <Info size={14} />
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
              <th className="sc-th-quantity" title="Latest signed change for this product.">Change</th>
              <th className="sc-th-quantity" title="Current total stock for this product.">Total Qty</th>
              <th>Reorder Point</th>
              <th className="sc-th-left">Notes</th>
              <th>Recorded by</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stockLoading ? (
              <tr><td colSpan={11} className="sc-empty-state">Loading stock movements…</td></tr>
            ) : visibleRows.map(({ row: stock, id, totalQty, latestChange }) => {
              const product = productById.get(stock.productId);
              const statusRow = {
                ...stock,
                safetyStock: product?.safetyStock,
                annualDemand: product?.annualDemand || product?.demandFromHistory,
                leadTimeDays: product?.leadTimeDays,
                remainingStock: totalQty,
              };
              const change = latestChange.delta;
              const after = totalQty;
              const signedText = `${change >= 0 ? '+' : '-'}${Math.abs(change)}`;
              const status = stockStatusFor(statusRow, safetyStock);
              const point = reorderPointFor(statusRow, safetyStock);
              return (
                <tr
                  className={`${status ? `sc-row-${status}` : ''} ${selectedIds.has(id) ? 'is-selected' : ''} ${highlightId && stock.productId === highlightId ? 'sc-row-highlight' : ''}`}
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
                      className={`sc-qty-change ${latestChange.type === 'Adjustment' ? 'sc-adj' : change >= 0 ? 'sc-in' : 'sc-out'}`}
                      title={`Latest change for ${stock.productName}: ${latestChange.date} (${latestChange.type})`}
                    >
                      {signedText}
                    </span>
                  </td>
                  <td className="sc-td-nowrap sc-td-strong" data-label="Total Qty">{after}</td>
                  <td data-label="Reorder Point">
                    {status ? (
                      <span
                        className={`sc-safety-badge sc-safety-${status}`}
                        title={`${statusRow.remainingStock} on hand · reorder point ${point} (safety stock plus demand during lead time)`}
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
                        onClick={() => requestClearProductStock(stock.productId)}
                        aria-label={`Clear stock for ${stock.productName}`}
                        title="Clear product stock and movement records"
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
                            Change Quantity (+ / −) <span className="sc-required">*</span>
                          </label>
                          <div className="sc-stepper">
                            <button
                              type="button"
                              className="sc-stepper-btn sc-stepper-minus"
                              aria-label="Decrease change quantity by one"
                              onClick={() => adjustQuantity(-1)}
                              disabled={currentOnHand !== null && Number(formData.qty) <= -currentOnHand}
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
                              min={currentOnHand === null ? undefined : -currentOnHand}
                              step="1"
                              value={formData.qty}
                              onChange={handleFormChange}
                              required
                            />
                            <button
                              type="button"
                              className="sc-stepper-btn sc-stepper-plus"
                              aria-label="Increase change quantity by one"
                              onClick={() => adjustQuantity(1)}
                              title="Increase quantity by one"
                            >
                              <span>+</span>
                            </button>
                          </div>
                          <span className="sc-field-hint" id="sc-qty-hint">
                            {!formData.productName
                              ? 'Select a product first.'
                              : editId === null
                                ? `${currentOnHand} units on hand. + adds one; − removes one. Negative quantities record stock out.`
                                : `${currentOnHand} units currently on hand. Saving applies this signed change; total after save: ${projectedRemaining ?? '—'} units.`}
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
                          : 'This entry puts the item at or below its reorder point — the row will be flagged and a Compute EOQ shortcut appears.'}
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
                    Reorder point = safety stock + daily demand × lead time. Maximum inventory = safety stock + daily demand × (lead time + order cycle).
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
              <section className="sc-reorder-overview" aria-label="Reorder plan overview">
                <div className="sc-reorder-overview-card">
                  <span className="sc-reorder-overview-label">Products tracked</span>
                  <strong>{reorderSummary.total}</strong>
                  <small>items in your catalog</small>
                </div>
                <div className="sc-reorder-overview-card sc-reorder-overview-alert">
                  <span className="sc-reorder-overview-label">Ready to reorder</span>
                  <strong>{reorderSummary.reorderNow}</strong>
                  <small>below trigger with a target set</small>
                </div>
                <div className="sc-reorder-overview-card sc-reorder-overview-setup">
                  <span className="sc-reorder-overview-label">Needs policy setup</span>
                  <strong>{reorderSummary.needsSetup}</strong>
                  <small>configure demand and order timing</small>
                </div>
                <div className="sc-reorder-overview-card sc-reorder-overview-good">
                  <span className="sc-reorder-overview-label">Above reorder point</span>
                  <strong>{reorderSummary.healthy}</strong>
                  <small>currently above the reorder point</small>
                </div>
              </section>

              <section className="sc-reorder-formula" aria-label="Maximum inventory formula">
                <span className="sc-reorder-formula-mark" aria-hidden="true">i</span>
                <div>
                  <strong>How the target is calculated</strong>
                  <p>
                    Reorder point = safety stock + (annual demand ÷ 365) × lead time.
                    Maximum inventory = safety stock + (annual demand ÷ 365) × (lead time + order cycle).
                    Suggested top-up is the amount needed to reach the maximum target when stock is at or below the reorder point.
                  </p>
                </div>
              </section>

              <div className="sc-reorder-section-heading">
                <div>
                  <h3>Product reorder status</h3>
                  <p>Stock levels and suggested replenishment by product.</p>
                </div>
                <span className="sc-reorder-product-count">{reorderSummary.total} products</span>
              </div>

              <div className="sc-reorder-table-scroll">
                <table className="sc-reorder-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Current stock</th>
                      <th>Reorder point</th>
                      <th>Maximum target</th>
                      <th>Recommended action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLoading ? (
                      <tr><td colSpan={5} className="sc-reorder-empty">Loading reorder plans…</td></tr>
                    ) : reorderPlans.length ? reorderPlans.map((plan) => (
                      <tr key={plan.id} className={plan.reorderDue ? 'is-reorder-due' : ''}>
                        <td>
                          <span className="sc-reorder-product-name">{plan.name}</span>
                          <span className={`sc-reorder-status ${plan.reorderDue
                            ? plan.maximumInventory === null ? 'is-setup' : 'is-due'
                            : 'is-healthy'}`}>
                            {plan.reorderDue
                              ? plan.maximumInventory === null ? 'Setup needed' : 'Reorder due'
                              : 'In range'}
                          </span>
                        </td>
                        <td>
                          <strong className={`sc-reorder-number${plan.reorderDue ? ' is-low' : ''}`}>{plan.currentStock}</strong>
                          <small>units on hand</small>
                        </td>
                        <td>
                          <strong className="sc-reorder-number">{plan.safetyStock}</strong>
                          <small>units minimum</small>
                        </td>
                        <td>
                          {plan.maximumInventory === null ? (
                            <span className="sc-reorder-unconfigured">Not configured</span>
                          ) : (
                            <>
                              <strong className="sc-reorder-number">{plan.maximumInventory}</strong>
                              <small>units target</small>
                            </>
                          )}
                        </td>
                        <td>
                          {plan.suggestedTopUp !== null ? (
                            <span className="sc-reorder-top-up">
                              <strong>+{plan.suggestedTopUp}</strong>
                              <small>units to order</small>
                            </span>
                          ) : plan.reorderDue ? (
                            <span className="sc-reorder-action-copy">Configure demand and order timing</span>
                          ) : (
                            <span className="sc-reorder-action-copy is-neutral">No reorder needed</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="sc-reorder-empty">No products available for reorder planning.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="sc-reorder-footnote">
                Suggested quantities use current on-hand stock only. EOQ is a separate cost-based quantity and does not change the reorder trigger or maximum target.
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