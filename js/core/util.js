// Sasha Travel Stories: shared helpers (SASHA.util). Load this before the other core files.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});

  // The project folder, worked out from this file's own address, so links work from index.html and from html/.
  const ROOT = (function () {
    try {
      return new URL("../../", document.currentScript.src).href;
    } catch (e) {
      return new URL("./", location.href).href;
    }
  })();

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const pad = (n) => String(n).padStart(2, "0");

  function query(params) {
    const p = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") p.set(key, value);
    });
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  /* ---------- Text ---------- */

  function slugify(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['\u2019]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "");
  }

  const oneLine = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

  const multiLine = (value, max = 5000) =>
    String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);

  const bool = (value) => value === true || /^(true|yes|1|on)$/i.test(String(value ?? "").trim());

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function coord(value, min, max) {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 1e6) / 1e6 : null;
  }

  function tagList(value) {
    const list = Array.isArray(value) ? value : String(value ?? "").split(",");
    return [...new Set(list.map((t) => oneLine(t, 40).toLowerCase()).filter(Boolean))].slice(0, 12);
  }

  function plainText(blocks) {
    const out = [];
    (Array.isArray(blocks) ? blocks : []).forEach((b) => {
      if (!b) return;
      if (b.title) out.push(b.title);
      if (b.text) out.push(b.text);
      if (Array.isArray(b.items)) out.push(b.items.join(" "));
      if (b.caption) out.push(b.caption);
    });
    return out
      .join(" ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>#]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const readingTime = (blocks) => Math.max(1, Math.round(plainText(blocks).split(" ").filter(Boolean).length / 200));

  // Links allowed in story text: https, http, mailto, #anchors and pages of this site.
  function safeHref(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^(https?:|mailto:)/i.test(raw)) {
      try {
        const u = new URL(raw);
        return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : "";
      } catch (e) {
        return "";
      }
    }
    if (/^#[\w-]*$/.test(raw)) return raw;
    if (/^(\.\.?\/|\/(?!\/))?[\w./-]+\.html(?:[?#][^\s"'<>]*)?$/i.test(raw)) return raw;
    if (/^\/(?!\/)[^\s"'<>]*$/.test(raw)) return raw;
    return "";
  }

  function emphasis(html) {
    return html
      .replace(/\*\*(\S(?:[^*\n]*?\S)?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*(\S(?:[^*\n]*?\S)?)\*(?![\w*])/g, "$1<em>$2</em>")
      .replace(/\n/g, "<br>");
  }

  // Story text understands **bold**, *italic* and [label](https://link). Everything else is escaped.
  function inline(value) {
    const text = String(value ?? "");
    const re = /\[([^\]\n]{1,200})\]\(([^()\s]{1,500})\)/g;
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out.push(emphasis(esc(text.slice(last, m.index))));
      const href = safeHref(m[2]);
      const label = emphasis(esc(m[1]));
      if (href) {
        const external = /^https?:/i.test(href);
        out.push(`<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`);
      } else {
        out.push(label);
      }
      last = re.lastIndex;
    }
    out.push(emphasis(esc(text.slice(last))));
    return out.join("");
  }

  const paragraphs = (value, max = 20000) =>
    multiLine(value, max)
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .map((p) => `<p>${inline(p)}</p>`)
      .join("");

  /* ---------- Colours ---------- */

  const hexColor = (value) => {
    const s = String(value ?? "").trim();
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : "";
  };

  // Blends two #rrggbb colours; weight is the share of the first one.
  function mix(a, b, weight) {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const y = rgb(b);
    return `#${rgb(a)
      .map((v, i) => Math.round(v * weight + y[i] * (1 - weight)).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  /* ---------- Dates: days are "YYYY-MM-DD", months "YYYY-MM" and times ISO strings ---------- */

  function day(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const t = new Date(raw);
    return Number.isNaN(t.getTime()) ? "" : `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  function month(value) {
    const m = String(value ?? "").trim().match(/^(\d{4})-(\d{2})/);
    return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${m[2]}` : "";
  }

  function stamp(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const t = new Date(raw);
    return Number.isNaN(t.getTime()) ? "" : t.toISOString();
  }

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function dateParts(value) {
    const s = String(value ?? "").trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (m) {
      const mo = +m[2];
      return mo >= 1 && mo <= 12 ? { y: +m[1], m: mo, d: m[3] ? +m[3] : 0 } : null;
    }
    const t = new Date(s);
    return Number.isNaN(t.getTime()) ? null : { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }

  const monthName = (m, short) => (short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]);

  function formatDate(value, opts = {}) {
    const p = dateParts(value);
    if (!p) return "";
    const name = monthName(p.m, opts.short);
    const year = opts.withYear === false ? "" : ` ${p.y}`;
    return p.d ? `${p.d} ${name}${year}` : `${name}${year}`;
  }

  function formatMonth(value, opts = {}) {
    const p = dateParts(value);
    return p ? `${monthName(p.m, opts.short)} ${p.y}` : "";
  }

  function formatRange(start, end) {
    const a = dateParts(start);
    const b = dateParts(end);
    if (!a && !b) return "";
    if (!a || !b) return formatDate(a ? start : end);
    if (a.y === b.y && a.m === b.m && a.d === b.d) return formatDate(start);
    if (a.y === b.y && a.m === b.m && a.d && b.d) return `${a.d}\u2013${b.d} ${monthName(a.m)} ${a.y}`;
    if (a.y === b.y) return `${formatDate(start, { short: true, withYear: false })} \u2013 ${formatDate(end, { short: true })}`;
    return `${formatDate(start, { short: true })} \u2013 ${formatDate(end, { short: true })}`;
  }

  function relativeTime(value) {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return "";
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return "just now";
    const min = Math.round(s / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const days = Math.round(hr / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return formatDate(value, { short: true });
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* ---------- Browser ---------- */

  function debounce(fn, wait = 200) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // get and remove never throw; set throws when storage is full or blocked, so callers can decide what to do.
  function makeStore(area) {
    return {
      get(key, fallback = null) {
        try {
          const raw = area().getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
          return fallback;
        }
      },
      set(key, value) {
        area().setItem(key, JSON.stringify(value));
      },
      remove(key) {
        try {
          area().removeItem(key);
        } catch (e) {
          console.warn("[Sasha] Couldn't remove a saved copy:", e.message);
        }
      },
      keys() {
        try {
          const a = area();
          return Array.from({ length: a.length }, (_, i) => a.key(i));
        } catch (e) {
          return [];
        }
      },
    };
  }

  const clone = (value) => (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  SASHA.util = {
    root: ROOT,
    url: (path, params) => `${ROOT}${path || ""}${query(params)}`,
    query,
    esc,
    slugify,
    oneLine,
    multiLine,
    bool,
    clampInt,
    coord,
    tagList,
    plainText,
    readingTime,
    safeHref,
    inline,
    paragraphs,
    hexColor,
    mix,
    day,
    month,
    stamp,
    MONTHS,
    dateParts,
    formatDate,
    formatMonth,
    formatRange,
    relativeTime,
    today,
    nowIso: () => new Date().toISOString(),
    plural: (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`,
    params: () => new URLSearchParams(location.search),
    debounce,
    clone,
    copyText,
    storage: makeStore(() => window.localStorage),
    session: makeStore(() => window.sessionStorage),
  };
})();
