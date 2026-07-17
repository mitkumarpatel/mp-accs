import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-cart/api.js';
import { initializeDropin } from './index.js';
import { CORE_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  // Set Fetch GraphQL (Core)
  setEndpoint(CORE_FETCH_GRAPHQL);

  // Fetch placeholders
  const labels = await fetchPlaceholders('placeholders/cart.json');

  const langDefinitions = {
    default: {
      ...labels,
    },
  };

  // Initialize cart (map GraphQL custom_fees onto CartModel.customFees)
  return initializers.mountImmediately(initialize, {
    langDefinitions,
    models: {
      CartModel: {
        transformer: (data) => {
          // Always set an array so disable clears any previous customFees on the model.
          const rawFees = data?.prices?.custom_fees;
          return {
            customFees: Array.isArray(rawFees)
              ? rawFees.map((fee) => ({
                code: fee?.code,
                label: fee?.label,
                amount: {
                  value: fee?.amount?.value,
                  currency: fee?.amount?.currency,
                },
              }))
              : [],
          };
        },
      },
    },
  });
})();
