(function () {
  var KEY = 'uma_id_token';

  function getToken() {
    try { return sessionStorage.getItem(KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { sessionStorage.setItem(KEY, t); } catch (e) { /* ignore */ }
  }
  function clearToken() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // Resolves to { ok:true, state } or { ok:false, error, message }. Never rejects.
  function call(action, payload) {
    return fetch(window.APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ idToken: getToken(), action: action, payload: payload || {} })
    }).then(function (res) {
      return res.json();
    }).catch(function () {
      return { ok: false, error: 'network', message: 'Could not reach the server. Check your connection and try again.' };
    });
  }

  window.Api = { call: call, getToken: getToken, setToken: setToken, clearToken: clearToken };
})();
