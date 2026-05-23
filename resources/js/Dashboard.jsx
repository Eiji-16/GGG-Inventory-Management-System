import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import './Dashboard.css';

/* ── Dummy Data ── */
const monthlyData = [
    { month: 'Jan', value: 400 }, { month: 'Feb', value: 600 },
    { month: 'Mar', value: 500 }, { month: 'Apr', value: 800 },
    { month: 'May', value: 700 }, { month: 'Jun', value: 900 },
    { month: 'Jul', value: 750 }, { month: 'Aug', value: 1000 },
    { month: 'Sep', value: 870 }, { month: 'Oct', value: 950 },
    { month: 'Nov', value: 1100 }, { month: 'Dec', value: 1284 },
];

const stockGrowth = [
    { month: 'Jun', value: 300 }, { month: 'Jul', value: 450 },
    { month: 'Aug', value: 380 }, { month: 'Sep', value: 600 },
    { month: 'Oct', value: 520 }, { month: 'Nov', value: 700 },
    { month: 'Dec', value: 850 },
];

const forecastData = [
    { month: 'Jan', actual: 400, forecast: 420 },
    { month: 'Feb', actual: 600, forecast: 580 },
    { month: 'Mar', actual: 500, forecast: 530 },
    { month: 'Apr', actual: 800, forecast: 790 },
    { month: 'May', actual: 700, forecast: 720 },
    { month: 'Jun', actual: null, forecast: 850 },
    { month: 'Jul', actual: null, forecast: 920 },
    { month: 'Aug', actual: null, forecast: 980 },
];

const initialProducts = [
    { id: 1, name: 'Office Chair',       category: 'Furniture',   stock: 50, price: 2500, reorder: 10 },
    { id: 2, name: 'Printer Paper A4',   category: 'Supplies',    stock: 12, price: 250,  reorder: 50 },
    { id: 3, name: 'USB-C Cable',        category: 'Electronics', stock: 4,  price: 350,  reorder: 20 },
    { id: 4, name: 'Whiteboard Marker',  category: 'Supplies',    stock: 7,  price: 80,   reorder: 30 },
    { id: 5, name: 'Laptop Stand',       category: 'Electronics', stock: 25, price: 1200, reorder: 5  },
    { id: 6, name: 'Stapler',            category: 'Supplies',    stock: 0,  price: 150,  reorder: 10 },
    { id: 7, name: 'Monitor',            category: 'Electronics', stock: 15, price: 8500, reorder: 3  },
    { id: 8, name: 'Filing Cabinet',     category: 'Furniture',   stock: 8,  price: 3500, reorder: 2  },
];

const initialSuppliers = [
    { id: 1, name: 'Tech Supplies Co.',  contact: 'Juan Dela Cruz', status: 'Active',  lastOrder: '2026-05-01', amount: '₱45,000' },
    { id: 2, name: 'Office Depot PH',    contact: 'Maria Santos',   status: 'Active',  lastOrder: '2026-04-28', amount: '₱12,500' },
    { id: 3, name: 'Furniture World',    contact: 'Pedro Reyes',    status: 'Pending', lastOrder: '2026-05-10', amount: '₱78,000' },
    { id: 4, name: 'Global Stationery',  contact: 'Ana Gonzales',   status: 'Active',  lastOrder: '2026-05-05', amount: '₱8,200'  },
];

const stockMovements = [
    { id: 1, product: 'Office Chair',      type: 'IN',  qty: 50,  date: '2026-05-15', reason: 'Purchase Order' },
    { id: 2, product: 'Printer Paper A4',  type: 'OUT', qty: 100, date: '2026-05-14', reason: 'Department Use' },
    { id: 3, product: 'USB-C Cable',       type: 'IN',  qty: 20,  date: '2026-05-13', reason: 'Purchase Order' },
    { id: 4, product: 'Monitor',           type: 'OUT', qty: 10,  date: '2026-05-12', reason: 'Department Use' },
    { id: 5, product: 'Whiteboard Marker', type: 'OUT', qty: 30,  date: '2026-05-11', reason: 'Department Use' },
    { id: 6, product: 'Laptop Stand',      type: 'IN',  qty: 15,  date: '2026-05-10', reason: 'Purchase Order' },
    { id: 7, product: 'Stapler',           type: 'OUT', qty: 5,   date: '2026-05-09', reason: 'Lost/Damaged'   },
];

/* ── Pages ── */

