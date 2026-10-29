import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Trash2, X, Package, Info, Download, AlertTriangle, Upload, Image as ImageIcon, ArrowUpDown, Truck } from 'lucide-react';

import './productSupplier.css';
import SupplierRecords from './supplierRecords';
import MobileSelectBar from '../MobileSelectBar/MobileSelectBar';
import SearchSuggestions from '../SearchSuggestions/SearchSuggestions';
import apiFetch from '../../apiFetch';
import exportReportWorkbook from '../../utils/exportReportWorkbook';
import useFillToBottom from '../../utils/fillToBottom';
import useRowsThatFit from '../../utils/fitRows';
import { uiZoom } from '../../fontSize';



/* ===== EMPTY FORM ===== */
const emptyForm = {
  id: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  unitMeasure: '',
  image: '',
  variants: [], /* ===== VARIANTS (e.g. Black / M) ===== */
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

function ProductImagePreview({ src, name }) {
  const triggerRef = useRef(null);
  const previewRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    // Screen sizes ÷ zoom = page pixels (Settings → Font size).
    const zoom = uiZoom();
    const box = trigger.getBoundingClientRect();
    const bounds = { left: box.left / zoom, right: box.right / zoom, top: box.top / zoom, height: box.height / zoom };
    const viewportWidth = window.innerWidth / zoom;
    const viewportHeight = window.innerHeight / zoom;
    const previewWidth = Math.min(280, viewportWidth - 24);
    const fitsRight = bounds.right + previewWidth + 20 <= viewportWidth;
    const fitsLeft = bounds.left - previewWidth - 20 >= 0;
    const preferredLeft = fitsRight
      ? bounds.right + 8
      : fitsLeft
        ? bounds.left - previewWidth - 8
        : bounds.right + 8;
    const left = Math.max(12, Math.min(preferredLeft, viewportWidth - previewWidth - 12));
    const maxPreviewHeight = viewportHeight * 0.75;
    const centerY = bounds.top + bounds.height / 2;
    const top = Math.max(
      12 + maxPreviewHeight / 2,
      Math.min(centerY, viewportHeight - 12 - maxPreviewHeight / 2)
    );

    setPosition({ left, top });
  };

  const cancelClose = () => {
    window.clearTimeout(closeTimerRef.current);
  };

  const closeSoon = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 150);
  };

  const openPreview = () => {
    cancelClose();
    updatePosition();
    setIsOpen(true);
  };

  useEffect(() => {
    setImageFailed(false);
    setIsOpen(false);
  }, [src]);

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const closeOutsidePreview = (event) => {
      if (!triggerRef.current?.contains(event.target)
        && !previewRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOutsidePreview);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOutsidePreview);
    };
  }, [isOpen]);

  const toggleOnTouch = () => {
    if (window.matchMedia('(hover: none)').matches) {
      if (isOpen) setIsOpen(false);
      else openPreview();
    } else {
      openPreview();
    }
  };

  return (
    <>
      <span
        ref={triggerRef}
        className="ps-thumb-preview-trigger"
        role="button"
        tabIndex={0}
        aria-label={`Preview image for ${name}`}
        aria-expanded={isOpen}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') openPreview();
        }}
        onPointerLeave={closeSoon}
        onFocus={openPreview}
        onBlur={closeSoon}
        onClick={(event) => {
          event.stopPropagation();
          toggleOnTouch();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setIsOpen((open) => !open);
          }
        }}
      >
        <img className="ps-thumb" src={src} alt="" loading="lazy" />
      </span>
      {isOpen && !imageFailed && document.body && createPortal(
        <div
          ref={previewRef}
          className="ps-image-preview"
          style={{ left: `${position.left}px`, top: `${position.top}px` }}
          aria-hidden="true"
          onPointerEnter={cancelClose}
          onPointerLeave={closeSoon}
          onClick={(event) => event.stopPropagation()}
        >
          <img
            src={src}
            alt={name ? `${name} preview` : 'Product image preview'}
            onError={() => setImageFailed(true)}
          />
        </div>,
        document.body
      )}
    </>
  );
}

/* can* props come from Role Access (Settings). The server checks the same
   boxes, so hiding a button here is only for a cleaner screen. */
