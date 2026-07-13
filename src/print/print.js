import { CFG, money } from '../shared.js'

export function printThermal(html) {
  const old = document.getElementById('thermal-frame')
  if (old) old.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'thermal-frame'
  Object.assign(iframe.style, { position:'fixed', top:'-9999px', left:'-9999px', width:'80mm', height:'1px', border:'none' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;width:80mm;padding:4mm;line-height:1.6}.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px;font-weight:bold}.sm{font-size:10px;color:#555}.row{display:flex;justify-content:space-between}.ln{border-top:1px dashed #000;margin:5px 0}.bw{text-align:center;margin:6px 0}@page{margin:0;size:80mm auto}</style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  </head><body>${html}
  <script>window.addEventListener('load',function(){if(typeof JsBarcode!=='undefined'){document.querySelectorAll('.bc').forEach(function(el){try{JsBarcode(el,el.dataset.val,{format:'CODE128',width:1.4,height:38,displayValue:false})}catch(e){}})}setTimeout(function(){window.print()},400)})<\/script>
  </body></html>`)
  doc.close()
}

export function buildTicketSlip(ticket) {
  const comps = ticket.components_noted || []
  return `
    ${CFG.shop_logo ? `<div class="c"><img src="${CFG.shop_logo}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${CFG.shop_name||'Repair Shop'}</div>
    <div class="c sm">${CFG.shop_address||''}</div>
    <div class="c sm">${CFG.shop_phone||''}</div>
    <div class="ln"></div>
    <div class="c b">REPAIR TICKET</div>
    <div class="c lg">${ticket.invoice_number||ticket.ticket_number}</div>
    <div class="c sm">Ticket: ${ticket.ticket_number}</div>
    <div class="bw"><svg class="bc" data-val="${ticket.invoice_number||ticket.ticket_number}"></svg></div>
    <div class="ln"></div>
    <div class="row"><span>Customer</span><span>${ticket.customer_name}</span></div>
    <div class="row"><span>Phone</span><span>${ticket.customer_phone}</span></div>
    <div class="row"><span>Device</span><span>${ticket.device_brand} ${ticket.device_model}</span></div>
    ${ticket.imei ? `<div class="row"><span>IMEI</span><span class="sm">${ticket.imei}</span></div>` : ''}
    <div class="row"><span>Date</span><span>${new Date(ticket.created_at).toLocaleDateString()}</span></div>
    <div class="ln"></div>
    <div class="b">Issues Noted:</div>
    ${comps.length ? comps.map(c => {
      const label = c.tag === 'Custom' ? (c.customText || '') : (c.tag || '')
      return `<div class="row"><span>· ${c.name}${label ? ` (${label})` : ''}</span><span class="sm">${Number(c.price)>0 ? money(c.price) : ''}</span></div>`
    }).join('') : '<div class="sm">No components noted.</div>'}
    <div class="ln"></div>
    ${Number(ticket.labour_cost)>0 ? `<div class="row"><span>Labour Fee</span><span>${money(ticket.labour_cost)}</span></div>` : ''}
    <div class="row"><span>Estimated Quote</span><span>${money(ticket.estimated_quote)}</span></div>
    ${Number(ticket.advance_payment)>0 ? `<div class="row"><span>Advance Paid</span><span>${money(ticket.advance_payment)}${ticket.advance_method ? ` (${ticket.advance_method})` : ''}</span></div>` : ''}
    <div class="ln"></div>
    ${ticket.technician_note ? `<div class="sm">Note: ${ticket.technician_note}</div><div class="ln"></div>` : ''}
    ${CFG.terms_text ? `<div class="c sm">${CFG.terms_text}</div><div class="ln"></div>` : ''}
    <div class="ln"></div>
    <div class="c sm">Track your repair online:</div>
    <div class="c b">orbitoshop.ahwad.com/track</div>
    <div class="c sm">Ticket: ${ticket.ticket_number}</div>
    <div class="c sm">Thank you for your trust.</div>`
}

export function buildReceiptSlip(sale, isReprint = false) {
  const items = sale.items || []
  return `
    ${isReprint ? `<div style="text-align:center;font-size:16px;font-weight:900;border:3px solid #000;padding:4px 8px;margin-bottom:6px;letter-spacing:2px">★ DUPLICATE / REPRINT ★</div>` : ''}
    ${CFG.shop_logo ? `<div class="c"><img src="${CFG.shop_logo}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${CFG.shop_name||'Repair Shop'}</div>
    <div class="c sm">${CFG.shop_address||''}</div>
    <div class="c sm">${CFG.shop_phone||''}</div>
    <div class="ln"></div>
    <div class="c b">RECEIPT</div>
    <div class="c">${sale.receiptNo}</div>
    <div class="bw"><svg class="bc" data-val="${sale.receiptNo}"></svg></div>
    <div class="ln"></div>
    <div class="row"><span>Date</span><span>${new Date(sale.date||Date.now()).toLocaleDateString()}</span></div>
    ${sale.customer ? `<div class="row"><span>Customer</span><span>${sale.customer}</span></div>` : ''}
    ${sale.cashier  ? `<div class="row"><span>Cashier</span><span>${sale.cashier}</span></div>`  : ''}
    <div class="ln"></div>
    ${items.map(i => `
      <div class="row"><span>${i.name}</span>${i.variantName ? '' : `<span>${money(i.soldPrice*i.qty)}</span>`}</div>
      ${i.variantName ? `<div class="row"><span>&nbsp;&nbsp;${i.variantName}</span><span>${money(i.soldPrice*i.qty)}</span></div>` : ''}
      <div class="sm row"><span>  ${i.qty} × ${money(i.soldPrice)}${i.discount>0?` (disc ${money(i.discount)})`:''}</span></div>
    `).join('')}
    <div class="ln"></div>
    ${sale.discount>0 ? `<div class="row"><span>Discount</span><span>${money(sale.discount)}</span></div>` : ''}
    ${sale.labour>0   ? `<div class="row"><span>Labour</span><span>${money(sale.labour)}</span></div>`   : ''}
    ${sale.tax>0      ? `<div class="row"><span>Tax</span><span>${money(sale.tax)}</span></div>`         : ''}
    <div class="row b lg"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    <div class="row"><span>Payment</span><span>${sale.payment}</span></div>
    ${sale.payment==='Cash'&&sale.cashTendered>0 ? `
    <div class="row"><span>Cash Received</span><span>${money(sale.cashTendered)}</span></div>
    <div class="row"><span>Change Given</span><span>${money(sale.changeGiven||0)}</span></div>` : ''}
    <div class="ln"></div>
    <div class="c sm">${CFG.terms_text||'Thank you for your business.'}</div>`
}

export function buildSubInvoiceSlip(sub, parentTicket) {
  const comps = sub.components_noted || []
  return `
    ${CFG.shop_logo ? `<div class="c"><img src="${CFG.shop_logo}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${CFG.shop_name||'Repair Shop'}</div>
    <div class="c sm">${CFG.shop_address||''}</div>
    <div class="c sm">${CFG.shop_phone||''}</div>
    <div class="ln"></div>
    <div class="c b">SUB-INVOICE</div>
    <div class="c lg">${sub.invoice_number}</div>
    <div class="c sm">Linked to: ${parentTicket.invoice_number}</div>
    <div class="bw"><svg class="bc" data-val="${sub.invoice_number}"></svg></div>
    <div class="ln"></div>
    <div class="row"><span>Customer</span><span>${sub.customer_name}</span></div>
    <div class="row"><span>Device</span><span>${sub.device_brand} ${sub.device_model}</span></div>
    <div class="row"><span>Date</span><span>${new Date(sub.created_at||Date.now()).toLocaleDateString()}</span></div>
    <div class="ln"></div>
    <div class="b">Additional Work:</div>
    ${comps.length ? comps.map(c => `<div class="row"><span>· ${c.name}</span><span class="sm">${Number(c.price)>0?money(c.price):''}</span></div>`).join('') : '<div class="sm">No additional components.</div>'}
    <div class="ln"></div>
    ${Number(sub.labour_cost)>0 ? `<div class="row"><span>Labour Fee</span><span>${money(sub.labour_cost)}</span></div>` : ''}
    <div class="row b"><span>Sub-Invoice Total</span><span>${money(sub.estimated_quote)}</span></div>
    ${Number(sub.amount_paid)>0 ? `<div class="row"><span>Applied (advance credit)</span><span>${money(sub.amount_paid)}</span></div>` : ''}
    <div class="row b lg"><span>Balance Due</span><span>${money(sub.balance_due)}</span></div>
    <div class="ln"></div>
    ${sub.technician_note ? `<div class="sm">Note: ${sub.technician_note}</div><div class="ln"></div>` : ''}
    <div class="c sm">${CFG.terms_text||'Thank you for your business.'}</div>`
}

export function buildReturnSlip(data) {
  return `
    <div class="c b lg">${CFG.shop_name||'Retail Shop'}</div>
    <div class="c sm">${CFG.shop_address||''}</div>
    <div class="ln"></div>
    <div class="c b">RETURN / REFUND</div>
    <div class="ln"></div>
    <div class="row"><span>Original Invoice</span><span>${data.invoiceNumber}</span></div>
    <div class="row"><span>Date</span><span>${new Date().toLocaleDateString()}</span></div>
    <div class="ln"></div>
    ${data.items.map(i => `<div class="row"><span>${i.name} × ${i.qty}</span><span>${money(i.sold_price*i.qty)}</span></div>`).join('')}
    <div class="ln"></div>
    <div class="row b lg"><span>REFUND</span><span>${money(data.refund)}</span></div>
    <div class="row"><span>Method</span><span>${data.method}</span></div>
    <div class="ln"></div>
    <div class="c sm">Please retain this slip for your records.</div>`
}