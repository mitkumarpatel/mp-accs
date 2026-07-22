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
  const shipping = Number(
    order.totalShipping?.value
      ?? order.shipping?.amount
      ?? 0,
  );
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

function getCostSummaryContent(block) {
  const content = block.querySelector('.order-cost-summary-content');
  if (!content) {
    return null;
  }
  // Skip skeleton markup — Preact will replace it and wipe injected nodes.
  if (
    content.classList.contains('order-cost-summary-content-skeleton')
    || content.querySelector('.dropin-skeleton, [class*="Skeleton"]')
  ) {
    return null;
  }
  const totalRow = content.querySelector(
    '.order-cost-summary-content__description--total, .order-cost-summary-content__description--total-free',
  );
  if (!totalRow) {
    return null;
  }
  return { content, totalRow };
}

/**
 * Insert Extra Fee row(s) into Order Cost Summary before the Total row.
 *
 * @param {HTMLElement} block commerce-order-cost-summary block
 * @param {object} order order/data payload
 * @returns {boolean} true when summary is ready (injected or nothing to show)
 */
export function injectOrderCustomFeeRows(block, order) {
  const ready = getCostSummaryContent(block);
  if (!ready) {
    return false;
  }

  const { content, totalRow } = ready;
  removeInjectedRows(content);

  const fees = deriveOrderCustomFees(order);
  if (fees.length === 0) {
    return true;
  }

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
    content.insertBefore(row, totalRow);
  });

  return true;
}

/**
 * Re-inject whenever OrderCostSummary (re)renders — Preact replaces DOM and
 * would otherwise wipe a one-time injection.
 *
 * @param {HTMLElement} block
 */
export function watchAndInjectOrderCustomFees(block) {
  let latestOrder = null;
  if (typeof events.lastPayload === 'function') {
    latestOrder = events.lastPayload('order/data') || null;
  }

  const tryInject = () => {
    if (!latestOrder) {
      return;
    }
    injectOrderCustomFeeRows(block, latestOrder);
  };

  events.on(
    'order/data',
    (order) => {
      latestOrder = order;
      // Defer so Preact can finish painting the cost summary first.
      requestAnimationFrame(() => {
        tryInject();
        setTimeout(tryInject, 50);
        setTimeout(tryInject, 200);
        setTimeout(tryInject, 500);
      });
    },
    { eager: true },
  );

  const observer = new MutationObserver(() => {
    tryInject();
  });
  observer.observe(block, { childList: true, subtree: true });

  tryInject();
}
