import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { getProductSku } from '../../scripts/commerce.js';

const MAX_RATING = 5;

/**
 * Builds a visual star rating element with filled and empty stars.
 * @param {number} rating - Rating value from 1 to 5
 * @returns {HTMLElement} Star rating element
 */
function renderStarsElement(rating) {
  const value = Math.min(Math.max(Math.round(rating), 0), MAX_RATING);
  const container = document.createElement('span');
  container.className = 'product-reviews__stars';
  container.setAttribute('aria-label', `${value} out of 5 stars`);

  for (let index = 1; index <= MAX_RATING; index += 1) {
    const star = document.createElement('span');
    star.className = index <= value
      ? 'product-reviews__star product-reviews__star--filled'
      : 'product-reviews__star product-reviews__star--empty';
    star.textContent = '★';
    star.setAttribute('aria-hidden', 'true');
    container.append(star);
  }

  return container;
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
 * Submits a new product review.
 * @param {string} apiBase - Reviews API base URL
 * @param {object} payload - Review payload
 * @returns {Promise<object>} Create review API response
 */
async function submitReview(apiBase, payload) {
  const response = await fetch(`${apiBase.replace(/\/$/, '')}/create-review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Failed to submit review (${response.status})`);
  }

  return data;
}

/**
 * Builds a single review card.
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

  head.append(title, renderStarsElement(review.rating));

  const body = document.createElement('div');
  body.className = 'product-reviews__body';

  const text = document.createElement('p');
  text.className = 'product-reviews__text';
  text.textContent = review.review;

  const author = document.createElement('p');
  author.className = 'product-reviews__author';
  author.textContent = `By ${review.author || 'Anonymous'}`;

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

/**
 * Renders the interactive star rating picker.
 * @param {HTMLInputElement} ratingInput - Hidden rating input
 * @returns {HTMLElement} Rating picker element
 */
