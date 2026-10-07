// Sasha Travel Stories: shared website pieces (SASHA.site): header, footer, search, cards, themes and page start-up.
// Each page script calls SASHA.site.boot(render). render(site, ctx) runs again whenever the content changes, so event listeners go in ctx.once.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const U = SASHA.util;
  const C = SASHA.content;
  const esc = U.esc;
  const icon = SASHA.icon;

  const NAV = [
    ["Home", C.links.home],
    ["Journal", C.links.journal],
    ["Places", C.links.places],
    ["Experiences", C.links.experiences],
    ["About", C.links.about],
  ];
  const FOOTER_NAV = NAV.slice(1).concat([["Search", C.links.search]]);

  const KIND_ICONS = {
    food: "utensils",
    stay: "bed-double",
    trek: "mountain",
    walk: "footprints",
    culture: "landmark",
    nature: "leaf",
    adventure: "compass",
    festival: "sparkles",
    journey: "train-front",
    shopping: "tag",
  };

  function kindIcon(kind) {
    const key = String(kind || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(KIND_ICONS, key) ? KIND_ICONS[key] : "compass";
  }

  let lastSite = null;
  let lastFocus = null;

  /* ---------- Small helpers ---------- */

  function fileOf(pathname) {
    const last = pathname.split("/").pop();
    return last && last.includes(".") ? last.toLowerCase() : "index.html";
  }

  function isActive(href) {
    try {
      const u = new URL(href, location.href);
      if (u.origin !== location.origin) return false;
      const current = fileOf(location.pathname);
      const file = fileOf(u.pathname);
      return file === current || (current === "story.html" && file === "journal.html");
    } catch (e) {
      return false;
    }
  }

  const param = (name) => U.params().get(name) || "";

  function setParams(values) {
    const p = U.params();
    Object.keys(values).forEach((key) => (values[key] ? p.set(key, values[key]) : p.delete(key)));
    const qs = p.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  }

  function setTitle(title) {
    const name = (lastSite && lastSite.settings.siteTitle) || SASHA.schema.DEFAULT_SETTINGS.siteTitle;
    document.title = title ? `${title} | ${name}` : name;
  }

  function setDescription(text) {
    const tag = document.querySelector('meta[name="description"]');
    if (tag && text) tag.setAttribute("content", U.oneLine(text, 170));
  }

  const scripts = {};

  // Loads a script once, by its path from the project folder, for example "js/site/map.js".
  function loadScript(path) {
    const src = U.url(path);
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = () => resolve(true);
        el.onerror = () => resolve(false);
        document.head.appendChild(el);
      });
    }
    return scripts[src];
  }

  /* ---------- Themes ---------- */

  const THEME_KEYS = Object.keys(C.themeVars(null));

  // Gives the page a theme's colours; with no theme the page keeps the site's own beige and white.
  function applyTheme(theme) {
    const style = document.body.style;
    THEME_KEYS.forEach((key) => style.removeProperty(key));
    const vars = theme ? C.themeVars(theme) : null;
    if (vars) Object.entries(vars).forEach(([key, value]) => style.setProperty(key, value));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", vars ? vars["--paper"] : "#f7f2e8");
  }

  const themeTag = (theme) => (theme ? `<a class="theme-tag" style="--tone:${esc(theme.accent)}" href="${esc(theme.url)}">${esc(theme.name)}</a>` : "");

  // The theme's name with its look's icon; a link to the theme's page unless asLink is false.
  function themePill(theme, asLink = true) {
    if (!theme) return "";
    const inner = `<span class="pill-icon">${icon(theme.icon, { size: 15 })}</span>${esc(theme.name)}`;
    return asLink ? `<a class="theme-pill" href="${esc(theme.url)}">${inner}</a>` : `<span class="theme-pill">${inner}</span>`;
  }

  /* ---------- Header, footer, search and menu ---------- */

  function navItem(label, href, cls) {
    const active = isActive(href);
    const classes = [cls, active ? "is-active" : ""].filter(Boolean).join(" ");
    return `<a${classes ? ` class="${classes}"` : ""} href="${esc(href)}"${active ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  }

  const brand = (site) =>
    `<a class="brand" href="${esc(C.links.home())}"><span class="brand-mark">${icon("compass", { size: 20 })}</span><span class="brand-name">${esc(site.settings.siteTitle)}</span></a>`;

  function headerHtml(site) {
    return `<div class="container header-inner">
      ${brand(site)}
      <nav class="nav" aria-label="Main"><ul class="nav-list">${NAV.map(([label, href]) => `<li>${navItem(label, href(), "nav-link")}</li>`).join("")}</ul></nav>
      <div class="header-actions">
        <button class="icon-btn" type="button" data-action="search" aria-label="Search">${icon("search")}</button>
        <button class="icon-btn menu-btn" type="button" data-action="menu" aria-expanded="false" aria-controls="mobile-menu" aria-label="Menu">${icon("menu")}</button>
      </div>
    </div>
    <nav class="mobile-menu" id="mobile-menu" aria-label="Menu" hidden>${NAV.map(([label, href]) => navItem(label, href(), "")).join("")}</nav>`;
  }

  function footerHtml(site) {
    const s = site.settings;
    const social = [
      s.email && `<a href="mailto:${esc(s.email)}" aria-label="Email">${icon("mail", { size: 18 })}</a>`,
      s.instagramUrl && `<a href="${esc(s.instagramUrl)}" target="_blank" rel="noopener" aria-label="Instagram">${icon("instagram", { size: 18 })}</a>`,
      s.youtubeUrl && `<a href="${esc(s.youtubeUrl)}" target="_blank" rel="noopener" aria-label="YouTube">${icon("youtube", { size: 18 })}</a>`,
    ]
      .filter(Boolean)
      .join("");
    return `<div class="container">
      <div class="footer-inner">
        <div class="footer-about">
          ${brand(site)}
          ${s.authorBio ? `<p>${esc(s.authorBio)}</p>` : ""}
          ${social ? `<div class="social">${social}</div>` : ""}
        </div>
        <nav class="footer-nav" aria-label="Footer"><h2 class="footer-heading">Explore</h2><ul>${FOOTER_NAV.map(([label, href]) => `<li>${navItem(label, href(), "")}</li>`).join("")}</ul></nav>
        <div>${s.footerNote ? `<p class="footer-note">${esc(s.footerNote)}</p>` : ""}</div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} ${esc(s.authorName || s.siteTitle)}</span>
        <a href="#main">Back to top</a>
      </div>
    </div>`;
  }

  function renderChrome(site) {
    const header = document.getElementById("site-header");
    const footer = document.getElementById("site-footer");
    if (header) header.innerHTML = headerHtml(site);
    if (footer) footer.innerHTML = footerHtml(site);
  }

  function openSearch() {
    let el = document.getElementById("search-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "search-overlay";
      el.className = "search-overlay";
      el.hidden = true;
      el.innerHTML = `<div class="search-panel paper" role="dialog" aria-modal="true" aria-label="Search the blog">
        <form class="search-form" action="${esc(C.links.search())}" method="get" role="search">
          ${icon("search")}
          <input type="search" name="q" placeholder="Search stories, places, food..." aria-label="Search the blog" autocomplete="off" required>
          <button class="icon-btn" type="button" data-close-search aria-label="Close search">${icon("x")}</button>
        </form>
        <p class="search-hint">Try "tea", "Rajasthan" or "sunrise". Press Esc to close.</p>
      </div>`;
      el.addEventListener("click", (e) => {
        if (e.target === el || e.target.closest("[data-close-search]")) closeSearch();
      });
      document.body.appendChild(el);
    }
    lastFocus = document.activeElement;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => el.querySelector("input").focus(), 30);
  }

  function closeSearch() {
    const el = document.getElementById("search-overlay");
    if (!el || el.hidden) return;
    el.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setMenu(open) {
    const menu = document.getElementById("mobile-menu");
    const btn = document.querySelector('[data-action="menu"]');
    if (!menu || !btn) return;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.innerHTML = icon(open ? "x" : "menu");
  }

  let wired = false;

  function wireOnce() {
    if (wired) return;
    wired = true;
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "search") openSearch();
      else if (action === "menu") setMenu(document.getElementById("mobile-menu").hidden);
      else if (action === "retry") location.reload();
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-scroll]");
      if (!btn) return;
      const row = btn.closest("[data-scroller]").querySelector(".scroller");
      row.scrollBy({ left: Number(btn.dataset.scroll) * row.clientWidth * 0.85, behavior: "smooth" });
    });
    // Scroll events from the card rows don't bubble, so they are caught on the way down.
    document.addEventListener(
      "scroll",
      (e) => {
        const wrap = e.target.closest ? e.target.closest("[data-scroller]") : null;
        if (wrap) updateScroller(wrap);
      },
      { capture: true, passive: true }
    );
    window.addEventListener("resize", () => document.querySelectorAll("[data-scroller]").forEach(updateScroller));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSearch();
        setMenu(false);
        return;
      }
      const t = e.target || {};
      const typing = /^(input|textarea|select)$/i.test(t.tagName || "") || t.isContentEditable;
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openSearch();
      }
    });
    const onScroll = () => {
      const header = document.getElementById("site-header");
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Fade-in as things scroll into view ---------- */

  let observer = null;

  function reveal(root = document) {
    const items = root.querySelectorAll(".reveal:not(.is-visible)");
    if (!items.length) return;
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            en.target.classList.add("is-visible");
            observer.unobserve(en.target);
          }),
        { rootMargin: "0px 0px -40px 0px", threshold: 0.05 }
      );
    }
    items.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 6) * 60}ms`;
      observer.observe(el);
    });
  }

  function finish(root) {
    if (!root) return;
    reveal(root);
    root.querySelectorAll("[data-scroller]").forEach(updateScroller);
    root.removeAttribute("aria-busy");
  }

  /* ---------- States ---------- */

  function state(o = {}) {
    const tag = o.heading || "h2";
    return `<div class="state${o.big ? " state-big" : ""}">
      ${o.icon ? `<span class="state-icon">${icon(o.icon, { size: 28 })}</span>` : ""}
      ${o.title ? `<${tag} class="state-title">${esc(o.title)}</${tag}>` : ""}
      ${o.text ? `<p class="state-text">${esc(o.text)}</p>` : ""}
      ${o.action || ""}
    </div>`;
  }

  const skeletons = (n = 3) =>
    Array.from(
      { length: n },
      () => '<div class="skeleton-card" aria-hidden="true"><div class="skeleton sk-media"></div><div class="skeleton sk-title"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></div>'
    ).join("");

  function showError(err) {
    const main = document.getElementById("main");
    if (!main) return;
    main.innerHTML = `<div class="container">${state({
      icon: "cloud-off",
      title: "The journal couldn't be opened",
      text: (err && err.message) || "Something went wrong. Please try again.",
      action: `<button class="btn btn-primary" type="button" data-action="retry">${icon("refresh-cw", { size: 18 })}Try again</button>`,
    })}</div>`;
    main.removeAttribute("aria-busy");
  }

  /* ---------- Cards ---------- */

  const dateLabel = (s) => (s.tripStart ? U.formatMonth(s.tripStart) : U.formatDate(s.publishedAt, { short: true }));
  const sep = '<span class="dot" aria-hidden="true"></span>';

  function storyMeta(s) {
    const when = dateLabel(s);
    return `${when ? `<span>${icon("calendar", { size: 15 })}${esc(when)}</span>` : ""}<span>${icon("clock", { size: 15 })}${s.readingTime} min read</span>`;
  }

  function storyCard(s) {
    const kicker = [themeTag(s.theme), s.location ? `<span>${esc(s.location)}</span>` : ""].filter(Boolean).join(sep);
    return `<article class="story-card reveal">
      <a class="card-media" href="${esc(s.url)}" tabindex="-1" aria-hidden="true">${SASHA.img.tag({ src: s.coverImage, alt: "", widths: [400, 640, 960], sizes: "(max-width: 700px) 100vw, 380px", ratio: [4, 3] })}</a>
      <div class="card-body">
        ${kicker ? `<p class="card-kicker">${kicker}</p>` : ""}
        <h3 class="card-title"><a href="${esc(s.url)}">${esc(s.title)}</a></h3>
        ${s.excerpt ? `<p class="card-text">${esc(s.excerpt)}</p>` : ""}
        <p class="card-meta">${storyMeta(s)}</p>
      </div>
    </article>`;
  }

  function featureCard(s) {
    const kicker = [themeTag(s.theme), s.location ? `<span>${esc(s.location)}</span>` : ""].filter(Boolean).join(sep);
    return `<article class="story-feature reveal">
      <a class="feature-media" href="${esc(s.url)}" tabindex="-1" aria-hidden="true">${SASHA.img.tag({ src: s.coverImage, alt: "", widths: [640, 960, 1400], sizes: "(max-width: 860px) 100vw, 680px", ratio: [4, 3] })}</a>
      <div class="feature-body paper taped">
        <p class="eyebrow">Featured story</p>
        <h2 class="feature-title"><a href="${esc(s.url)}">${esc(s.title)}</a></h2>
        ${s.subtitle ? `<p class="feature-sub">${esc(s.subtitle)}</p>` : ""}
        ${s.excerpt ? `<p class="card-text">${esc(s.excerpt)}</p>` : ""}
        <p class="card-meta">${kicker ? `<span>${kicker}</span>` : ""}${storyMeta(s)}</p>
        <a class="link-arrow" href="${esc(s.url)}">Read the story ${icon("arrow-right", { size: 18 })}</a>
      </div>
    </article>`;
  }

  function placeCard(p) {
    const count = p.stories.length ? `<p class="place-count">${icon("book-open", { size: 15 })}${U.plural(p.stories.length, "story", "stories")}</p>` : "";
    return `<article class="place-card reveal">
      <a class="place-link" href="${esc(p.url)}">
        ${SASHA.img.tag({ src: p.coverImage, alt: "", widths: [360, 560, 800], sizes: "(max-width: 600px) 80vw, 300px", ratio: [4, 5] })}
        <div class="place-info"><h3 class="place-name">${esc(p.name)}</h3>${p.region ? `<p class="place-region">${esc(p.region)}</p>` : ""}${count}</div>
      </a>
    </article>`;
  }

  function stars(n) {
    const rating = U.clampInt(n, 0, 5, 0);
    if (!rating) return "";
    const list = [1, 2, 3, 4, 5].map((i) => icon("star", { size: 16, className: i <= rating ? "on" : "off" })).join("");
    return `<span class="stars" role="img" aria-label="Rated ${rating} out of 5">${list}</span>`;
  }

  function expCard(e) {
    const storyUrl = e.storySlug ? C.links.story(e.storySlug) : "";
    const title = storyUrl ? `<a href="${esc(storyUrl)}">${esc(e.title)}</a>` : esc(e.title);
    const facts = [
      e.date ? `<span>${icon("calendar", { size: 15 })}${esc(U.formatMonth(e.date))}</span>` : "",
      e.duration ? `<span>${icon("clock", { size: 15 })}${esc(e.duration)}</span>` : "",
      e.cost ? `<span>${icon("wallet", { size: 15 })}${esc(e.cost)}</span>` : "",
    ].join("");
    const action = storyUrl
      ? `<a class="link-arrow" href="${esc(storyUrl)}">Read the story ${icon("arrow-right", { size: 16 })}</a>`
      : e.link
        ? `<a class="link-arrow" href="${esc(e.link)}" target="_blank" rel="noopener">Find out more ${icon("external-link", { size: 16 })}</a>`
        : "";
    const rating = stars(e.rating);
    return `<article class="exp-card reveal" id="${esc(e.slug)}">
      <div class="card-media">
        ${SASHA.img.tag({ src: e.image, alt: e.imageAlt, widths: [400, 640, 960], sizes: "(max-width: 700px) 100vw, 380px", ratio: [3, 2] })}
        ${e.kind ? `<span class="exp-kind">${icon(kindIcon(e.kind), { size: 14 })}${esc(e.kind)}</span>` : ""}
      </div>
      <div class="card-body">
        <h3 class="card-title">${title}</h3>
        ${e.place ? `<p class="exp-place">${icon("map-pin", { size: 15 })}${esc(e.place.name)}${e.place.region ? `, ${esc(e.place.region)}` : ""}</p>` : ""}
        ${e.summary ? `<p class="card-text">${esc(e.summary)}</p>` : ""}
        ${facts ? `<div class="exp-facts">${facts}</div>` : ""}
        ${rating || action ? `<div class="exp-foot">${rating || "<span></span>"}${action}</div>` : ""}
      </div>
    </article>`;
  }

  function sectionHead(o) {
    return `<div class="section-head">
      <div>${o.eyebrow ? `<p class="eyebrow">${esc(o.eyebrow)}</p>` : ""}<h2 class="section-title">${esc(o.title)}</h2>${o.text ? `<p class="section-text">${esc(o.text)}</p>` : ""}</div>
      ${o.href ? `<a class="link-arrow" href="${esc(o.href)}">${esc(o.link || "See all")} ${icon("arrow-right", { size: 18 })}</a>` : ""}
    </div>`;
  }

  /* ---------- Rows of cards that scroll sideways ---------- */

  // Arrow buttons and a slim progress line take the place of the browser's scrollbar.
  function scroller(items, label) {
    return `<div class="scroller-wrap" data-scroller>
      <div class="scroller" tabindex="0" role="region" aria-label="${esc(label)}">${items}</div>
      <button class="scroller-btn prev" type="button" data-scroll="-1" aria-label="Scroll back">${icon("chevron-left", { size: 20 })}</button>
      <button class="scroller-btn next" type="button" data-scroll="1" aria-label="Scroll on">${icon("chevron-right", { size: 20 })}</button>
      <div class="scroller-track" aria-hidden="true"><span></span></div>
    </div>`;
  }

  function updateScroller(wrap) {
    const row = wrap.querySelector(".scroller");
    const thumb = wrap.querySelector(".scroller-track span");
    if (!row || !thumb) return;
    const max = row.scrollWidth - row.clientWidth;
    const share = Math.min(1, Math.max(0.12, row.clientWidth / Math.max(1, row.scrollWidth)));
    const at = max > 0 ? row.scrollLeft / max : 0;
    wrap.classList.toggle("is-static", max <= 2);
    wrap.classList.toggle("at-start", row.scrollLeft <= 2);
    wrap.classList.toggle("at-end", row.scrollLeft >= max - 2);
    thumb.style.width = `${share * 100}%`;
    thumb.style.transform = `translateX(${at * (1 / share - 1) * 100}%)`;
  }

  /* ---------- Start-up ---------- */

  async function boot(render) {
    const main = document.getElementById("main");
    const done = new Set();
    const ctx = {
      main,
      // Runs fn only the first time it is called with this key.
      once(key, fn) {
        if (done.has(key)) return;
        done.add(key);
        fn();
      },
    };
    SASHA.img.installFallback();
    wireOnce();
    renderChrome(C.site({}));
    if (main) {
      main.setAttribute("aria-busy", "true");
      main.innerHTML = `<div class="container section"><div class="grid grid-3">${skeletons(3)}</div></div>`;
    }

    const run = (site) => {
      lastSite = site;
      renderChrome(site);
      try {
        render(site, ctx);
        finish(main);
      } catch (err) {
        console.error(err);
        showError(err);
      }
    };

    try {
      run(await SASHA.store.getSite({ onUpdate: run }));
    } catch (err) {
      console.error(err);
      showError(err);
    }
    SASHA.store.onChange(() => {
      SASHA.store.getSite().then(run).catch((err) => console.warn("[Sasha]", err.message));
    });
  }

  SASHA.site = {
    boot,
    state,
    skeletons,
    storyCard,
    featureCard,
    placeCard,
    expCard,
    scroller,
    themeTag,
    themePill,
    stars,
    sectionHead,
    storyMeta,
    dateLabel,
    kindIcon,
    applyTheme,
    setTitle,
    setDescription,
    param,
    setParams,
    loadScript,
    reveal,
    finish,
    openSearch,
    get site() {
      return lastSite;
    },
  };
})();
