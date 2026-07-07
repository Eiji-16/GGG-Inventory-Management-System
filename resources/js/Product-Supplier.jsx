import { useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts'; /* Charts Components */

import { Plus, Search, Trash2, Edit2, Mail, Phone, User } from 'lucide-react';

export default function Product_Supplier_Management() {
    const [products, setProducts] = useState([
    { id: 1, sku: 'SKU-044', name: 'Pro Laptop 15"', category: 'Electronics', supplier: 'Alpha Distributing', stock: 12, price: 45000, minStock: 15 },
    { id: 2, sku: 'SKU-152', name: 'Wireless Mouse', category: 'Accessories', supplier: 'Apex Global Trading', stock: 142, price: 850, minStock: 20 },
    { id: 3, sku: 'SKU-078', name: 'Ergonomic Desk Chair', category: 'Furniture', supplier: 'Omega Logistics Corp', stock: 0, price: 6200, minStock: 5 },
  ]);
}