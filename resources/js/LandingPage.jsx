import React from 'react';
import {
  BarChart3,
  Users,
  Boxes,
  TrendingUp,
  Calculator,
  FileText,
  ArrowRight,
  Package,
  AlertCircle
} from 'lucide-react';

function LandingPage({ onNavigate }) {
  // Sample stats data
  const stats = [
    {
      icon: Package,
      label: 'Total Products',
      value: '1,243',
      color: '#FFD700',
      trend: '+12% from last month'
    },
    {
      icon: Boxes,
      label: 'Current Stock',
      value: '5,890 units',
      color: '#0066CC',
      trend: '+8% increase'
    },
    {
      icon: Users,
      label: 'Suppliers',
      value: '48',
      color: '#00AA00',
      trend: '5 new this month'
    },
    {
      icon: TrendingUp,
      label: 'Forecast Accuracy',
      value: '94.2%',
      color: '#FF6B35',
      trend: 'Best performance'
    }
  ];

  // Quick actions
  const quickActions = [
    {
      icon: Boxes,
      title: 'Stock Control',
      description: 'Monitor and manage your inventory levels',
      action: 'Stock',
      color: '#0066CC'
    },
    {
      icon: Users,
      title: 'Product & Supplier',
      description: 'Manage products and supplier information',
      action: 'Product-Supplier',
      color: '#00AA00'
    },
    {
      icon: Calculator,
      title: 'EOQ Calculator',
      description: 'Calculate optimal order quantities',
      action: 'EOQ',
      color: '#FFD700'
    },
    {
      icon: TrendingUp,
      title: 'Forecasting',
      description: 'Predict future demand trends',
      action: 'Forecasting',
      color: '#FF6B35'
    },
    {
      icon: BarChart3,
      title: 'Reports',
      description: 'View detailed inventory reports',
      action: 'Reports',
      color: '#9B59B6'
    },
    {
      icon: AlertCircle,
      title: 'Alerts',
      description: 'Low stock warnings and notifications',
      action: 'Alerts',
      color: '#E74C3C'
    }
  ];

  const recentActivity = [
    { id: 1, action: 'Stock Updated', item: 'Product #SK-2024-001', time: '2 hours ago', status: 'success' },
    { id: 2, action: 'New Supplier Added', item: 'Premium Materials Inc.', time: '5 hours ago', status: 'success' },
    { id: 3, action: 'Low Stock Alert', item: 'Product #SK-2024-042', time: '1 day ago', status: 'warning' },
    { id: 4, action: 'Order Received', item: 'Batch #ORD-2024-1523', time: '2 days ago', status: 'success' }
  ];

  return (
    <div className="landing-page-container">
      {/* Welcome Section */}
      <section className="landing-welcome-section">
        <div className="welcome-content">
          <h1>Welcome to GGG Inventory Management System</h1>
          <p>Streamline your inventory operations with powerful tools for stock control, demand forecasting, and supplier management.</p>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="landing-stats-section">
        <h2 className="section-title">Performance Overview</h2>
        <div className="stats-grid">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="stat-card">
                <div className="stat-icon-wrapper" style={{ borderColor: stat.color }}>
                  <Icon className="stat-icon" style={{ color: stat.color }} />
                </div>
                <div className="stat-content">
                  <p className="stat-label">{stat.label}</p>
                  <h3 className="stat-value">{stat.value}</h3>
                  <p className="stat-trend">{stat.trend}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="landing-actions-section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="actions-grid">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                className="action-card"
                onClick={() => onNavigate(action.action)}
                style={{ borderLeftColor: action.color }}
              >
                <Icon className="action-icon" style={{ color: action.color }} />
                <h3>{action.title}</h3>
                <p>{action.description}</p>
                <div className="action-footer">
                  <span>Get Started</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="landing-activity-section">
        <div className="activity-header">
          <h2 className="section-title">Recent Activity</h2>
        </div>
        <div className="activity-list">
          {recentActivity.map((activity) => (
            <div key={activity.id} className="activity-item">
              <div className="activity-marker" style={{
                backgroundColor: activity.status === 'success' ? '#00AA00' : '#FF9500'
              }}></div>
              <div className="activity-content">
                <div className="activity-main">
                  <p className="activity-action">{activity.action}</p>
                  <p className="activity-item-name">{activity.item}</p>
                </div>
                <p className="activity-time">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features-section">
        <h2 className="section-title">System Features</h2>
        <div className="features-grid">
          <div className="feature-box">
            <Boxes className="feature-icon" style={{ color: '#0066CC' }} />
            <h3>Real-time Stock Tracking</h3>
            <p>Monitor inventory levels across multiple locations in real-time</p>
          </div>
          <div className="feature-box">
            <Calculator className="feature-icon" style={{ color: '#FFD700' }} />
            <h3>Smart EOQ Calculation</h3>
            <p>Automatically calculate optimal order quantities to minimize costs</p>
          </div>
          <div className="feature-box">
            <TrendingUp className="feature-icon" style={{ color: '#FF6B35' }} />
            <h3>Demand Forecasting</h3>
            <p>Predict future demand with advanced forecasting algorithms</p>
          </div>
          <div className="feature-box">
            <BarChart3 className="feature-icon" style={{ color: '#9B59B6' }} />
            <h3>Comprehensive Reports</h3>
            <p>Generate detailed reports and analytics for data-driven decisions</p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="landing-cta-section">
        <h2>Ready to Optimize Your Inventory?</h2>
        <p>Start by exploring your stock levels or running a demand forecast</p>
        <div className="cta-buttons">
          <button className="cta-btn primary-btn" onClick={() => onNavigate('Stock')}>
            View Stock Control
          </button>
          <button className="cta-btn secondary-btn" onClick={() => onNavigate('Forecasting')}>
            Run Forecast
          </button>
        </div>
      </section>
    </div>
  );
}

export default LandingPage;
