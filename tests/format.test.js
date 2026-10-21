const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../web/format.js');

test('formatCurrency', () => {
  assert.equal(F.formatCurrency(1370.45), '$1,370.45');
  assert.equal(F.formatCurrency(-370.45), '−$370.45');
  assert.equal(F.formatCurrency(0), '$0.00');
  assert.equal(F.formatCurrency(null), 'Needs amount');
});

test('stageLabel', () => {
  assert.equal(F.stageLabel(3), 'Stage 3');
});

test('formatOneOffAmount shows refunds as a green plus', () => {
  assert.equal(F.formatOneOffAmount(40), '$40.00');
  assert.equal(F.formatOneOffAmount(-150), '+$150.00 refund');
});
