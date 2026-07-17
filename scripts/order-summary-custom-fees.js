import { h } from '@dropins/tools/preact.js';
import { Price } from '@dropins/tools/components.js';
import { getCartDataFromCache } from '@dropins/storefront-cart/api.js';
import OrderSummaryLine from '@dropins/storefront-cart/containers/OrderSummaryLine.js';

/**
 * Append Totals Collector custom fee rows to Cart Order Summary lines.
 * Expects cart model field `customFees` from the CartModel transformer.
 *
 * @param {Array} lineItems Order summary line items from OrderSummary.updateLineItems
 * @returns {Array} Updated line items
 */
export function appendCustomFeeLineItems(lineItems) {
  const cart = getCartDataFromCache();
  const fees = cart?.customFees;

  if (!Array.isArray(fees) || fees.length === 0) {
    return lineItems;
  }

  fees.forEach((fee, index) => {
    const value = fee?.amount?.value;
    if (value == null || Number.isNaN(Number(value))) {
      return;
    }

    lineItems.push({
      key: `customFee_${fee.code || index}`,
      sortOrder: 350,
      content: h(OrderSummaryLine, {
        label: fee.label || 'Extra Fee',
        price: h(Price, {
          amount: Number(value),
          currency: fee.amount?.currency,
          weight: 'bold',
        }),
        classSuffixes: ['custom-fee'],
      }),
    });
  });

  return lineItems;
}
