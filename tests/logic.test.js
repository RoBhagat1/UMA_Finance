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

// ---- Task 2: row mapping ----
const HEADERS = ['CalLink Balance','Stage 2','Stage 3','Stage 4','Stage 5','Email','First Name','Last Name','Phone Number','UID','Date','Type','"Other" Explanation','Name of Expense','Vendor Name','Location','Price of Item #1','Receipt','Payment Method','Mailing Address','More Reimbursements?','Vendor Name','Location','Price of Item #2','Receipt','More Reimbursements?','Vendor Name','Location','Price of Item #3','Receipt','Request ID','Budget Line','Amount Override','Cancelled'];
const blank = () => HEADERS.map((h, i) => (i >= 1 && i <= 4 ? false : ''));
const ROWS = (() => {
  const a = blank();
  Object.assign(a, { 0: 5920.24, 1: true, 2: true, 5: 'alex.rivera@berkeley.edu', 6: 'Alex', 7: 'Rivera', 8: '5105550101', 9: '1000001', 10: '9/27/2026', 11: 'Travel', 13: 'gas',
    14: 'Costco', 15: '43621 Pacific Commons, Fremont, CA', 16: 75.65, 17: 'https://drive.google.com/open?id=AAA', 18: 'Direct deposit', 19: '100 Example St, Unit 1, Berkeley, CA 94704', 20: 'Yes',
    21: 'Chevron', 22: '5280 Hopyard Rd, Pleasanton, CA 90917', 23: 90.09, 24: 'https://drive.google.com/open?id=BBB', 25: 'Yes',
    26: '99 Ranch', 27: '7333 Regional Street, Dublin, CA 92583', 28: 43.53, 29: 'https://drive.google.com/open?id=CCC', 30: 'a1b2c3d4' });
  const r = blank();
  Object.assign(r, { 5: 'sam.lee@berkeley.edu', 6: 'Sam', 7: 'Lee', 8: '4085550102', 9: '1000002', 10: new Date(Date.UTC(2026, 9, 14)), 11: 'Food', 13: 'Wingstop for club social',
    14: 'DoorDash', 15: 'Online', 16: '78.3', 17: 'https://drive.google.com/open?id=EXAMPLE_RECEIPT_ID, https://drive.google.com/open?id=ZZZ,',
    18: 'Direct deposit', 19: '200 Example Ave, Berkeley CA, 94704', 20: 'No' });
  return [a, r, blank(), blank(), blank()];
})();

