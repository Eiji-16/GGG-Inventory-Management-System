import './Dashboard.css';

function Dashboard() {
    return (
        <div className="dashboard">

            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <p className="greeting">Good morning 👋</p>
                    <h1 className="dashboard-title">GGG Inventory Dashboard</h1>
                </div>
                <div className="avatar">GG</div>
            </div>

            {/* Stat Cards */}
            <div className="stat-cards">
                <div className="stat-card">
                    <p className="stat-label">Total Items</p>
                    <p className="stat-number">1,284</p>
                    <p className="stat-sub success">↑ 12% this month</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Low Stock</p>
                    <p className="stat-number warning">23</p>
                    <p className="stat-sub">Needs reorder</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Categories</p>
                    <p className="stat-number">8</p>
                    <p className="stat-sub">Active groups</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Out of Stock</p>
                    <p className="stat-number danger">5</p>
                    <p className="stat-sub">Urgent items</p>
                </div>
            </div>

            {/* Middle Row */}
            <div className="middle-row">

                {/* Recent Activity */}
                <div className="card">
                    <p className="card-title">Recent activity</p>
                    <div className="activity-list">

                        <div className="activity-item">
                            <div className="activity-icon success">+</div>
                            <div>
                                <p className="activity-text">Added 50x Office Chairs</p>
                                <p className="activity-time">2 hours ago</p>
                            </div>
                        </div>

                        <div className="activity-item">
                            <div className="activity-icon warning">!</div>
                            <div>
                                <p className="activity-text">Low stock: Printer Paper</p>
                                <p className="activity-time">5 hours ago</p>
                            </div>
                        </div>

                        <div className="activity-item">
                            <div className="activity-icon danger">−</div>
                            <div>
                                <p className="activity-text">Removed 10x Monitors</p>
                                <p className="activity-time">Yesterday</p>
                            </div>
                        </div>

                        <div className="activity-item">
                            <div className="activity-icon info">↻</div>
                            <div>
                                <p className="activity-text">Updated: Laptop inventory</p>
                                <p className="activity-time">Yesterday</p>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Stock by Category */}
                <div className="card">
                    <p className="card-title">Stock by category</p>
                    <div className="category-list">

                        <div className="category-item">
                            <div className="category-label">
                                <span>Electronics</span>
                                <span>420</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: '80%' }}></div>
                            </div>
                        </div>

                        <div className="category-item">
                            <div className="category-label">
                                <span>Furniture</span>
                                <span>310</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: '60%' }}></div>
                            </div>
                        </div>

                        <div className="category-item">
                            <div className="category-label">
                                <span>Supplies</span>
                                <span>280</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: '50%' }}></div>
                            </div>
                        </div>

                        <div className="category-item">
                            <div className="category-label">
                                <span>Equipment</span>
                                <span>180</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: '35%' }}></div>
                            </div>
                        </div>

                        <div className="category-item">
                            <div className="category-label">
                                <span>Others</span>
                                <span>94</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: '18%' }}></div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* Low Stock Table */}
            <div className="card">
                <p className="card-title">Low stock alerts</p>
                <table className="stock-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Stock</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Printer Paper A4</td>
                            <td>Supplies</td>
                            <td>12</td>
                            <td><span className="badge warning">Low</span></td>
                        </tr>
                        <tr>
                            <td>USB-C Cables</td>
                            <td>Electronics</td>
                            <td>4</td>
                            <td><span className="badge danger">Critical</span></td>
                        </tr>
                        <tr>
                            <td>Whiteboard Markers</td>
                            <td>Supplies</td>
                            <td>7</td>
                            <td><span className="badge warning">Low</span></td>
                        </tr>
                        <tr>
                            <td>Staplers</td>
                            <td>Supplies</td>
                            <td>0</td>
                            <td><span className="badge danger">Out of stock</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>

        </div>
    );
}

export default Dashboard;
