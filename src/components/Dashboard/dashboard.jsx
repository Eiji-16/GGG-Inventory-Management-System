import React from 'react';
import './dashboard.css';

function Dashboard({ onNavigate }) {
  return (
    <main className="dashboard-content-view">
      <div className="dashboard-scroll-container">
        <div className="parent">

          <div className="salesAnalytics-card card">
            Sales Analytics
          </div>

          <div className="catalogStatus-card card">
            Catalog Status
          </div>

          <div className="totalRevenue-card card">
            Total Revenue
          </div>

          <div className="regionalBreakdown-card card">
            Regional Breakdown
          </div>

          <div className="eoqActivity-card card">
            Economic Order Quantity Activity
          </div>

          <div className="totalOrder-card card">
            Total Order
          </div>

          <div className="productSales-card card">
            Product Sales
          </div>

          <div className="lowStockalerts-card card">
            Stock Alerts
          </div>

          <div className="totalCustomer-card card">
            Total Customers
          </div>

        </div>
      </div>
    </main>
  );
}

export default Dashboard;
