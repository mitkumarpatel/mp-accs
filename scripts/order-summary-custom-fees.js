import { h } from '@dropins/tools/preact.js';
import { Price } from '@dropins/tools/components.js';
import { events } from '@dropins/tools/event-bus.js';
import { getCartDataFromCache } from '@dropins/storefront-cart/api.js';
import OrderSummaryLine from '@dropins/storefront-cart/containers/OrderSummaryLine.js';

/**
 * Keep latest fees from cart/data so Order Summary does not reuse a stale
 * session cache after Extra Fee is disabled in Admin.
 */
let latestCustomFees = [];

function normalizeFees(fees) {
  if (!Array.isArray(fees)) {
    return [];
  }
  return fees.filter((fee) => {
    const value = Number(fee?.amount?.value);
    return !Number.isNaN(value) && value > 0;
  });
}

function syncFeesFromCart(cart) {
  latestCustomFees = normalizeFees(cart?.customFees);
}

events.on(
  'cart/data',
  (cart) => {
    syncFeesFromCart(cart);
  },
  { eager: true },
);

/**
 * Fee rows must not show when grand total already excludes them
 * (e.g. Admin disabled Extra Fee but GraphQL/cache still has old customFees).
 */
function feesAreIncludedInGrandTotal(cart, fees) {
  const feeSum = fees.reduce(
    (sum, fee) => sum + Number(fee?.amount?.value || 0),
    0,
  );
  if (feeSum <= 0) {
    return false;
  }

  const total = Number(
    cart?.total?.includingTax?.value ?? cart?.total?.excludingTax?.value,
  );
  if (Number.isNaN(total)) {
    return true;
  }

  const subtotal = Number(
    cart?.subtotal?.excludingTax?.value
      ?? cart?.subtotal?.includingTax?.value
      ?? 0,
  );
  const shipping = Number(cart?.shipping?.value ?? 0);
  const tax = Number(
    cart?.totalTax?.value
      ?? (cart?.appliedTaxes || []).reduce(
        (sum, row) => sum + Number(row?.amount?.value || 0),
        0,
      )
      ?? 0,
  );

  const withoutFees = subtotal + shipping + tax;
  const withFees = withoutFees + feeSum;

  // Prefer matching the actual grand total: hide when total matches "no fee".
  if (Math.abs(total - withoutFees) < 0.02) {
    return false;
  }
  if (Math.abs(total - withFees) < 0.02) {
    return true;
  }

  // Otherwise show only if total is closer to the with-fee sum.
  return Math.abs(total - withFees) < Math.abs(total - withoutFees);
}

/**
 * Append Totals Collector custom fee rows to Cart Order Summary lines.
 * Expects cart model field `customFees` from the CartModel transformer.
 *
 * @param {Array} lineItems Order summary line items from OrderSummary.updateLineItems
 * @returns {Array} Updated line items
 */
export function appendCustomFeeLineItems(lineItems) {
  const cart = getCartDataFromCache();
  syncFeesFromCart(cart);

  const fees = latestCustomFees;

  if (fees.length === 0 || !feesAreIncludedInGrandTotal(cart, fees)) {
    return lineItems;
  }

  fees.forEach((fee, index) => {
    lineItems.push({
      key: `customFee_${fee.code || index}`,
      sortOrder: 350,
      content: h(OrderSummaryLine, {
        label: fee.label || 'Extra Fee',
        price: h(Price, {
          amount: Number(fee.amount.value),
          currency: fee.amount?.currency,
          weight: 'bold',
        }),
        classSuffixes: ['custom-fee'],
      }),
    });
  });

  return lineItems;
}
