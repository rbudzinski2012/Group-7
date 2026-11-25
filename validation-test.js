
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateSubscriptionPayload,
  VALID_FREQUENCIES,
  VALID_STATUSES
} = require('./validation.js');

// Helper function to create a valid subscription payload.
// Individual fields can be overridden for specific test cases.
function createValidPayload(overrides = {}) {
  return {
    name: 'Netflix',
    category_id: 1,
    amount_cents: 1599,
    frequency: 'monthly',
    status: 'active',
    ...overrides
  };
}

// Valid Subscription Payload Tests

test('Accepts a valid subscription payload', () => {
  const result = validateSubscriptionPayload(
    createValidPayload()
  );

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);

  assert.deepEqual(result.cleaned, {
    name: 'Netflix',
    categoryId: 1,
    amountCents: 1599,
    frequency: 'monthly',
    status: 'active'
  });
});

test('Returns multiple errors for multiple invalid fields', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({
      name: '',
      category_id: -1,
      amount_cents: 0,
      frequency: 'daily',
      status: 'unknown'
    })
  );

  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 5);
});

// Request Body Validation Tests

test('Rejects a null request body', () => {
  const result = validateSubscriptionPayload(null);

  assert.equal(result.isValid, false);
  assert.deepEqual(result.errors, [
    'Request body must be a JSON object.'
  ]);
  assert.equal(result.cleaned, null);
});

test('Rejects an empty request object', () => {
  const result = validateSubscriptionPayload({});

  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 4);
});

// Subscription Name Validation Tests

test('Accepts a valid subscription name', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ name: 'Spotify' })
  );

  assert.equal(result.isValid, true);
  assert.equal(result.cleaned.name, 'Spotify');
});

test('Rejects an empty subscription name', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ name: '' })
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.includes(
    'Subscription name is required and cannot be empty.'
  ));
});

test('Accepts a subscription name of exactly 100 characters', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ name: 'A'.repeat(100) })
  );

  assert.equal(result.isValid, true);
  assert.equal(result.cleaned.name.length, 100);
});

test('Rejects a subscription name exceeding 100 characters', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ name: 'A'.repeat(101) })
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.includes(
    'Subscription name must be 100 characters or fewer.'
  ));
});

// Subscription Cost Validation Tests

test('Accepts a valid subscription cost', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ amount_cents: 1599 })
  );

  assert.equal(result.isValid, true);
  assert.equal(result.cleaned.amountCents, 1599);
});


test('Rejects a missing subscription cost', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ amount_cents: undefined })
  );

  assert.equal(result.isValid, false);
});

test('Rejects a negative subscription cost', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ amount_cents: -100 })
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.includes(
    'Cost must be a positive integer in cents (greater than $0.00).'
  ));
});

test('Rejects a cost above the maximum limit', () => {
  const result = validateSubscriptionPayload(
    createValidPayload({ amount_cents: 1000001 })
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.includes(
    'Cost cannot exceed $10,000.00.'
  ));
});