function renderRatingPicker(ratingInput) {
  const picker = document.createElement('div');
  picker.className = 'product-reviews__rating-picker';
  picker.setAttribute('role', 'radiogroup');
  picker.setAttribute('aria-label', 'Select your rating');

  const updateSelection = (value) => {
    ratingInput.value = String(value);
    picker.querySelectorAll('.product-reviews__rating-star').forEach((button, index) => {
      const isActive = index < value;
      button.classList.toggle('product-reviews__rating-star--active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  };

  for (let value = 1; value <= MAX_RATING; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'product-reviews__rating-star';
    button.textContent = '★';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.setAttribute('aria-label', `${value} star${value === 1 ? '' : 's'}`);
    button.dataset.value = String(value);

    button.addEventListener('click', () => {
      updateSelection(value);
    });

    picker.append(button);
  }

  ratingInput.addEventListener('invalid', () => {
    picker.classList.add('product-reviews__rating-picker--error');
  });

  ratingInput.addEventListener('change', () => {
    if (ratingInput.value) {
      picker.classList.remove('product-reviews__rating-picker--error');
    }
  });

  return picker;
}

/**
 * Renders the review submission form.
 * @param {string} sku - Product SKU from PDP
 * @param {string} apiBase - Reviews API base URL
 * @param {() => Promise<void>} onSuccess - Callback after successful submit
 * @returns {HTMLElement} Form element
 */
function renderReviewForm(sku, apiBase, onSuccess) {
  const form = document.createElement('form');
  form.className = 'product-reviews__form';
  form.noValidate = true;

  const title = document.createElement('h3');
  title.className = 'product-reviews__form-title';
  title.textContent = 'Write a Review';
  form.append(title);

  const ratingField = document.createElement('div');
  ratingField.className = 'product-reviews__field';

  const ratingLabel = document.createElement('label');
  ratingLabel.className = 'product-reviews__label';
  ratingLabel.textContent = 'Your Rating *';

  const ratingInput = document.createElement('input');
  ratingInput.type = 'hidden';
  ratingInput.name = 'rating';
  ratingInput.required = true;

  const ratingPicker = renderRatingPicker(ratingInput);
  ratingField.append(ratingLabel, ratingInput, ratingPicker);
  form.append(ratingField);

  const fields = [
    {
      id: 'product-review-title',
      name: 'title',
      label: 'Review Title *',
      type: 'text',
      maxLength: 120,
    },
    {
      id: 'product-review-text',
      name: 'review',
      label: 'Your Review *',
      type: 'textarea',
      maxLength: 2000,
    },
    {
      id: 'product-review-author',
      name: 'author',
      label: 'Your Name *',
      type: 'text',
      maxLength: 80,
    },
  ];

  fields.forEach((field) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'product-reviews__field';

    const label = document.createElement('label');
    label.className = 'product-reviews__label';
    label.htmlFor = field.id;
    label.textContent = field.label;

    let control;
    if (field.type === 'textarea') {
      control = document.createElement('textarea');
      control.rows = 4;
    } else {
      control = document.createElement('input');
      control.type = field.type;
    }

    control.id = field.id;
    control.name = field.name;
    control.className = 'product-reviews__input';
    control.required = true;
    control.maxLength = field.maxLength;

    wrapper.append(label, control);
    form.append(wrapper);
  });

  const status = document.createElement('p');
  status.className = 'product-reviews__form-status';
  status.hidden = true;
  form.append(status);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'button product-reviews__submit';
  submitButton.textContent = 'Submit Review';
  form.append(submitButton);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.hidden = true;
    status.className = 'product-reviews__form-status';

    if (!ratingInput.value) {
      ratingPicker.classList.add('product-reviews__rating-picker--error');
      status.hidden = false;
      status.classList.add('product-reviews__form-status--error');
      status.textContent = 'Please select a rating from 1 to 5 stars.';
      return;
    }

    if (!form.reportValidity()) {
      return;
    }

    const formData = new FormData(form);
    const payload = {
      sku,
      rating: Number(formData.get('rating')),
      title: String(formData.get('title')).trim(),
      review: String(formData.get('review')).trim(),
      author: String(formData.get('author')).trim(),
    };

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    try {
      await submitReview(apiBase, payload);
      form.reset();
      ratingPicker.querySelectorAll('.product-reviews__rating-star').forEach((button) => {
        button.classList.remove('product-reviews__rating-star--active');
        button.setAttribute('aria-checked', 'false');
      });
      ratingInput.value = '';
      ratingPicker.classList.remove('product-reviews__rating-picker--error');

      status.hidden = false;
      status.classList.add('product-reviews__form-status--success');
      status.textContent = 'Thank you! Your review has been submitted.';

      await onSuccess();
    } catch (error) {
      status.hidden = false;
      status.classList.add('product-reviews__form-status--error');
      status.textContent = error.message || 'Unable to submit your review. Please try again.';
      console.error('Product review submit error:', error);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Review';
    }
  });

  return form;
}

/**
 * Renders reviews list from API data.
 * @param {object} data - Reviews API response
 * @returns {HTMLElement} Reviews list element
 */
function renderReviewsList(data) {
  const list = document.createElement('div');
  list.className = 'product-reviews__list';

  if (!data.reviews?.length) {
    list.append(renderMessage('No reviews yet. Be the first to review this product.'));
  } else {
    data.reviews.forEach((review) => {
      list.append(renderReviewItem(review));
    });
  }

  return list;
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

  const headerSlot = document.createElement('div');
  headerSlot.className = 'product-reviews__header-slot';
  const listSlot = document.createElement('div');
  listSlot.className = 'product-reviews__list-slot';
  const formSlot = document.createElement('div');
  formSlot.className = 'product-reviews__form-slot';

  block.append(
    renderMessage('Loading reviews...'),
    headerSlot,
    listSlot,
    formSlot,
  );

  const refreshReviews = async () => {
    const data = await fetchReviews(apiBase, sku);
    headerSlot.replaceChildren(renderHeader(data));
    listSlot.replaceChildren(renderReviewsList(data));
    return data;
  };

  try {
    await refreshReviews();
    block.querySelector('.product-reviews__message')?.remove();
    formSlot.append(renderReviewForm(sku, apiBase, refreshReviews));
  } catch (error) {
    block.textContent = '';
    block.append(renderMessage('Unable to load reviews. Please try again later.', 'error'));
    console.error('Product reviews error:', error);
  }
}