function ProductSupplier({
  onNavigate,
  onCatalogChange,
  canAddProduct = true,
  canEditProduct = true,
  canDeleteProduct = true,
  canExportProducts = true,
  canViewSuppliers = true,
  canManageSuppliers = true,
  dataRevision = 0,
}) {
  const [productsFromDatabase, setProductsFromDatabase] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productsRetry, setProductsRetry] = useState(0);
  const [section, setSection] = useState('products'); /* ===== PRODUCTS | SUPPLIERS ===== */
  const [suppliers, setSuppliers] = useState([]); /* ===== SUPPLIER LIST (type-ahead + reuse) ===== */
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [cursor, setCursor] = useState(0); /* ===== PAGE START ===== */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); /* ===== MODAL MODE ===== */
  const [formData, setFormData] = useState(emptyForm);
  const [variantDraft, setVariantDraft] = useState('');
  const [detailProduct, setDetailProduct] = useState(null);
  const [query, setQuery] = useState(''); /* ===== SEARCH ===== */
  const [sortBy, setSortBy] = useState('name'); /* ===== SORT KEY ===== */
  const [sortDir, setSortDir] = useState('asc'); /* ===== SORT DIRECTION ===== */
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [exportError, setExportError] = useState('');
  /* In-app messages (instead of browser pop-ups): formError shows inside the
     Add/Edit window, pageMessage above the product table. */
  const [formError, setFormError] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  /* ===== DELETE TARGET ===== */
  const [confirmTarget, setConfirmTarget] = useState(null);

  /* Close the sort dropdown on outside click. */
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDown = (e) => { if (!e.target.closest('.ps-sort-wrap')) setSortMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sortMenuOpen]);

  /* ===== LOAD PRODUCTS ===== */
  useEffect(() => {
    setProductsLoading(true);
    setProductsError('');
    fetch('/api/products', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`GET /api/products failed (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The products response was invalid.');
        setProductsFromDatabase(data);
      })
      .catch((error) => {
        console.error('Could not load products:', error);
        setProductsError(error.message || 'Could not load products.');
      })
      .finally(() => setProductsLoading(false));
  }, [productsRetry]);

  /* Someone changed data (auto-refresh): reload the products quietly, with no
     loading message, so an open form or the current page isn't disturbed. */
  useEffect(() => {
    if (dataRevision === 0) return undefined;
    let active = true;
    fetch('/api/products', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (active && Array.isArray(data)) setProductsFromDatabase(data); })
      .catch(() => { /* keep the list on screen; the next change tries again */ });
    return () => { active = false; };
  }, [dataRevision]);

  /* ===== LOAD SUPPLIERS (for the picker dropdown) ===== */
  useEffect(() => {
    fetch('/api/suppliers', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`GET /api/suppliers failed (${response.status})`);
        return response.json();
      })
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch((error) => console.error('Could not load suppliers:', error));
  }, [dataRevision]);

  /* ===== FILTER + SORT PRODUCTS ===== */
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? productsFromDatabase
      : productsFromDatabase.filter((p) =>
          [p.id, p.name, (p.variants || []).join(' '), p.category, p.brand, p.model, p.unitMeasure, p.supplierName, p.supplierContact]
            .some((field) => String(field ?? '').toLowerCase().includes(q))
        );

    const sorted = [...matched].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      // Numeric sort for stock; string sort (locale-aware) for the rest.
      let cmp;
      if (sortBy === 'stock') {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [productsFromDatabase, query, sortBy, sortDir]);

  /* Little ▲/▼ beside the column that's currently the active sort key. */
  const sortIndicator = (key) => (sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  /* ===== RESET PAGE ===== */
  useEffect(() => {
    setCursor(0);
  }, [query]);

  const total = filteredProducts.length;
  /* ===== FIT TO SCREEN =====
     The products table stretches to the bottom of the page and shows as many
     rows per page as fit, so the page itself doesn't scroll. */
  const fillTableToBottom = useFillToBottom(4, { shrink: true });   // full page fills the box; a short last page shrinks
  const [tableBox, setTableBox] = useState(null);
  const tableRef = useCallback((element) => {
    fillTableToBottom(element);
    setTableBox(element);
  }, [fillTableToBottom]);
  const PAGE_SIZE = useRowsThatFit(tableBox, { min: 3, fallback: 10, deps: [productsLoading, total > 0] });
  const safeCursor = total === 0 ? 0 : Math.min(cursor, total - 1);
  /* ===== PAGE START ===== */
  const pageCursor = Math.floor(safeCursor / PAGE_SIZE) * PAGE_SIZE;
  const visibleProducts = filteredProducts.slice(pageCursor, pageCursor + PAGE_SIZE);
  const hasNext = pageCursor + PAGE_SIZE < total;
  const hasPrev = pageCursor > 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(pageCursor / PAGE_SIZE) + 1;
  const pageLabel = total === 0
    ? 'No items'
    : `Page ${currentPage} of ${totalPages}`;

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
    setFormError('');
    setModalMode('add');
    setFormData({ ...emptyForm, suppliers: [{ ...emptySupplier }] });
    setVariantDraft('');
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setFormError('');
    setModalMode('edit');
    setVariantDraft('');
    setFormData({
      ...emptyForm,
      ...product,
      image: product.image || '', // coerce null → '' so the preview/URL input never crashes
      // Start from the product's own list; for older products that only have
      // names typed in Stock Control, offer those so saving adopts them.
      variants: [...((product.definedVariants || []).length ? product.definedVariants : (product.recordedVariants || []))],
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
      setFormError('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError('That image is larger than 2 MB. Please pick a smaller one.');
      return;
    }
    setFormError('');
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

  /* ===== VARIANTS (tag input) ===== */
  const addVariant = () => {
    const name = variantDraft.trim();
    if (!name) return;
    setFormData((prev) => {
      const list = prev.variants || [];
      if (list.some((v) => v.toLowerCase() === name.toLowerCase())) return prev;
      return { ...prev, variants: [...list, name] };
    });
    setVariantDraft('');
  };
  const removeVariant = (name) => setFormData((prev) => ({
    ...prev,
    variants: (prev.variants || []).filter((v) => v !== name),
  }));

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
    setFormError('');
    setPageMessage('');

    /* Keep only rows that actually name a supplier; first = primary. */
    const allSuppliers = formData.suppliers.filter((s) => s.name.trim());
    const primary = allSuppliers[0] || null;

    const payload = {
      name: formData.name,
      category: formData.category,
      brand: formData.brand,
      model: formData.model,
      unitMeasure: formData.unitMeasure,
      // Include a variant still sitting in the input box, if any.
      variants: [...(formData.variants || []), ...(variantDraft.trim() ? [variantDraft.trim()] : [])],
      supplierName: primary ? primary.name.trim() : null,
      supplierContact: primary ? (primary.contact || '').trim() || null : null,
      image: formData.image || null, /* data URL (upload) or pasted http(s) URL — persisted by the backend */
    };

    try {
      const isAdd = modalMode === 'add';
      const url = isAdd ? '/api/products' : `/api/products/${formData.id}`;
      const response = await apiFetch(url, {
        method: isAdd ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        /* Show the server's real reason (e.g. "This product already exists
           (PRD-1234).") instead of a generic message. */
        const result = await response.json().catch(() => ({}));
        const firstError = result.errors ? Object.values(result.errors).flat()[0] : null;
        const reason = firstError || result.message;
        const saveError = new Error(reason || `Save failed (${response.status})`);
        saveError.userMessage = reason || null;
        throw saveError;
      }
      const saved = await response.json(); /* ===== SAVED PRODUCT (now includes persisted image) ===== */

      setProductsFromDatabase((prev) => {
        const updated =
          isAdd
            ? [...prev, saved]
            : prev.map((p) => (p.id === saved.id ? saved : p));
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
        const refreshResponse = await fetch('/api/products', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!refreshResponse.ok) throw new Error(`Refresh failed (${refreshResponse.status})`);
        const refreshedProducts = await refreshResponse.json();
        setProductsFromDatabase(refreshedProducts);
        onCatalogChange?.();
      } catch (refreshError) {
        console.error('Product was saved, but the product list could not be refreshed:', refreshError);
        setPageMessage('Product saved successfully, but the list could not refresh. Reload the page to see the latest data.');
      }
    } catch (error) {
      console.error('Could not save product:', error);
      setFormError(error.userMessage
        ? `That product could not be saved: ${error.userMessage}`
        : 'Sorry — that product could not be saved. Check the server is running and try again.');
    }
  };

  /* ===== DELETE PRODUCT ===== */
  const handleDelete = async (id) => {
    try {
      const response = await apiFetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
    } catch (error) {
      console.error('Could not delete product:', error);
      setPageMessage('Sorry — that product could not be deleted. Check the server is running and try again.');
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
    onCatalogChange?.();
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

  /* ===== EXPORT FORMATTED PRODUCT WORKBOOK ===== */
  const exportProducts = async () => {
    if (filteredProducts.length === 0) return;
    const headers = ['Product ID', 'Product Name', 'Variant', 'Category', 'Brand', 'Model', 'Unit Measure', 'Supplier', 'Supplier Contact'];
    setExportError('');
    try {
      await exportReportWorkbook({
        title: 'Product and Supplier Directory',
        subtitle: 'Current product catalog and linked supplier contact information',
        fileName: 'product-supplier-directory',
        sections: [{
          title: 'Product records',
          headers,
          rows: filteredProducts.map((product) => [
            product.id,
            product.name,
            (product.variants || []).join(', '),
            product.category,
            product.brand,
            product.model,
            product.unitMeasure,
            product.supplierName,
            product.supplierContact,
          ]),
        }],
        summary: [
          { label: 'Products', value: filteredProducts.length },
          { label: 'Categories', value: new Set(filteredProducts.map((product) => product.category).filter(Boolean)).size },
          { label: 'Suppliers', value: new Set(filteredProducts.map((product) => product.supplierName).filter(Boolean)).size },
        ],
        scope: query.trim() ? `Filtered by: ${query.trim()}` : 'All matching product records',
        columnWidths: [16, 28, 24, 20, 20, 18, 18, 28, 28],
      });
    } catch (error) {
      console.error('Could not export product and supplier directory:', error);
      setExportError('Export failed. Please try again.');
    }
  };
/* ===== PRODUCT DATA END ===== */
  /* Products | Suppliers tabs. They sit FIRST in the toolbar row (before the
     search bar) of whichever list is open, so tabs, search and buttons share
     one row. */
  const sectionTabs = (
    <div className="ps-section-tabs" role="tablist" aria-label="Management sections">
      <button type="button" role="tab" aria-selected={section === 'products'} className={section === 'products' ? 'is-active' : ''} onClick={() => setSection('products')}>
        <Package size={13} aria-hidden="true" /> Products
      </button>
      {canViewSuppliers && (
      <button type="button" role="tab" aria-selected={section === 'suppliers'} className={section === 'suppliers' ? 'is-active' : ''} onClick={() => setSection('suppliers')}>
        <Truck size={13} aria-hidden="true" /> Suppliers
      </button>
      )}
    </div>
  );
  return (
    <div className="ps-section-root">
      {section === 'suppliers' && canViewSuppliers ? (
        <SupplierRecords
          sectionTabs={sectionTabs}
          canManage={canManageSuppliers}
          dataRevision={dataRevision}
          onSuppliersChange={() => {
            setProductsRetry((retry) => retry + 1);
            onCatalogChange?.();
          }}
        />
      ) : (
    <div className="ps-table-parent">
      {exportError && <p className="ps-export-error" role="alert">{exportError}</p>}
      {pageMessage && (
        <p className="ps-export-error ps-page-message" role="alert">
          {pageMessage}
          <button type="button" className="ps-page-message-close" onClick={() => setPageMessage('')} aria-label="Dismiss message">×</button>
        </p>
      )}
      {/* ===== ONE TOOLBAR ROW: tabs, then search bar, then buttons ===== */}
      <div className="ps-navigation-bar">
        {sectionTabs}
        <div className="ps-search-wrapper">
          {/* Preset searches: the categories your products already use. */}
          <SearchSuggestions
            query={query}
            suggestions={productsFromDatabase.map((product) => product.category)}
            onPick={setQuery}
            label="Categories"
          >
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
          </SearchSuggestions>
        </div>
        {canExportProducts && (
        <button
          className="ps-add-btn ps-icon-only"
          onClick={exportProducts}
          type="button"
          disabled={filteredProducts.length === 0}
          title="Export the current list to a formatted Excel report"
          aria-label="Export Excel report"
        >
          <Download size={14} />
        </button>
        )}

        {/* ===== SORT DROPDOWN (icon button) ===== */}
        <div className="ps-sort-wrap">
          <button
            className="ps-add-btn ps-icon-only"
            onClick={() => setSortMenuOpen((o) => !o)}
            type="button"
            title="Sort products"
            aria-label="Sort products"
            aria-expanded={sortMenuOpen}
          >
            <ArrowUpDown size={14} />
          </button>
          {sortMenuOpen && (
            <div className="ps-sort-menu" role="menu">
              {[
                { key: 'name', label: 'Product Name' },
                { key: 'category', label: 'Category' },
                { key: 'brand', label: 'Brand' },
                { key: 'supplierName', label: 'Supplier' },
                { key: 'stock', label: 'Stock' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortBy === opt.key}
                  className={`ps-sort-item${sortBy === opt.key ? ' is-active' : ''}`}
                  onClick={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                >
                  {opt.label}
                </button>
              ))}
              <div className="ps-sort-divider" />
              <button
                type="button"
                className="ps-sort-item"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
              </button>
            </div>
          )}
        </div>

        {canDeleteProduct && selectedIds.size > 0 && (
          <button
            className="ps-add-btn ps-delete-selected-btn ps-add-collapse"
            onClick={requestDeleteBulk}
            type="button"
            title={`Delete ${selectedIds.size} selected`}
            data-count={selectedIds.size}
            aria-label={`Delete ${selectedIds.size} selected`}
          >
            <p>Delete ({selectedIds.size})</p>
            <Trash2 size={12} />
          </button>
        )}
        {canAddProduct && (
        <button className="ps-add-btn ps-add-btn-primary ps-add-collapse" onClick={openAddModal} type="button" title="Add product" aria-label="Add product">
          <p>Add</p>
          <Plus size={12} className="ps-add-icon" />
        </button>
        )}
      </div>

      {/* ===== TABLE ===== */}
      <MobileSelectBar
        total={visibleProducts.length}
        count={selectedIds.size}
        allSelected={allSelected}
        onToggleAll={toggleSelectAll}
        onClear={() => setSelectedIds(new Set())}
      />
      <div className="ps-table-scroll" ref={tableRef} aria-busy={productsLoading}>
        <table className="ps-table m-folders">
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
              <th className="ps-th-left">Product Name{sortIndicator('name')}</th>
              <th className="ps-th-left">Variant</th>
              <th>Category{sortIndicator('category')}</th>
              <th>Brand{sortIndicator('brand')}</th>
              <th>Model</th>
              <th>Unit Measure</th>
              <th className="ps-th-left">Supplier{sortIndicator('supplierName')}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {productsLoading ? Array.from({ length: 6 }, (_, index) => (
              <tr className="ps-skeleton-row" key={`loading-${index}`} aria-hidden="true">
                <td><span className="ps-skeleton-block ps-skeleton-check" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-short" /></td>
                <td className="ps-td-pic"><span className="ps-skeleton-block ps-skeleton-thumb" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-wide" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-short" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-short" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-short" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-short" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-short" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-wide" /></td>
                <td><span className="ps-skeleton-block ps-skeleton-actions" /></td>
              </tr>
            )) : productsError ? (
              <tr>
                <td colSpan={11} className="ps-empty-state" role="alert">
                  {productsError}{' '}
                  <button type="button" className="ps-retry-btn" onClick={() => setProductsRetry((retry) => retry + 1)}>
                    Retry
                  </button>
                </td>
              </tr>
            ) : visibleProducts.map((product) => (
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
                <td className="ps-td-check m-keep" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleSelectRow(product.id)}
                    aria-label={`Select ${product.name}`}
                  />
                </td>
                <td className="ps-td-nowrap ps-td-muted m-peek" data-label="Product ID">{product.id}</td>
                <td className="ps-td-pic" data-label="Picture">
                  {product.image ? (
                    <ProductImagePreview src={product.image} name={product.name} />
                  ) : (
                    <span className="ps-thumb ps-thumb-empty" aria-hidden="true"><Package size={13} /></span>
                  )}
                </td>
                <td className="ps-td-left ps-cell-name m-title" data-label="Product Name" title={product.name}>
                  <span className="ps-name-cell">
                    <span className="ps-name-text">{product.name}</span>
                  </span>
                </td>
                <td className="ps-td-left" data-label="Variant" title={(product.variants || []).join(', ')}>
                  {product.variants?.length ? (
                    <span className="ps-variant-list">
                      {product.variants.slice(0, 3).map((variant) => (
                        <span className="ps-variant-chip" key={variant}>{variant}</span>
                      ))}
                      {product.variants.length > 3 && (
                        <span className="ps-variant-chip ps-variant-more">+{product.variants.length - 3}</span>
                      )}
                    </span>
                  ) : <span className="ps-td-muted">—</span>}
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
                    {canEditProduct && (
                    <button
                      className="ps-table-action-btn ps-edit-btn"
                      onClick={() => openEditModal(product)}
                      aria-label="Edit Item"
                      title="Edit Item"
                      type="button"
                    >
                      <Edit size={16} />
                    </button>
                    )}
                    {canDeleteProduct && (
                    <button
                      className="ps-table-action-btn ps-delete-btn"
                      onClick={() => requestDeleteSingle(product)}
                      aria-label="Delete Item"
                      title="Delete Item"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                    )}
                    {!canEditProduct && !canDeleteProduct && <span className="ps-td-muted">—</span>}
                  </div>
                </td>
              </tr>
            ))}

            {!productsLoading && !productsError && visibleProducts.length === 0 && (
              <tr>
                <td colSpan={11} className="ps-empty-state">
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
      {total > 0 && (
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
                {/* Variants (e.g. colours), shown as chips like in the table. */}
                <div className="ps-detail-item ps-detail-item-full">
                  <span className="ps-detail-label">Variants</span>
                  {(detailProduct.variants || []).length > 0 ? (
                    <span className="ps-variant-list ps-detail-variants">
                      {detailProduct.variants.map((variant) => (
                        <span className="ps-variant-chip" key={variant}>{variant}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="ps-detail-value">—</span>
                  )}
                  <span className="ps-detail-hint">Versions of this product, such as colours or sizes</span>
                </div>
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
              {canEditProduct && (
              <button type="button" className="ps-modal-save-btn" onClick={editFromDetails}>
                Edit Product
              </button>
              )}
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
                    <label htmlFor="variant-input">Variants</label>
                    <div className="ps-variant-editor">
                      {(formData.variants || []).map((variant) => (
                        <span className="ps-variant-chip ps-variant-chip-edit" key={variant}>
                          {variant}
                          <button type="button" onClick={() => removeVariant(variant)} aria-label={`Remove variant ${variant}`}>
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                      <input
                        id="variant-input"
                        value={variantDraft}
                        onChange={(e) => setVariantDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addVariant();
                          } else if (e.key === 'Backspace' && !variantDraft && (formData.variants || []).length) {
                            removeVariant(formData.variants[formData.variants.length - 1]);
                          }
                        }}
                        placeholder={(formData.variants || []).length ? 'Add another…' : 'e.g. Black / M — press Enter to add'}
                      />
                      <button type="button" className="ps-variant-add" onClick={addVariant} disabled={!variantDraft.trim()}>
                        <Plus size={12} /> Add
                      </button>
                    </div>
                    <p className="ps-field-note">
                      Size, color or design options. Stock Control picks from this list. Stock is counted for the whole product.
                    </p>
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
                          value={/^(data:|\/products\/)/.test(formData.image || '') ? '' : (formData.image || '')}
                          onChange={handleFormChange}
                          placeholder="…or paste an image URL"
                        />
                        <p className="ps-field-note">
                          Click the box to upload an image, or paste an image URL. Saved with the product.
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
                      is used by Stock Movement and the Economic Order Quantity Calculator when a reorder is raised.
                    </p>
                  </div>
                </section>
              </div>

              {formError && <p className="ps-export-error ps-form-error" role="alert">{formError}</p>}
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
                {confirmTarget.type === 'single' ? 'It' : 'They'} will move to the Trash Bin, where {confirmTarget.type === 'single' ? 'it' : 'they'} can be restored.
              </p>
              {/* Warn (but allow) when stock is still on hand. */}
              {(() => {
                const targets = confirmTarget.type === 'single'
                  ? [confirmTarget.product]
                  : productsFromDatabase.filter((p) => confirmTarget.ids.includes(p.id));
                const withStock = targets.filter((p) => Number(p?.stock) > 0);
                if (withStock.length === 0) return null;
                const units = withStock.reduce((sum, p) => sum + Number(p.stock), 0);
                return (
                  <p className="ps-confirm-text ps-confirm-stock-warning" role="alert">
                    {confirmTarget.type === 'single'
                      ? <>This product still has <strong>{units}</strong> in stock.</>
                      : <><strong>{withStock.length}</strong> of these still {withStock.length === 1 ? 'has' : 'have'} stock (<strong>{units}</strong> units in total).</>}
                    {' '}It will disappear from Stock Control, the Reorder List, Reports and forecasts. Its stock entries go to the Trash Bin with it and come back if it is restored.
                  </p>
                );
              })()}
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
      )}
    </div>
  );
}

export default ProductSupplier;