function PageDashboard() {
    return (
        <>
            <div className="db-stat-cards">
                {[
                    { label: 'Total Items',   value: '1,284', change: '↑ +12% than last week', type: 'success' },
                    { label: 'Low Stock',     value: '23',    change: '↓ -5% than last week',  type: 'warning' },
                    { label: 'Categories',    value: '8',     change: '↑ +2% than last week',  type: 'success' },
                    { label: 'Out of Stock',  value: '5',     change: '↑ +10% than last week', type: 'danger'  },
                ].map(c => (
                    <div key={c.label} className="db-stat-card">
                        <p className="db-stat-label">{c.label}</p>
                        <p className="db-stat-number">{c.value}</p>
                        <p className={`db-stat-change ${c.type}`}>{c.change}</p>
                    </div>
                ))}
            </div>

            <div className="db-charts-row">
                <div className="db-card">
                    <p className="db-card-title">Monthly Stock Overview</p>
                    <div className="db-chart-stats">
                        <div><p className="db-chart-stat-label">New Items</p><p className="db-chart-stat-value">284</p></div>
                        <div><p className="db-chart-stat-label">Stock Growth</p><p className="db-chart-stat-value">76%</p></div>
                        <div><p className="db-chart-stat-label">Total Value</p><p className="db-chart-stat-value">₱1.2M</p></div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={monthlyData}>
                            <defs>
                                <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#378ADD" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#378ADD" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip />
                            <Area type="monotone" dataKey="value" stroke="#378ADD" fill="url(#colorBlue)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="db-card">
                    <p className="db-card-title">Stock Distribution</p>
                    <div className="db-donut-list">
                        {[
                            { label: 'Electronics', pct: 33, color: '#378ADD' },
                            { label: 'Furniture',   pct: 24, color: '#1d4ed8' },
                            { label: 'Supplies',    pct: 22, color: '#60a5fa' },
                            { label: 'Equipment',   pct: 14, color: '#93c5fd' },
                            { label: 'Others',      pct:  7, color: '#bfdbfe' },
                        ].map(item => (
                            <div key={item.label} className="db-donut-item">
                                <div className="db-donut-left">
                                    <div className="db-donut-dot" style={{ background: item.color }}></div>
                                    <span className="db-donut-label">{item.label}</span>
                                </div>
                                <div className="db-donut-right">
                                    <span className="db-donut-pct">{item.pct}%</span>
                                    <div className="db-donut-bar">
                                        <div className="db-donut-fill" style={{ width: `${item.pct * 3}%`, background: item.color }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="db-charts-row">
                <div className="db-card">
                    <div className="db-card-header">
                        <p className="db-card-title">Stock Growth</p>
                        <div className="db-card-badges">
                            <span className="db-badge blue">Monthly: 55%</span>
                            <span className="db-badge light">Target: 75%</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={stockGrowth}>
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip />
                            <Bar dataKey="value" fill="#378ADD" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="db-card">
                    <p className="db-card-title">Low Stock Alerts</p>
                    <table className="db-table">
                        <thead><tr><th>Item</th><th>Stock</th><th>Status</th></tr></thead>
                        <tbody>
                            <tr><td>Printer Paper A4</td><td>12</td><td><span className="db-badge warning">Low</span></td></tr>
                            <tr><td>USB-C Cables</td><td>4</td><td><span className="db-badge danger">Critical</span></td></tr>
                            <tr><td>Whiteboard Markers</td><td>7</td><td><span className="db-badge warning">Low</span></td></tr>
                            <tr><td>Staplers</td><td>0</td><td><span className="db-badge danger">Out of stock</span></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function PageReorderAlerts() {
    const lowStock = initialProducts.filter(p => p.stock <= p.reorder);
    return (
        <div className="db-section">
            <div className="db-section-header">
                <p className="db-section-title">🔔 Auto Reorder Alerts</p>
                <span className="db-badge danger">{lowStock.length} items need attention</span>
            </div>
            {lowStock.map(p => (
                <div key={p.id} className={`db-alert ${p.stock === 0 ? 'danger' : 'warning'}`}>
                    <span style={{ fontSize: 18 }}>{p.stock === 0 ? '🚨' : '⚠️'}</span>
                    <div style={{ flex: 1 }}>
                        <strong>{p.name}</strong> — {p.stock === 0 ? 'Out of Stock' : `Only ${p.stock} left`}
                        <span style={{ marginLeft: 8, fontSize: 12 }}>Reorder point: {p.reorder} units</span>
                    </div>
                    <button className="db-btn db-btn-primary">Order Now</button>
                </div>
            ))}
        </div>
    );
}

function PageReorderCalculator() {
    const [form, setForm] = useState({ demand: '', leadTime: '', safetyStock: '' });
    const [result, setResult] = useState(null);
    const calculate = () => {
        const d = parseFloat(form.demand), l = parseFloat(form.leadTime), s = parseFloat(form.safetyStock);
        if (!d || !l || !s) return;
        setResult(((d * l) + s).toFixed(0));
    };
    return (
        <div className="db-section">
            <p className="db-section-title">🧮 Smart Reorder Calculator</p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 1.5rem' }}>Reorder Point = (Daily Demand × Lead Time) + Safety Stock</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                {[['demand','Daily Demand (units/day)','e.g. 10'],['leadTime','Lead Time (days)','e.g. 5'],['safetyStock','Safety Stock (units)','e.g. 20']].map(([key,label,ph]) => (
                    <div className="db-modal-field" key={key}>
                        <label>{label}</label>
                        <input type="number" placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
                    </div>
                ))}
            </div>
            <button className="db-btn db-btn-primary" onClick={calculate}>Calculate</button>
            {result && (
                <div style={{ marginTop: 20, padding: '1.2rem', background: '#dbeafe', borderRadius: 10, color: '#1d4ed8' }}>
                    <p style={{ fontSize: 13, marginBottom: 4 }}>Reorder Point</p>
                    <p style={{ fontSize: 32, fontWeight: 700 }}>{result} units</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Place a new order when stock reaches this level.</p>
                </div>
            )}
        </div>
    );
}

function PageDemandForecast() {
    return (
        <>
            <div className="db-info-grid">
                {[['920','Forecasted Units (Jun)'],['+14%','Expected Growth'],['92%','Forecast Accuracy']].map(([v,l]) => (
                    <div key={l} className="db-info-card">
                        <p className="db-info-card-value">{v}</p>
                        <p className="db-info-card-label">{l}</p>
                    </div>
                ))}
            </div>
            <div className="db-card">
                <p className="db-card-title">📈 Demand Forecast — Actual vs Predicted</p>
                <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={forecastData}>
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip />
                        <Line type="monotone" dataKey="actual" stroke="#378ADD" strokeWidth={2} dot={{ r: 4 }} name="Actual" />
                        <Line type="monotone" dataKey="forecast" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} name="Forecast" />
                    </LineChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                        <div style={{ width: 20, height: 2, background: '#378ADD' }}></div> Actual
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                        <div style={{ width: 20, height: 2, borderTop: '2px dashed #60a5fa' }}></div> Forecast
                    </div>
                </div>
            </div>
        </>
    );
}

function PageEOQ() {
    const [form, setForm] = useState({ demand: '', orderCost: '', holdingCost: '' });
    const [result, setResult] = useState(null);
    const calculate = () => {
        const D = parseFloat(form.demand), S = parseFloat(form.orderCost), H = parseFloat(form.holdingCost);
        if (!D || !S || !H) return;
        setResult(Math.sqrt((2 * D * S) / H).toFixed(0));
    };
    return (
        <div className="db-section">
            <p className="db-section-title">📐 EOQ — Economic Order Quantity</p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 1.5rem' }}>Formula: EOQ = √(2DS/H) — finds the optimal order quantity that minimizes total inventory costs.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                {[['demand','Annual Demand (D)','e.g. 1000'],['orderCost','Order Cost per Order (S) ₱','e.g. 500'],['holdingCost','Holding Cost per Unit (H) ₱','e.g. 50']].map(([key,label,ph]) => (
                    <div className="db-modal-field" key={key}>
                        <label>{label}</label>
                        <input type="number" placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
                    </div>
                ))}
            </div>
            <button className="db-btn db-btn-primary" onClick={calculate}>Calculate EOQ</button>
            {result && (
                <div style={{ marginTop: 20, padding: '1.2rem', background: '#dbeafe', borderRadius: 10, color: '#1d4ed8' }}>
                    <p style={{ fontSize: 13, marginBottom: 4 }}>Optimal Order Quantity</p>
                    <p style={{ fontSize: 32, fontWeight: 700 }}>{result} units</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Order this amount each time to minimize total inventory cost.</p>
                </div>
            )}
        </div>
    );
}

