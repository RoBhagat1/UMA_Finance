(function (root) {
  function formatCurrency(n) {
    if (n === null || n === undefined || typeof n !== 'number' || isNaN(n)) return 'Needs amount';
    var abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var negative = n < 0 && abs !== '0.00';
    return (negative ? '−' : '') + '$' + abs;
  }
  function stageLabel(n) { return 'Stage ' + n; }

  var api = { formatCurrency: formatCurrency, stageLabel: stageLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Format = api;
})(typeof window !== 'undefined' ? window : this);
