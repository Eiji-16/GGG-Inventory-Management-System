import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';
import '../css/Dashboard.css';

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
            
        </>
    );
}

function PageReorderAlerts() {
    
    return (
        <></>
        
    );
}

function PageReorderCalculator() {
    
    return (
        <></>
    );
}

function PageDemandForecast() {
    return (
        <>
           
        </>
    );
}

function PageEOQ() {
    
    return (
        <></>
    );
}

function PageProducts() {

    return (
        <>
            
        </>
    );
}

function PageSuppliers() {
    return (
        <></>
    );
}

function PageStockMovement() {
    return (
        <></>
    );
}

function PageSmartAdjustments() {
    
    return (
        <></>
    );
}

function PageReports() {
    return (
        <>
            
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