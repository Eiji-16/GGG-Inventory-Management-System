import exportReportWorkbook, { printReportPdf } from './exportReportWorkbook';

/* ==========================================================================
   ORDER REPORT (Reorder List → prepared orders)

   The file that goes to the person who does the buying (outside the system).
   Uses the same Excel / PDF report layout as Reports.

   order = {
     reference?   'ORD-20261103-001' once saved (blank for a draft)
     preparedAt?  ISO date-time (now for a draft)
     preparedBy?  name
     items: [{ productName, variantName?, supplierName?, recommendedQty?,
               recommendedBasis?, plannedQty, receivedQty? }]
   }
   ========================================================================== */

const dateText = (iso) => new Date(iso || Date.now()).toLocaleDateString('en-PH', { dateStyle: 'long' });
const num = (value) => (value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('en-PH'));

function buildReport(order) {
  const items = order.items || [];
  const showReceived = items.some((item) => Number(item.receivedQty) > 0);
  const totalPlanned = items.reduce((sum, item) => sum + (Number(item.plannedQty) || 0), 0);
  const totalRecommended = items.reduce((sum, item) => sum + (Number(item.recommendedQty) || 0), 0);
  const prepared = dateText(order.preparedAt);

  const headers = ['Product', 'Variant', 'Supplier', 'System recommended', 'Planned order quantity'];
  if (showReceived) headers.push('Received so far', 'Still to receive');

  const rows = items.map((item) => {
    const row = [
      item.productName,
      item.variantName || '—',
      item.supplierName || '—',
      num(item.recommendedQty),
      num(item.plannedQty),
    ];
    if (showReceived) {
      const received = Number(item.receivedQty) || 0;
      row.push(num(received), num(Math.max(0, (Number(item.plannedQty) || 0) - received)));
    }
    return row;
  });
  const totalRow = ['Total', '', '', num(totalRecommended), num(totalPlanned)];
  if (showReceived) {
    const received = items.reduce((sum, item) => sum + (Number(item.receivedQty) || 0), 0);
    totalRow.push(num(received), num(Math.max(0, totalPlanned - received)));
  }
  rows.push(totalRow);

  const summary = [
    { label: 'Order reference', value: order.reference || 'Not saved yet' },
    { label: 'Prepared on', value: prepared },
    { label: 'Products', value: items.length },
    { label: 'Total planned quantity', value: totalPlanned.toLocaleString('en-PH') },
  ];
  if (order.preparedBy) summary.splice(2, 0, { label: 'Prepared by', value: order.preparedBy });

  return {
    title: 'Order Report',
    subtitle: `${order.reference ? `${order.reference} · ` : ''}Prepared ${prepared}`,
    summary,
    sections: [{ title: 'Products to order', headers, rows }],
    scope: 'System recommended = Economic Order Quantity, √(2 × annual demand × ordering cost ÷ holding cost); '
      + 'when a product has no ordering or holding cost yet, it is reorder point + 1 − stock on hand. '
      + 'Planned order quantity = the amount the owner decided to order.',
    note: 'Planning list for the person responsible for purchasing. Buying happens outside the system; '
      + 'stock is only updated when the delivery is received and its actual quantity is recorded.',
    columnWidths: showReceived ? [28, 16, 20, 18, 20, 16, 16] : [30, 18, 22, 20, 22],
    fileName: `order-report-${order.reference || new Date().toISOString().slice(0, 10)}`,
  };
}

export async function exportOrderExcel(order) {
  const report = buildReport(order);
  await exportReportWorkbook(report);
}

/** Opens the print window (Save as PDF). Returns false when pop-ups are blocked. */
export function printOrderPdf(order) {
  const { columnWidths, fileName, ...report } = buildReport(order);
  return printReportPdf(report);
}
