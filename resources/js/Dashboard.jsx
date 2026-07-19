import React from 'react';
import {
  BarChart3,
  Users,
  Boxes,
  TrendingUp,
  Calculator,
  Package,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

import '../css/dashboard.css';
function Dashboard({ onNavigate }) {
  

  return (
    <main className="dashboard-content-view">
              {/* ALL CONTENTS HERE!!!! */}
      
      <div class="parent">
        <div class="salesAnalytics-card">Sales Analytics</div>
        <div class="regionalBreakdown-card">Regional Breakdown</div>
        <div class="eoqActivity-card">Economic Order Quantity Activity</div>
        <div class="productSales-card">Product Sales</div>
        <div class="totalRevenue-card">Total Revenue</div>
        <div class="totalOrder-card"> TotalOrder</div>
        <div class="totalCustomer-card">Total Customers</div>
        <div class="lowStockalerts-card">Stock Alerts</div>
        <div class="catalogStatus-card">Catalog Status</div>
        
        
      </div>
            
    </main>
  );
}

export default Dashboard;