function PageProducts() {
    const [products, setProducts] = useState(initialProducts);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', category: '', stock: '', price: '', reorder: '' });

    const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    const openAdd = () => { setEditing(null); setForm({ name: '', category: '', stock: '', price: '', reorder: '' }); setModal(true); };
    const openEdit = (p) => { setEditing(p.id); setForm({ name: p.name, category: p.category, stock: p.stock, price: p.price, reorder: p.reorder }); setModal(true); };
    const save = () => {
        if (editing) setProducts(products.map(p => p.id === editing ? { ...p, ...form, stock: +form.stock, price: +form.price, reorder: +form.reorder } : p));
        else setProducts([...products, { id: Date.now(), ...form, stock: +form.stock, price: +form.price, reorder: +form.reorder }]);
        setModal(false);
    };
    const remove = (id) => setProducts(products.filter(p => p.id !== id));

    return (
        <>
            <div className="db-section">
                <div className="db-section-header">
                    <p className="db-section-title">📦 Product Management</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input className="db-search" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
                        <button className="db-btn db-btn-primary" onClick={openAdd}>+ Add Product</button>
                    </div>
                </div>
                <table className="db-table">
                    <thead>
                        <tr><th>Name</th><th>Category</th><th>Stock</th><th>Price</th><th>Reorder Point</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => (
                            <tr key={p.id}>
                                <td>{p.name}</td>
                                <td>{p.category}</td>
                                <td>{p.stock}</td>
                                <td>₱{p.price.toLocaleString()}</td>
                                <td>{p.reorder}</td>
                                <td><span className={`db-badge ${p.stock === 0 ? 'danger' : p.stock <= p.reorder ? 'warning' : 'success'}`}>{p.stock === 0 ? 'Out of Stock' : p.stock <= p.reorder ? 'Low Stock' : 'In Stock'}</span></td>
                                <td>
                                    <button className="db-btn db-btn-warning" style={{ marginRight: 6 }} onClick={() => openEdit(p)}>Edit</button>
                                    <button className="db-btn db-btn-danger" onClick={() => remove(p.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal && (
                <div className="db-modal-overlay">
                    <div className="db-modal">
                        <p className="db-modal-title">{editing ? 'Edit Product' : 'Add Product'}</p>
                        {[['name','text','Name'],['category','text','Category'],['stock','number','Stock'],['price','number','Price'],['reorder','number','Reorder Point']].map(([key,type,label]) => (
                            <div className="db-modal-field" key={key}>
                                <label>{label}</label>
                                <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={`Enter ${label}`} />
                            </div>
                        ))}
                        <div className="db-modal-actions">
                            <button className="db-btn db-btn-danger" onClick={() => setModal(false)}>Cancel</button>
                            <button className="db-btn db-btn-primary" onClick={save}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function PageSuppliers() {
    return (
        <div className="db-section">
            <div className="db-section-header">
                <p className="db-section-title">🏭 Supplier & Order Management</p>
                <button className="db-btn db-btn-primary">+ Add Supplier</button>
            </div>
            <table className="db-table">
                <thead><tr><th>Supplier</th><th>Contact</th><th>Last Order</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    {initialSuppliers.map(s => (
                        <tr key={s.id}>
                            <td>{s.name}</td>
                            <td>{s.contact}</td>
                            <td>{s.lastOrder}</td>
                            <td>{s.amount}</td>
                            <td><span className={`db-badge ${s.status === 'Active' ? 'success' : 'warning'}`}>{s.status}</span></td>
                            <td>
                                <button className="db-btn db-btn-warning" style={{ marginRight: 6 }}>Edit</button>
                                <button className="db-btn db-btn-primary">Order</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PageStockMovement() {
    return (
        <div className="db-section">
            <div className="db-section-header">
                <p className="db-section-title">📋 Stock Movement Tracking</p>
                <button className="db-btn db-btn-primary">+ Log Movement</button>
            </div>
            <table className="db-table">
                <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Reason</th></tr></thead>
                <tbody>
                    {stockMovements.map(m => (
                        <tr key={m.id}>
                            <td>{m.date}</td>
                            <td>{m.product}</td>
                            <td><span className={`db-badge ${m.type === 'IN' ? 'success' : 'danger'}`}>{m.type}</span></td>
                            <td>{m.qty}</td>
                            <td>{m.reason}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PageSmartAdjustments() {
    const seasons = [
        { name: 'Christmas Season', months: 'Nov – Dec', adjustment: '+35%', status: 'Upcoming' },
        { name: 'Back to School',   months: 'Jun – Jul', adjustment: '+20%', status: 'Active'   },
        { name: 'Summer Sale',      months: 'Mar – May', adjustment: '+15%', status: 'Ended'    },
        { name: 'Holiday Promo',    months: 'Apr – May', adjustment: '+10%', status: 'Ended'    },
    ];
    return (
        <div className="db-section">
            <p className="db-section-title">🌦️ Smart Adjustments — Seasonal & Promotions</p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 1.5rem' }}>Automatically adjusts forecasted demand based on seasons and promotional periods.</p>
            <table className="db-table">
                <thead><tr><th>Event</th><th>Period</th><th>Demand Adjustment</th><th>Status</th></tr></thead>
                <tbody>
                    {seasons.map((s, i) => (
                        <tr key={i}>
                            <td>{s.name}</td>
                            <td>{s.months}</td>
                            <td style={{ color: '#16a34a', fontWeight: 600 }}>{s.adjustment}</td>
                            <td><span className={`db-badge ${s.status === 'Active' ? 'success' : s.status === 'Upcoming' ? 'blue' : 'light'}`}>{s.status}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PageReports() {
    return (
        <>
            <div className="db-info-grid">
                {[['₱1.2M','Total Inventory Value'],['1,284','Total Units in Stock'],['76%','Stock Turnover Rate']].map(([v,l]) => (
                    <div key={l} className="db-info-card">
                        <p className="db-info-card-value">{v}</p>
                        <p className="db-info-card-label">{l}</p>
                    </div>
                ))}
            </div>
            <div className="db-charts-row">
                <div className="db-card">
                    <p className="db-card-title">Monthly Stock Value</p>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={monthlyData}>
                            <defs>
                                <linearGradient id="colorRep" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#378ADD" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#378ADD" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide /><Tooltip />
                            <Area type="monotone" dataKey="value" stroke="#378ADD" fill="url(#colorRep)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="db-card">
                    <p className="db-card-title">Stock Movement Summary</p>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stockGrowth}>
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide /><Tooltip />
                            <Bar dataKey="value" fill="#378ADD" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="db-section">
                <div className="db-section-header">
                    <p className="db-section-title">Generate Reports</p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {['Stock Summary', 'Movement Log', 'Low Stock Report', 'Supplier Report', 'Forecast Report'].map(r => (
                        <button key={r} className="db-btn db-btn-primary">{r}</button>
                    ))}
                </div>
            </div>
        </>
    );
}

/* ── Main Shell ── */
function Dashboard({ onLogout }) {
    const [active, setActive] = useState('Dashboard');

    const navItems = [
        { icon: '',  label: 'Dashboard'          },
        { icon: '', label: 'Reorder Alerts'      },
        { icon: '', label: 'Reorder Calculator'  },
        { icon: '', label: 'Demand Forecast'     },
        { icon: '', label: 'EOQ Tool'            },
        { icon: '', label: 'Products'            },
        { icon: '', label: 'Suppliers'           },
        { icon: '', label: 'Stock Movement'      },
        { icon: '', label: 'Smart Adjustments'  },
        { icon: '', label: 'Reports'             },
    ];

    const renderPage = () => {
        switch (active) {
            case 'Dashboard':          return <PageDashboard />;
            case 'Reorder Alerts':     return <PageReorderAlerts />;
            case 'Reorder Calculator': return <PageReorderCalculator />;
            case 'Demand Forecast':    return <PageDemandForecast />;
            case 'EOQ Tool':           return <PageEOQ />;
            case 'Products':           return <PageProducts />;
            case 'Suppliers':          return <PageSuppliers />;
            case 'Stock Movement':     return <PageStockMovement />;
            case 'Smart Adjustments':  return <PageSmartAdjustments />;
            case 'Reports':            return <PageReports />;
            default:                   return <PageDashboard />;
        }
    };

    return (
        <div className="db-wrapper">
            <aside className="db-sidebar">
                <div className="db-logo">
                    <span className="db-logo-text">GGG</span>
                    <span className="db-logo-sub">Inventory</span>
                </div>
                <nav className="db-nav">
                    {navItems.map(item => (
                        <div
                            key={item.label}
                            className={`db-nav-item ${active === item.label ? 'active' : ''}`}
                            onClick={() => setActive(item.label)}
                        >
                            <span className="db-nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </nav>
                <div className="db-sidebar-bottom">
                    <div className="db-nav-item" onClick={onLogout}>
                        <span className="db-nav-icon">⎋</span>
                        <span>Log out</span>
                    </div>
                </div>
            </aside>

            <main className="db-main">
                <div className="db-topbar">
                    <div>
                        <p className="db-greeting">Good morning 👋</p>
                        <h1 className="db-page-title">{active}</h1>
                    </div>
                    <div className="db-avatar">GG</div>
                </div>
                {renderPage()}
            </main>
        </div>
    );
}

export default Dashboard;