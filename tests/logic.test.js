const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../apps-script/logic.gs');

test('parsePrice', () => {
  assert.equal(L.parsePrice('$190.38'), 190.38);
  assert.equal(L.parsePrice('1,198.30'), 1198.3);
  assert.equal(L.parsePrice(' 5 '), 5);
  assert.equal(L.parsePrice(1198.3), 1198.3);
  assert.equal(L.parsePrice('$25'), 25);
  assert.equal(L.parsePrice('SM'), null);
  assert.equal(L.parsePrice('$320.00 x 1 night'), null);
  assert.equal(L.parsePrice(''), null);
  assert.equal(L.parsePrice(null), null);
});
test('requestAmount sums items', () => {
  const r = { amountOverride: null, items: [{priceRaw:'75.65'},{priceRaw:'90.09'},{priceRaw:'43.53'}] };
  assert.deepEqual(L.requestAmount(r), { amount: 209.27, needsAmount: false });
});
test('requestAmount flags unparseable item', () => {
  const r = { amountOverride: null, items: [{priceRaw:'$25'},{priceRaw:'SM'}] };
  assert.deepEqual(L.requestAmount(r), { amount: null, needsAmount: true });
});
test('requestAmount override wins', () => {
  const r = { amountOverride: 320, items: [{priceRaw:'$320.00 x 1 night'}] };
  assert.deepEqual(L.requestAmount(r), { amount: 320, needsAmount: false });
});
test('stages', () => {
  assert.equal(L.stageFromChecks([false,false,false,false]), 1);
  assert.equal(L.stageFromChecks([true,true,false,false]), 3);
  assert.equal(L.stageFromChecks([true,false,true,false]), 4); // highest ticked wins
  assert.deepEqual(L.checksForStage(1), [false,false,false,false]);
  assert.deepEqual(L.checksForStage(4), [true,true,true,false]);
  assert.throws(() => L.checksForStage(6));
});
test('computeBudgets allows negative and ignores cancelled', () => {
  const out = L.computeBudgets(
    [{name:'Welcome Dinner', budget:1000}, {name:'Retreat', budget:4000}],
    [{budgetLine:'welcome dinner', amount:1198.30, cancelled:false},
     {budgetLine:'Welcome Dinner', amount:172.15, cancelled:false},
     {budgetLine:'Retreat', amount:500, cancelled:true},
     {budgetLine:null, amount:51.26, cancelled:false},
     {budgetLine:null, amount:null, cancelled:false}],
    [{budgetLine:'Retreat', amount:260}]);
  assert.equal(out.lines[0].spent, 1370.45);
  assert.equal(out.lines[0].remaining, -370.45);
  assert.equal(out.lines[1].spent, 260);
  assert.equal(out.unassignedTotal, 51.26);
});
test('computeBudgets treats unknown line as unassigned', () => {
  const out = L.computeBudgets([{name:'Retreat', budget:4000}],
    [{budgetLine:'Old Line', amount:10, cancelled:false}], []);
  assert.equal(out.unassignedTotal, 10);
  assert.ok(out.orphanedLineNames.has('old line'));
});
