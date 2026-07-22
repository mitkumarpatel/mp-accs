import { events } from '@dropins/tools/event-bus.js';

const FEE_ROW_ATTR = 'data-custom-fee-row';

/**
 * Order GraphQL OrderTotal has no custom_fees field on ACCS (unlike CartPrices).
 * Derive applied fee(s) as the gap between grand total and known lines.
 *
 * @param {object} order Order drop-in model from order/data
 * @returns {{ label: string, amount: number, currency: string }[]}
 */
export function deriveOrderCustomFees(order) {
  if (!order) {
    return [];
  }

  // Prefer explicit fees if a future GraphQL/transformer field is present.
  if (Array.isArray(order.customFees) && order.customFees.length > 0) {
    return order.customFees
      .map((fee) => ({
        label: fee.label || 'Extra Fee',
        amount: Number(fee.amount?.value),
        currency: fee.amount?.currency || order.grandTotal?.currency,
      }))
      .filter((fee) => !Number.isNaN(fee.amount) && fee.amount > 0);
  }

  const grand = Number(order.grandTotal?.value);
  if (Number.isNaN(grand)) {
    return [];
  }

  const subtotal = Number(
    order.subtotalExclTax?.value ?? order.subtotalInclTax?.value ?? 0,
  );
  const shipping = Number(order.totalShipping?.value ?? 0);
  const tax = Number(order.totalTax?.value ?? 0);
  const discounts = (order.discounts || []).reduce(
    (sum, row) => sum + Math.abs(Number(row?.amount?.value || 0)),
    0,
  );
  const giftCards = (order.appliedGiftCards || []).reduce(
    (sum, row) => sum + Math.abs(Number(row?.appliedBalance?.value || 0)),
    0,
  );
  const giftCardTotal = Math.abs(Number(order.totalGiftCard?.value || 0));

  // grand ≈ subtotal + shipping + tax + fees - discounts - gift cards
  const withoutFees = subtotal + shipping + tax - discounts - giftCards - giftCardTotal;
  const feeAmount = Math.round((grand - withoutFees) * 100) / 100;

  if (feeAmount <= 0.009) {
    return [];
  }

  return [{
    label: 'Extra Fee',
    amount: feeAmount,
    currency: order.grandTotal?.currency || 'USD',
  }];
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  } catch {
    return `${currency || ''} ${amount.toFixed(2)}`.trim();
  }
}

function removeInjectedRows(root) {
  root.querySelectorAll(`[${FEE_ROW_ATTR}]`).forEach((el) => el.remove());
}

/**
 * Insert Extra Fee row(s) into Order Cost Summary before the Total row.
 *
 * @param {HTMLElement} block commerce-order-cost-summary block
 * @param {object} order order/data payload
 */
export function injectOrderCustomFeeRows(block, order) {
  const content = block.querySelector('.order-cost-summary-content');
  if (!content) {
    return false;
  }

  removeInjectedRows(content);

  const fees = deriveOrderCustomFees(order);
  if (fees.length === 0) {
    return true;
  }

  const totalRow = content.querySelector(
    '.order-cost-summary-content__description--total, .order-cost-summary-content__description--total-free',
  );

  fees.forEach((fee) => {
    const row = document.createElement('div');
    row.className = 'order-cost-summary-content__description order-cost-summary-content__description--custom-fee';
    row.setAttribute(FEE_ROW_ATTR, 'true');

    const header = document.createElement('div');
    header.className = 'order-cost-summary-content__description--header';

    const labelEl = document.createElement('span');
    labelEl.textContent = fee.label;

    const amountEl = document.createElement('span');
    amountEl.textContent = formatMoney(fee.amount, fee.currency);

    header.append(labelEl, amountEl);
    row.append(header);

    if (totalRow) {
      content.insertBefore(row, totalRow);
    } else {
      content.appendChild(row);
    }
  });

  return true;
}

/**
 * Keep trying until OrderCostSummary has rendered its content, then inject fees.
 *
 * @param {HTMLElement} block
 */
export function watchAndInjectOrderCustomFees(block) {
  const tryInject = (order) => {
    if (!order) {
      return;
    }
    if (injectOrderCustomFeeRows(block, order)) {
      return;
    }
    // Content not ready yet — retry briefly.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (injectOrderCustomFeeRows(block, order) || attempts >= 20) {
        clearInterval(timer);
      }
    }, 100);
  };

  events.on('order/data', tryInject, { eager: true });
}
