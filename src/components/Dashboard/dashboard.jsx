import React from 'react';
import './dashboard.css';
/*--------------------------------------------------Sample data's--------------------------------------------------*/

/*--------------------------------------------------Sample data's End--------------------------------------------------*/




function Dashboard({ onNavigate }) {
  return (
    <main className="dashboard-content-view">
      <div className="dashboard-scroll-container">
         {/* Parent Cards */}
        <div className="parent">

           {/* Card Name */}
          <div className="salesAnalytics-card card">
            Sales Analytics
          </div>

            {/* Card Name */}
          <div className="catalogStatus-card card">
            Catalog Status
          </div>

            {/* Card Name */}
          <div className="totalRevenue-card card">
            Total Revenue
          </div>

            {/* Card Name */}
          <div className="regionalBreakdown-card card">
            Regional Breakdown
          </div>

            {/* Card Name */}
          <div className="eoqActivity-card card">
            Economic Order Quantity Activity
          </div>

            {/* Card Name */}
          <div className="totalOrder-card card">
            Total Order
          </div>

            {/* Card Name */}
          <div className="productSales-card card">
            Product Sales
          </div>

            {/* Card Name */}
          <div className="lowStockalerts-card card">
            Stock Alerts
          </div>

            {/* Card Name */}
          <div className="totalCustomer-card card">
            Total Customers
          </div>

        </div>
      </div>
    </main>
  );
}

export default Dashboard;
