import { render as orderRenderer } from '@dropins/storefront-order/render.js';
import { OrderCostSummary } from '@dropins/storefront-order/containers/OrderCostSummary.js';
import { watchAndInjectOrderCustomFees } from '../../scripts/order-cost-summary-custom-fees.js';

// Initialize
import '../../scripts/initializers/order.js';

export default async function decorate(block) {
  await orderRenderer.render(OrderCostSummary, {})(block);
  // OrderTotal GraphQL has no custom_fees on ACCS — inject derived Extra Fee row(s).
  watchAndInjectOrderCustomFees(block);
}
