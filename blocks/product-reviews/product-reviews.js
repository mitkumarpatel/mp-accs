import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { getProductSku } from '../../scripts/commerce.js';

const MAX_RATING = 5;

/**
 * Renders a star string for a numeric rating (e.g. "★★★★☆").
 * @param {number} rating - Rating value from 1 to 5
 * @returns {string} Star display string
 */
function renderStars(rating) {
  const filled = Math.min(Math.max(Math.round(rating), 0), MAX_RATING);
  let stars = '';

  for (let index = 1; index <= MAX_RATING; index += 1) {
    stars += index <= filled ? '★' : '☆';
  }

  return stars;
}

/**
 * Fetches product reviews for a SKU from the App Builder API.
 * @param {string} apiBase - Reviews API base URL
 * @param {string} sku - Product SKU
 * @returns {Promise<object>} Reviews API response
 */
async function fetchReviews(apiBase, sku) {
  const url = new URL(`${apiBase.replace(/\/$/, '')}/get-ratings`);
  url.searchParams.set('sku', sku);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to load reviews (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to load reviews');
  }

  return data;
}

/**
 * Builds a single review card: title + stars row, indented review text, author.
 * @param {object} review - Review object from API
 * @returns {HTMLElement} Review card element
 */
function renderReviewItem(review) {
  const item = document.createElement('article');
  item.className = 'product-reviews__item';

  const head = document.createElement('div');
  head.className = 'product-reviews__item-head';

  const title = document.createElement('h3');
  title.className = 'product-reviews__title';
  title.textContent = review.title;

  const stars = document.createElement('span');
  stars.className = 'product-reviews__stars';
  stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
  stars.textContent = renderStars(review.rating);

  head.append(title, stars);

  const body = document.createElement('div');
  body.className = 'product-reviews__body';

  const text = document.createElement('p');
  text.className = 'product-reviews__text';
  text.textContent = review.review;

  const author = document.createElement('p');
  author.className = 'product-reviews__author';
  author.textContent = `— ${review.author || 'Anonymous'}`;

  body.append(text, author);
  item.append(head, body);
  return item;
}

/**
 * Renders the reviews section header.
 * @param {object} data - Reviews API response
 * @returns {HTMLElement} Header element
 */
function renderHeader(data) {
  const header = document.createElement('div');
  header.className = 'product-reviews__header';

  const heading = document.createElement('h2');
  heading.className = 'product-reviews__heading';

  const countLabel = data.reviewCount === 1 ? 'review' : 'reviews';
  heading.textContent = data.reviewCount > 0
    ? `Customer Reviews (${data.reviewCount} ${countLabel})`
    : 'Customer Reviews';

  header.append(heading);
  return header;
}

/**
 * Renders a status message inside the block.
 * @param {string} message - Message text
 * @param {string} [modifier] - Optional BEM modifier class suffix
 * @returns {HTMLElement} Message element
 */
function renderMessage(message, modifier = '') {
  const element = document.createElement('p');
  element.className = modifier
    ? `product-reviews__message product-reviews__message--${modifier}`
    : 'product-reviews__message';
  element.textContent = message;
  return element;
}

export default async function decorate(block) {
  block.textContent = '';
  block.classList.add('product-reviews');

  const sku = getProductSku();
  const apiBase = getConfigValue('product-reviews-api-base');

  if (!sku) {
    block.append(renderMessage('Product SKU not available.'));
    return;
  }

  if (!apiBase) {
    block.append(renderMessage('Reviews API is not configured.'));
    return;
  }

  block.append(renderMessage('Loading reviews...'));

  try {
    const data = await fetchReviews(apiBase, sku);
    block.textContent = '';
    block.append(renderHeader(data));

    const list = document.createElement('div');
    list.className = 'product-reviews__list';

    if (!data.reviews?.length) {
      list.append(renderMessage('No reviews yet. Be the first to review this product.'));
    } else {
      data.reviews.forEach((review) => {
        list.append(renderReviewItem(review));
      });
    }

    block.append(list);
  } catch (error) {
    block.textContent = '';
    block.append(renderMessage('Unable to load reviews. Please try again later.', 'error'));
    console.error('Product reviews error:', error);
  }
}
