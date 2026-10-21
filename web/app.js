(function () {
  var F = window.Format;
  var root = document.getElementById('app');
  var state = null;
  var screen = 'loading'; // loading | signedOut | forbidden | main | error
  var screenMsg = '';
  var gsiLoaded = false;
  // Which categories and requests are expanded; kept across re-renders.
  var openGroups = {};
  var openRequests = {};

  // A <details> that remembers whether it is open in `memory[key]`.
  function collapsible(cls, key, memory, summaryChildren, bodyChildren) {
    var d = el('details', { class: cls }, [el('summary', {}, summaryChildren)].concat(bodyChildren));
    d.open = !!memory[key];
    d.addEventListener('toggle', function () { memory[key] = d.open; });
    return d;
  }

  // ---- DOM helpers (all API text goes through textContent) ----
  function el(tag, props, children) {
    var n = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'on') Object.keys(props.on).forEach(function (ev) { n.addEventListener(ev, props.on[ev]); });
      else n[k] = props[k];
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // The UMA asterisk, drawn faintly behind the gradient.
  function asterisk() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-50 -50 100 100');
    svg.setAttribute('class', 'asterisk');
    svg.setAttribute('aria-hidden', 'true');
    for (var a = 0; a < 180; a += 60) {
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', '-9'); r.setAttribute('y', '-50'); r.setAttribute('width', '18'); r.setAttribute('height', '100');
      r.setAttribute('transform', 'rotate(' + (a + 15) + ')');
      svg.appendChild(r);
    }
    return svg;
  }

  function wordmark(tag) {
    return el(tag || 'h1', { class: 'wordmark' }, ['uma finance', el('small', { text: 'reimbursement tracker' })]);
  }

  function hero(children) {
    return el('div', { class: 'hero' }, [asterisk(), el('div', { class: 'hero-box' }, children)]);
  }

  // ---- Auth / API ----
  function signOut() {
    Api.clearToken();
    state = null;
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    show('signedOut');
  }

  function onCredential(resp) {
    Api.setToken(resp.credential);
    load();
  }

  function handleResult(res) {
    if (res.ok) { state = res.state; return true; }
    if (res.error === 'unauthenticated') { Api.clearToken(); state = null; show('signedOut'); }
    return false;
  }

  function load() {
    show('loading');
    Api.call('getState', {}).then(function (res) {
      if (res.ok) { state = res.state; show('main'); return; }
      if (res.error === 'unauthenticated') { Api.clearToken(); show('signedOut'); return; }
      if (res.error === 'forbidden') { show('forbidden'); return; }
      screenMsg = res.message || 'Something went wrong.';
      show('error');
    });
  }

  // Run a mutation. `ctl` = elements to disable; `errBox` = element to show failure in.
  function mutate(action, payload, ctl, errBox) {
    ctl.forEach(function (c) { c.disabled = true; });
    errBox.textContent = '';
    Api.call(action, payload).then(function (res) {
      if (handleResult(res)) { render(); return; }
      if (res.error === 'unauthenticated') return;
      var msg = res.message || 'Something went wrong.';
      if (action === 'updateRequest' && payload.id) {
        // Re-render so controls show what is actually saved, then show the error.
        render();
        var again = root.querySelector('.err[data-req="' + String(payload.id).replace(/"/g, '') + '"]');
        if (again) again.textContent = msg;
        return;
      }
      ctl.forEach(function (c) { c.disabled = false; });
      errBox.textContent = msg;
    });
  }

  // ---- Screens ----
  function show(s) { screen = s; render(); }

  function render() {
    clear(root);
    if (screen === 'loading') root.appendChild(el('p', { class: 'loading', text: 'Loading…' }));
    else if (screen === 'signedOut') renderSignedOut();
    else if (screen === 'forbidden') renderForbidden();
    else if (screen === 'error') renderError();
    else renderMain();
  }

  function renderSignedOut() {
    var box = el('div', { id: 'gsi-button' });
    root.appendChild(hero([
      wordmark(),
      box,
      el('p', { class: 'note', text: 'For UMA exec. Sign in with your @berkeley.edu account.' })
    ]));
    drawButton();
  }

  function drawButton() {
    var box = document.getElementById('gsi-button');
    if (!gsiLoaded || !box || !window.google) return;
    google.accounts.id.initialize({ client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true });
    google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
  }

  function renderForbidden() {
    root.appendChild(hero([
      wordmark(),
      el('p', { text: "This account doesn't have access. Ask the director of finance to add you, then sign in again." }),
      el('div', { class: 'actions' }, [el('button', { class: 'on-color', text: 'Sign out', on: { click: signOut } })])
    ]));
  }

  function renderError() {
    root.appendChild(hero([
      wordmark(),
      el('p', { text: screenMsg }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'on-color', text: 'Try again', on: { click: load } }),
        el('button', { class: 'on-color', text: 'Sign out', on: { click: signOut } })
      ])
    ]));
  }

  function renderMain() {
    var isDir = state.user.isDirector;
    root.appendChild(el('header', { class: 'band' }, [
      asterisk(),
      el('div', { class: 'band-inner' }, [
        wordmark(),
        el('div', { class: 'who' }, [
          el('span', {}, [state.user.email, isDir ? el('span', { class: 'role', text: 'editor' }) : null]),
          el('button', { class: 'on-color', text: 'Sign out', on: { click: signOut } })
        ])
      ])
    ]));
    root.appendChild(el('h2', { text: 'Budgets' }));
    root.appendChild(budgetPanel(isDir));
    renderCancelled(isDir);
    if (isDir) renderOneOffs();
  }

  // One row per budget line: name, what's left, a bar of how much is used.
  function countLabel(n) { return n + (n === 1 ? ' request' : ' requests'); }

  // One row per budget line: name, what's left, a bar of how much is used.
  // Each row opens to show the requests assigned to that line.
  function budgetPanel(isDir) {
    var active = state.requests.filter(function (r) { return !r.cancelled; });
    function requestsBody(list) {
      if (!list.length) return [el('p', { class: 'empty line-empty', text: 'No requests in this budget yet.' })];
      return [el('div', { class: 'line-requests' }, list.map(function (r) { return requestCard(r, isDir); }))];
    }
    var rows = state.budgetLines.map(function (l) {
      var over = l.remaining < 0;
      var used = l.budget > 0 ? Math.min(100, Math.max(0, (l.spent / l.budget) * 100)) : (l.spent > 0 ? 100 : 0);
      var list = active.filter(function (r) { return r.budgetLine === l.name && !r.orphaned; });
      return collapsible('line', l.name, openGroups, [
        el('span', { class: 'chev', 'aria-hidden': 'true' }),
        el('div', { class: 'line-name', text: l.name }),
        el('div', { class: 'line-left' + (over ? ' neg' : ''), text: over ? F.formatCurrency(-l.remaining) + ' over' : F.formatCurrency(l.remaining) + ' left' }),
        el('div', { class: 'bar', title: Math.round(used) + '% used' }, [el('i', { class: over ? 'over' : '', style: 'width:' + used + '%' })]),
        el('div', { class: 'line-sub', text: F.formatCurrency(l.spent) + ' spent of ' + F.formatCurrency(l.budget) + ' · ' + countLabel(list.length) })
      ], requestsBody(list));
    });
    var unassigned = active.filter(function (r) { return !r.budgetLine || r.orphaned; });
    rows.push(collapsible('line unassigned', '__unassigned', openGroups, [
      el('span', { class: 'chev', 'aria-hidden': 'true' }),
      el('div', { class: 'line-name', text: 'Not yet assigned to a budget' }),
      el('div', { class: 'line-left', text: F.formatCurrency(state.unassignedTotal) }),
      el('div', { class: 'line-sub', text: countLabel(unassigned.length) })
    ], requestsBody(unassigned)));
    return el('div', { class: 'panel' }, rows);
  }

  function renderCancelled(isDir) {
    var cancelled = state.requests.filter(function (r) { return r.cancelled; });
    if (!cancelled.length) return;
    root.appendChild(collapsible('group', '__cancelled', openGroups, [
      el('span', { class: 'chev', 'aria-hidden': 'true' }),
      el('span', { class: 'group-name', text: 'Cancelled requests' }),
      el('span', { class: 'count', text: countLabel(cancelled.length) })
    ], cancelled.map(function (r) { return requestCard(r, isDir); })));
  }

  function requestCard(r, isDir) {
    var amount = r.amount === null || r.amount === undefined
      ? el('span', { class: 'badge', text: 'Needs amount' })
      : el('span', { class: 'amount', text: F.formatCurrency(r.amount) });

    var vendors = (r.items || []).map(function (it) {
      return it.vendor + (it.location ? ' (' + it.location + ')' : '');
    }).filter(Boolean).join(', ');

    var links = [];
    (r.items || []).forEach(function (it) {
      (it.receipts || []).forEach(function (u) {
        if (typeof u === 'string' && u.indexOf('https://') === 0) {
          links.push(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: 'Receipt ' + (links.length + 1) }));
        }
      });
    });

    var stages = el('div', { class: 'stages', title: F.stageLabel(r.stage) + ' of 5' });
    for (var i = 1; i <= 5; i++) stages.appendChild(el('span', { class: i <= r.stage ? 'on' : '', text: String(i) }));

    // Collapsed: who, how much, when, what. Expanded: vendor, receipts, stage, controls.
    var body = el('div', { class: 'card-body' }, [
      vendors ? el('div', { class: 'meta', text: vendors }) : null,
      r.paymentMethod ? el('div', { class: 'meta', text: 'Payback: ' + r.paymentMethod }) : null,
      links.length ? el('div', { class: 'links' }, links) : null,
      el('div', { class: 'stage-row' }, [stages, el('span', { class: 'stage-label', text: F.stageLabel(r.stage) })])
    ]);
    if (isDir) body.appendChild(requestControls(r));
    return collapsible('card' + (r.cancelled ? ' cancelled' : ''), r.id, openRequests, [
      el('div', { class: 'card-top' }, [el('div', { class: 'card-name', text: r.name }), amount]),
      el('div', { class: 'meta' }, [
        el('span', { text: r.date }),
        r.type ? el('span', { text: r.type }) : null,
        r.orphaned ? el('span', { class: 'badge', text: 'Budget line not found' }) : null
      ]),
      el('div', { class: 'desc', text: r.description })
    ], [body]);
  }

  function requestControls(r) {
    var err = el('div', { class: 'err' });
    err.setAttribute('data-req', String(r.id));
    var lineSel = el('select', { title: 'Budget line' }, [el('option', { value: '', text: 'Unassigned' })]);
    var names = state.budgetLines.map(function (l) { return l.name; });
    if (r.budgetLine && names.indexOf(r.budgetLine) < 0) names.push(r.budgetLine);
    names.forEach(function (n) { lineSel.appendChild(el('option', { value: n, text: n })); });
    lineSel.value = r.budgetLine || '';

    var stageSel = el('select', { title: 'Stage' });
    for (var i = 1; i <= 5; i++) stageSel.appendChild(el('option', { value: String(i), text: F.stageLabel(i) }));
    stageSel.value = String(r.stage);

    var amt = el('input', { type: 'number', step: '0.01', min: '0', placeholder: 'Override $', title: 'Amount override' });
    if (r.amountOverridden && r.amount !== null && r.amount !== undefined) amt.value = String(r.amount);
    var setBtn = el('button', { text: 'Set amount' });
    var clrBtn = el('button', { text: 'Clear override' });
    var cancelBtn = el('button', { class: r.cancelled ? '' : 'danger', text: r.cancelled ? 'Restore' : 'Cancel request' });
    var all = [lineSel, stageSel, amt, setBtn, clrBtn, cancelBtn];
    if (!r.amountOverridden) clrBtn.style.display = 'none';

    lineSel.addEventListener('change', function () {
      mutate('updateRequest', { id: r.id, budgetLine: lineSel.value || null }, all, err);
    });
    stageSel.addEventListener('change', function () {
      mutate('updateRequest', { id: r.id, stage: Number(stageSel.value) }, all, err);
    });
    setBtn.addEventListener('click', function () {
      var v = parseFloat(amt.value);
      if (!(v >= 0)) { err.textContent = 'Enter a valid amount.'; return; }
      mutate('updateRequest', { id: r.id, amountOverride: v }, all, err);
    });
    clrBtn.addEventListener('click', function () {
      mutate('updateRequest', { id: r.id, amountOverride: null }, all, err);
    });
    cancelBtn.addEventListener('click', function () {
      mutate('updateRequest', { id: r.id, cancelled: !r.cancelled }, all, err);
    });
    return el('div', { class: 'controls' }, [lineSel, stageSel, amt, setBtn, clrBtn, cancelBtn, err]);
  }

  // ---- One-offs ----
  function lineSelect(value) {
    var s = el('select', { title: 'Budget line' });
    var names = state.budgetLines.map(function (l) { return l.name; });
    if (value && names.indexOf(value) < 0) names.push(value);
    names.forEach(function (n) { s.appendChild(el('option', { value: n, text: n })); });
    if (value) s.value = value;
    return s;
  }

  function oneOffFields(o) {
    var kind = el('select', { title: 'Expense or refund' });
    kind.appendChild(el('option', { value: 'expense', text: 'Expense' }));
    kind.appendChild(el('option', { value: 'refund', text: 'Refund' }));
    if (o && o.amount < 0) kind.value = 'refund';
    return {
      kind: kind,
      date: el('input', { type: 'date', value: o ? o.date : '', title: 'Date' }),
      desc: el('input', { type: 'text', value: o ? o.description : '', placeholder: 'Description', title: 'Description' }),
      amount: el('input', { type: 'number', step: '0.01', min: '0.01', value: o ? String(Math.abs(o.amount)) : '', placeholder: 'Amount', title: 'Amount' }),
      line: lineSelect(o ? o.budgetLine : '')
    };
  }

  // A refund is stored as a negative amount, which lowers the line's Spent.
  function readFields(f, err) {
    var amount = parseFloat(f.amount.value);
    if (!f.date.value || !f.desc.value.trim() || !(amount > 0) || !f.line.value) {
      err.textContent = 'Fill in date, description, a positive amount, and a budget line.';
      return null;
    }
    if (f.kind.value === 'refund') amount = -amount;
    return { date: f.date.value, description: f.desc.value.trim(), amount: amount, budgetLine: f.line.value };
  }

  function renderOneOffs() {
    root.appendChild(el('h2', { text: 'One-off expenses & refunds' }));
    if (!state.oneOffs.length) root.appendChild(el('p', { class: 'empty', text: 'No one-off expenses or refunds.' }));
    state.oneOffs.forEach(function (o) { root.appendChild(oneOffRow(o)); });

    var f = oneOffFields(null);
    var err = el('div', { class: 'err' });
    var add = el('button', { class: 'primary', text: 'Add' });
    add.addEventListener('click', function () {
      var p = readFields(f, err);
      if (p) mutate('addOneOff', p, [f.kind, f.date, f.desc, f.amount, f.line, add], err);
    });
    root.appendChild(el('div', { class: 'form' }, [f.kind, f.date, f.desc, f.amount, f.line, add, err]));
  }

  function oneOffRow(o) {
    var card = el('div', { class: 'card' });
    function view() {
      clear(card);
      var err = el('div', { class: 'err' });
      var edit = el('button', { text: 'Edit' });
      var del = el('button', { class: 'danger', text: 'Delete' });
      edit.addEventListener('click', editMode);
      del.addEventListener('click', function () {
        if (window.confirm(o.amount < 0 ? 'Delete this refund?' : 'Delete this one-off expense?')) mutate('deleteOneOff', { id: o.id }, [edit, del], err);
      });
      card.appendChild(el('div', { class: 'card-top' }, [
        el('div', {}, [el('div', { class: 'card-name', text: o.description }), el('div', { class: 'meta' }, [el('span', { text: o.date }), el('span', { class: 'tag', text: o.budgetLine || 'Unassigned' })])]),
        el('span', { class: o.amount < 0 ? 'amount refund' : 'amount', text: F.formatOneOffAmount(o.amount) })
      ]));
      card.appendChild(el('div', { class: 'controls' }, [edit, del, err]));
    }
    function editMode() {
      clear(card);
      var f = oneOffFields(o);
      var err = el('div', { class: 'err' });
      var save = el('button', { class: 'primary', text: 'Save' });
      var cancel = el('button', { text: 'Cancel', on: { click: view } });
      save.addEventListener('click', function () {
        var p = readFields(f, err);
        if (p) { p.id = o.id; mutate('updateOneOff', p, [f.kind, f.date, f.desc, f.amount, f.line, save, cancel], err); }
      });
      card.appendChild(el('div', { class: 'controls' }, [f.kind, f.date, f.desc, f.amount, f.line, save, cancel, err]));
    }
    view();
    return card;
  }

  // ---- Boot ----
  window.App = { gsiReady: function () { gsiLoaded = true; if (screen === 'signedOut') drawButton(); } };
  if (window.google && google.accounts) gsiLoaded = true;

  if (Api.getToken()) load(); else show('signedOut');
})();
