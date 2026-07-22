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

function getTotalRow(block) {
  const content = block.querySelector('.order-cost-summary-content');
  if (!content) {
    return null;
  }
  if (
    content.classList.contains('order-cost-summary-content-skeleton')
    || content.querySelector('.dropin-skeleton, [class*="Skeleton"]')
  ) {
    return null;
  }
  return content.querySelector(
    '.order-cost-summary-content__description--total, .order-cost-summary-content__description--total-free',
  );
}

function buildFeeRow(fee) {
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
  return row;
}

/**
 * Insert Extra Fee row(s) into Order Cost Summary before the Total row.
 *
 * @param {HTMLElement} block commerce-order-cost-summary block
 * @param {object} order order/data payload
 * @returns {boolean} true when summary is ready (injected or nothing to show)
 */
export function injectOrderCustomFeeRows(block, order) {
  const totalRow = getTotalRow(block);
  if (!totalRow || !totalRow.parentNode) {
    return false;
  }

  removeInjectedRows(block);

  const fees = deriveOrderCustomFees(order);
  if (fees.length === 0) {
    return true;
  }

  // If rows already match, skip to avoid MutationObserver loops.
  const existing = [...block.querySelectorAll(`[${FEE_ROW_ATTR}]`)];
  if (
    existing.length === fees.length
    && existing.every((el, i) => el.textContent?.includes(String(fees[i].amount)))
  ) {
    return true;
  }

  fees.forEach((fee) => {
    // Re-query parent in case DOM shifted during previous insert.
    const currentTotal = getTotalRow(block);
    if (!currentTotal?.parentNode) {
      return;
    }
    try {
      currentTotal.parentNode.insertBefore(buildFeeRow(fee), currentTotal);
    } catch {
      // Ignore transient DOM races during Preact re-render.
    }
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
  let injectScheduled = false;
  let injecting = false;

  if (typeof events.lastPayload === 'function') {
    latestOrder = events.lastPayload('order/data') || null;
  }

  const tryInject = () => {
    if (!latestOrder || injecting) {
      return;
    }
    injecting = true;
    try {
      injectOrderCustomFeeRows(block, latestOrder);
    } finally {
      injecting = false;
    }
  };

  const scheduleInject = () => {
    if (injectScheduled) {
      return;
    }
    injectScheduled = true;
    requestAnimationFrame(() => {
      injectScheduled = false;
      tryInject();
    });
  };

  events.on(
    'order/data',
    (order) => {
      latestOrder = order;
      scheduleInject();
      setTimeout(scheduleInject, 100);
      setTimeout(scheduleInject, 300);
    },
    { eager: true },
  );

  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused only by our fee rows.
    const relevant = mutations.some((m) => {
      const nodes = [...m.addedNodes, ...m.removedNodes];
      return nodes.some(
        (node) => node.nodeType === 1
          && !(node instanceof Element && node.hasAttribute?.(FEE_ROW_ATTR)),
      );
    });
    if (relevant) {
      scheduleInject();
    }
  });
  observer.observe(block, { childList: true, subtree: true });

  scheduleInject();
}
