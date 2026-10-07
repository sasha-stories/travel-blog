// Sasha Travel Stories: talking to the Sasha Blog Bridge (SASHA.api). Replies are JSON: { ok: true, ... } or { ok: false, error, code, field }.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const CFG = window.SASHA_CONFIG || {};

  class ApiError extends Error {
    constructor(message, opts = {}) {
      super(message);
      this.name = "ApiError";
      this.code = opts.code || "ERROR";
      this.field = opts.field || "";
      this.details = opts.details || null;
    }
  }

  const endpoint = () => String(CFG.apiUrl || "").trim();

  function configured() {
    try {
      return new URL(endpoint()).protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  const NETWORK_MESSAGE = 'Couldn\'t reach Google Apps Script. Check your internet connection, and that the web app\'s access is set to "Anyone".';

  async function request(method, action, payload, opts = {}) {
    if (!configured()) throw new ApiError("The bridge address (apiUrl) in js/config.js is empty or isn't a https:// link.", { code: "NOT_CONFIGURED" });
    const url = new URL(endpoint());
    const init = { method, redirect: "follow" };
    if (method === "GET") {
      url.searchParams.set("action", action);
      Object.entries(payload || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      });
      init.cache = "no-store";
    } else {
      // text/plain keeps this a "simple" request, so browsers send it without a CORS preflight.
      init.headers = { "Content-Type": "text/plain;charset=utf-8" };
      init.body = JSON.stringify(Object.assign({ action }, payload || {}));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || 30000);
    init.signal = controller.signal;
    try {
      const res = await fetch(url.href, init);
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
      }
      if (!body || typeof body !== "object") {
        throw new ApiError(
          res.ok
            ? 'Google Apps Script sent an unexpected reply. Check that the web app is deployed and its access is set to "Anyone".'
            : `Google Apps Script answered with an error (${res.status}). Please try again.`,
          { code: "BAD_RESPONSE" }
        );
      }
      if (body.ok !== true) {
        throw new ApiError(body.error || "That didn't work. Please try again.", { code: body.code || "SERVER", field: body.field || "", details: body });
      }
      return body;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err && err.name === "AbortError") throw new ApiError("Google took too long to answer. Please try again.", { code: "TIMEOUT" });
      throw new ApiError(NETWORK_MESSAGE, { code: "NETWORK" });
    } finally {
      clearTimeout(timer);
    }
  }

  SASHA.api = {
    ApiError,
    configured,
    get: (action, params, opts) => request("GET", action, params, opts),
    post: (action, body, opts) => request("POST", action, body, opts),
  };
})();