test('mapColumns resolves repeated item headers by occurrence', () => {
  const c = L.mapColumns(HEADERS);
  assert.equal(c.items.length, 3);
  assert.equal(HEADERS[c.items[1].price], 'Price of Item #2');
  assert.ok(c.items[2].vendor > c.items[1].vendor);
  assert.deepEqual(L.requiredMissing(c), []);
  assert.equal(c.otherExplanation, 12);
  assert.equal(c.cancelled, 33);
});
test('requiredMissing reports absent headers', () => {
  const c = L.mapColumns(['Email', 'First Name']);
  const m = L.requiredMissing(c);
  assert.ok(m.includes('Last Name'));
  assert.ok(!m.includes('Email'));
  assert.ok(!m.includes('Request ID'));
});
test('rowsToRequests skips blank checkbox rows', () => {
  const reqs = L.rowsToRequests(ROWS, L.mapColumns(HEADERS), 2);
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].items.length, 3);
  assert.equal(reqs[1].items.length, 1);
  assert.equal(reqs[0].row, 2);
  assert.equal(reqs[1].row, 3);
  assert.deepEqual(reqs[0].stageChecks, [true, true, false, false]);
  assert.equal(reqs[0].id, 'a1b2c3d4');
  assert.equal(reqs[0].budgetLine, null);
  assert.equal(reqs[0].cancelled, false);
  assert.equal(reqs[0].description, 'gas');
});
test('rowsToRequests splits receipts and handles Date cells', () => {
  const reqs = L.rowsToRequests(ROWS, L.mapColumns(HEADERS), 2);
  assert.deepEqual(reqs[1].items[0].receipts, ['https://drive.google.com/open?id=EXAMPLE_RECEIPT_ID', 'https://drive.google.com/open?id=ZZZ']);
  assert.equal(reqs[1].date, '2026-10-14');
  assert.equal(reqs[0].date, '9/27/2026');
});
test('rowsToRequests parses override and cancelled', () => {
  const row = ROWS[1].slice(); row[32] = '$12.50'; row[33] = 'TRUE';
  const [r] = L.rowsToRequests([row], L.mapColumns(HEADERS), 9);
  assert.equal(r.amountOverride, 12.5);
  assert.equal(r.cancelled, true);
  assert.equal(r.row, 9);
});
test('toPublicRequest never leaks private fields', () => {
  const raw = L.rowsToRequests(ROWS, L.mapColumns(HEADERS), 2)[0];
  const pub = L.toPublicRequest(raw, L.requestAmount(raw), false);
  const json = JSON.stringify(pub);
  for (const secret of ['alex.rivera@berkeley.edu','5105550101','1000001','100 Example St'])
    assert.ok(!json.includes(secret), secret);
  assert.equal(pub.name, 'Alex Rivera');
  assert.equal(pub.amount, 209.27);
  assert.equal(pub.stage, 3);
  assert.equal(pub.orphaned, false);
  assert.equal(pub.amountOverridden, false);
  assert.deepEqual(Object.keys(pub).sort(), ['amount','amountOverridden','budgetLine','cancelled','date','description','id','items','name','needsAmount','orphaned','paymentMethod','stage','type']);
});
test('checkAccess', () => {
  const allow = ['Exec@Berkeley.edu', 'friend@gmail.com'];
  assert.deepEqual(L.checkAccess('exec@berkeley.edu', allow, 'dir@gmail.com'), {allowed:true,isDirector:false});
  assert.deepEqual(L.checkAccess('friend@gmail.com', allow, 'dir@gmail.com'), {allowed:false,isDirector:false});
  assert.deepEqual(L.checkAccess('stranger@berkeley.edu', allow, 'dir@gmail.com'), {allowed:false,isDirector:false});
  assert.deepEqual(L.checkAccess('DIR@gmail.com', [], 'dir@gmail.com'), {allowed:true,isDirector:true});
});
test('checkAccess with several directors', () => {
  const dirs = ['dir@gmail.com', 'Second@Berkeley.edu'];
  assert.deepEqual(L.checkAccess('second@berkeley.edu', [], dirs), {allowed:true,isDirector:true});
  assert.deepEqual(L.checkAccess('dir@gmail.com', [], dirs), {allowed:true,isDirector:true});
  assert.deepEqual(L.checkAccess('exec@berkeley.edu', ['exec@berkeley.edu'], dirs), {allowed:true,isDirector:false});
});
test('authorize rejects viewer mutation', () => {
  const viewer = {allowed:true, isDirector:false};
  assert.equal(L.authorize('getState', viewer), null);
  assert.equal(L.authorize('updateRequest', viewer), 'forbidden');
  assert.equal(L.authorize('getState', {allowed:false,isDirector:false}), 'forbidden');
  assert.equal(L.authorize('updateRequest', {allowed:true,isDirector:true}), null);
  assert.equal(L.authorize('dropTables', {allowed:true,isDirector:true}), 'bad_request');
});
test('validatePatch', () => {
  const lines = ['Retreat','Welcome Dinner'];
  assert.equal(L.validatePatch('updateRequest', {id:'a1', budgetLine:'Retreat'}, lines), null);
  assert.equal(L.validatePatch('updateRequest', {id:'a1', budgetLine:null}, lines), null); // unassign
  assert.match(L.validatePatch('updateRequest', {id:'a1', budgetLine:'Nope'}, lines), /budget line/i);
  assert.match(L.validatePatch('updateRequest', {id:'a1', stage:0}, lines), /stage/i);
  assert.match(L.validatePatch('updateRequest', {budgetLine:'Retreat'}, lines), /id/i);
  assert.match(L.validatePatch('addOneOff', {description:'Cash', amount:0, budgetLine:'Retreat', date:'2026-10-01'}, lines), /amount/i);
  assert.equal(L.validatePatch('addOneOff', {description:'Cash reimbursement', amount:40, budgetLine:'Retreat', date:'2026-10-01'}, lines), null);
});
test('toPublicRequest flags overridden amounts', () => {
  const raw = L.rowsToRequests(ROWS, L.mapColumns(HEADERS), 2)[0];
  raw.amountOverride = 50;
  assert.equal(L.toPublicRequest(raw, L.requestAmount(raw), false).amountOverridden, true);
});
test('canonicalLineName', () => {
  const names = ['Welcome Dinner', 'Retreat'];
  assert.equal(L.canonicalLineName('  welcome   dinner ', names), 'Welcome Dinner');
  assert.equal(L.canonicalLineName('Old Line', names), 'Old Line');
  assert.equal(L.canonicalLineName(null, names), null);
});

test('one-off refunds are negative amounts that raise Remaining only', () => {
  const lines = ['Banquet'];
  assert.equal(L.validatePatch('addOneOff', {description:'Venue deposit returned', amount:-150, budgetLine:'Banquet', date:'2026-10-20'}, lines), null);
  assert.equal(L.validatePatch('updateOneOff', {id:'O1', amount:-150}, lines), null);
  assert.match(L.validatePatch('updateOneOff', {id:'O1', amount:0}, lines), /amount/i);
  const out = L.computeBudgets([{name:'Banquet', budget:1500}],
    [{budgetLine:'Banquet', amount:600, cancelled:false}],
    [{budgetLine:'Banquet', amount:-150}]);
  assert.equal(out.lines[0].spent, 600);
  assert.equal(out.lines[0].remaining, 1050);
  // A refund bigger than what was spent never makes Spent negative.
  const big = L.computeBudgets([{name:'Misc', budget:600}],
    [{budgetLine:'Misc', amount:298.07, cancelled:false}],
    [{budgetLine:'Misc', amount:-10000}, {budgetLine:'Misc', amount:50}]);
  assert.equal(big.lines[0].spent, 348.07);
  assert.equal(big.lines[0].remaining, 10251.93);
  assert.equal(big.unassignedTotal, 0);
});
