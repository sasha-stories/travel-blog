// Sasha Travel Stories: dashboard start-up, sign-in, the sidebar, page switching (#/section/id?query) and the Overview. Loaded after the sections.
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const A = SASHA.admin;
  const U = SASHA.util;
  const C = SASHA.content;
  const esc = U.esc;
  const icon = SASHA.icon;
  const app = document.getElementById("app");
  const GROUPS = [
    ["write", "Write"],
    ["collections", "Collections"],
    ["site", "Site"],
  ];
  let currentHash = location.hash;

  const siteTitle = () => (A.data && A.data.settings.siteTitle) || SASHA.schema.DEFAULT_SETTINGS.siteTitle;

  /* ---------- Sign in ---------- */

  function signInScreen(message) {
    A.data = null;
    A.dirty = false;
    const note = message ? `<div class="notice notice-warn">${icon("info", { size: 18 })}<span>${esc(message)}</span></div>` : "";
    app.innerHTML = `<div class="signin"><div class="card signin-card">
      <div class="signin-brand"><span class="brand-mark">${icon("compass", { size: 18 })}</span><div><strong>${esc(siteTitle())}</strong><div class="help">Dashboard</div></div></div>
      <h1 class="signin-title">Welcome back</h1>
      ${note}
      <form data-signin>
        <div class="field"><label class="label" for="pw">Password</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn btn-primary" type="submit" data-busy="Signing in...">${icon("lock", { size: 18 })}Sign in</button>
      </form>
      <p class="signin-note">Forgot your password? Set a new one in Google Apps Script, as assets/setup.txt explains (step 4).</p>
      <p class="signin-note"><a class="link-arrow" href="${esc(C.links.home())}">${icon("arrow-left", { size: 14 })}Back to the blog</a></p>
    </div></div>`;
    const form = app.querySelector("[data-signin]");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      A.busy(form.querySelector('button[type="submit"]'), async () => {
        try {
          await A.api.signIn(form.elements.password.value);
          await load();
        } catch (err) {
          A.toast(err.message, "error");
          if (form.isConnected) form.elements.password.select();
        }
      });
    });
    app.querySelector("#pw").focus();
  }

  async function load() {
    app.innerHTML = '<div class="boot">Loading your content&hellip;</div>';
    try {
      const raw = await A.api.bootstrap();
      A.data = Object.assign(SASHA.schema.normalizeData(raw), { folders: Array.isArray(raw.folders) ? raw.folders : [] });
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        A.api.signOut();
        signInScreen(err.message);
        return;
      }
      app.innerHTML = `<div class="signin"><div class="card signin-card">${A.empty({ icon: "cloud-off", title: "Your content couldn't be loaded", text: err.message, action: '<button class="btn btn-primary" type="button" data-retry>Try again</button>' })}</div></div>`;
      app.querySelector("[data-retry]").addEventListener("click", load);
      return;
    }
    renderShell();
    route();
  }

  async function signOut() {
    if (A.dirty && !(await A.confirm({ title: "Sign out?", text: "You have unsaved changes. They will be lost.", confirmLabel: "Sign out", danger: true }))) return;
    A.api.signOut();
    signInScreen("");
  }

  A.onUnauthorized = (message) => {
    A.api.signOut();
    signInScreen(message || "Your session has ended. Please sign in again.");
  };
  A.reload = load;

  /* ---------- Frame: sidebar and top bar ---------- */

  function renderShell() {
    app.innerHTML = `<div class="admin-shell">
      <aside class="sidebar" aria-label="Dashboard">
        <a class="side-brand" href="#/overview"><span class="brand-mark">${icon("compass", { size: 18 })}</span><span><strong>${esc(siteTitle())}</strong><small>Dashboard</small></span></a>
        <nav class="side-nav" id="side-nav" aria-label="Sections"></nav>
        <div class="side-foot">
          <div class="mode-badge"><span class="dot"></span><span>Connected to Google Sheets</span></div>
          <a class="side-link" href="${esc(C.links.home())}" target="_blank" rel="noopener">${icon("external-link", { size: 18 })}View the blog</a>
          <button class="side-link" type="button" data-signout>${icon("log-out", { size: 18 })}Sign out</button>
        </div>
      </aside>
      <div class="side-backdrop" data-close-nav></div>
      <div class="admin-main">
        <header class="topbar">
          <button class="icon-btn menu-toggle" type="button" data-open-nav aria-label="Open the menu">${icon("menu")}</button>
          <p class="topbar-title" id="topbar-title"></p>
          <div class="topbar-actions"><a class="btn btn-light btn-sm" href="${esc(C.links.home())}" target="_blank" rel="noopener">${icon("eye", { size: 16 })}View blog</a></div>
        </header>
        <div class="view" id="view"></div>
      </div>
    </div>`;
    const shell = app.querySelector(".admin-shell");
    shell.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-nav]")) shell.classList.add("nav-open");
      else if (e.target.closest("[data-close-nav]") || e.target.closest(".side-nav a")) shell.classList.remove("nav-open");
      if (e.target.closest("[data-signout]")) signOut();
    });
    refreshNav();
  }

  function refreshNav() {
    const nav = document.getElementById("side-nav");
    if (!nav || !A.data) return;
    const current = parse().section;
    nav.innerHTML = GROUPS.map(([group, label]) => {
      const items = A.sections.filter((s) => (s.group || "write") === group);
      if (!items.length) return "";
      return (
        `<p class="side-label">${esc(label)}</p>` +
        items
          .map((s) => {
            const count = s.count ? s.count(A.data) : null;
            const active = s.id === current;
            return `<a class="side-link${active ? " is-active" : ""}" href="#/${s.id}"${active ? ' aria-current="page"' : ""}>${icon(s.icon, { size: 18 })}<span>${esc(s.label)}</span>${count !== null && count !== undefined ? `<span class="side-count">${count}</span>` : ""}</a>`;
          })
          .join("")
      );
    }).join("");
  }
  A.refreshNav = refreshNav;

  /* ---------- Page switching ---------- */

  function parse() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    return { section: parts[0] || "overview", id: parts[1] || "", query: new URLSearchParams(qs || "") };
  }

  function route() {
    if (!A.data || !document.getElementById("view")) return;
    const r = parse();
    const section = A.sections.find((s) => s.id === r.section);
    const view = document.createElement("div");
    view.className = "view";
    view.id = "view";
    document.getElementById("view").replaceWith(view);
    A.setDirty(false);
    currentHash = location.hash;
    document.getElementById("topbar-title").textContent = section ? section.label : "Dashboard";
    document.title = `${section ? section.label : "Dashboard"} | ${siteTitle()}`;
    refreshNav();
    window.scrollTo(0, 0);
    if (!section) {
      view.innerHTML = `<div class="card">${A.empty({ icon: "compass", title: "This page isn't here", text: "The sidebar has every part of the dashboard.", action: '<a class="btn btn-primary" href="#/overview">Go to the overview</a>' })}</div>`;
      return;
    }
    try {
      section.render(view, r);
    } catch (err) {
      A.fail(err);
      view.innerHTML = `<div class="card">${A.empty({ icon: "circle-alert", title: "This page couldn't be opened", text: err.message })}</div>`;
    }
  }

  A.go = (hash) => {
    location.hash = hash;
  };

  // Changes the address without opening the page again, for example after saving something new.
  A.replaceHash = (hash) => {
    history.replaceState(null, "", hash);
    currentHash = location.hash;
    refreshNav();
  };

  window.addEventListener("hashchange", () => {
    if (!A.data) return;
    if (A.dirty && !window.confirm("You have unsaved changes. Leave this page without saving?")) {
      history.replaceState(null, "", currentHash || "#/overview");
      return;
    }
    route();
  });

  window.addEventListener("beforeunload", (e) => {
    if (A.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------- Overview: a way into every part of the site ---------- */

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };
  const short = (text) => (text.length > 32 ? `${text.slice(0, 31)}\u2026` : text);
  const noSpot = (p) => p.lat === null || p.lat === undefined || p.lat === "";

  A.register({
    id: "overview",
    label: "Overview",
    icon: "layout-dashboard",
    group: "write",
    order: 1,
    render(view) {
      const d = A.data;
      const s = d.settings;
      const stories = A.alive(d.stories).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      const count = (state) => stories.filter((x) => A.storyState(x) === state).length;
      const scheduled = count("scheduled");
      const draft = stories.find((x) => A.storyState(x) === "draft");
      const missing = (list, test) => A.alive(list).filter(test).length;
      // Small jobs worth doing, each linked to the place where it gets done.
      const checks = [
        ["#/journal?tab=drafts", "file-text", missing(d.stories, (x) => A.storyState(x) === "draft" && !x.coverImage), "draft", "drafts", "without a cover photo yet"],
        ["#/places", "map-pin", missing(d.places, noSpot), "place", "places", "not on the map yet"],
        ["#/experiences", "sparkles", missing(d.experiences, (e) => !e.image), "experience", "experiences", "without a photo"],
        ["#/media", "images", missing(d.images, (im) => !im.alt), "photo", "photos", "without a description"],
      ].filter((c) => c[2] > 0);
      const stat = (href, ic, value, label) =>
        `<a class="card stat-card" href="${href}"><span class="stat-icon">${icon(ic, { size: 20 })}</span><span><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></span></a>`;
      const row = (x) =>
        `<div class="row">${A.thumb(x.coverImage)}<div class="row-main"><a class="row-title" href="#/journal/${esc(x.id)}">${esc(x.title || "Untitled")}</a><div class="row-meta">${A.badge(A.storyState(x))}<span>Edited ${esc(U.relativeTime(x.updatedAt))}</span></div></div><div class="row-actions"><a class="icon-btn" href="#/journal/${esc(x.id)}" aria-label="Edit">${icon("pencil", { size: 18 })}</a></div></div>`;
      const hubLink = (href, ic, title, text, warn) =>
        `<a class="hub-link" href="${href}"><span class="hub-icon${warn ? " is-warn" : ""}">${icon(ic, { size: 18 })}</span><span><strong>${esc(title)}</strong><small>${esc(text)}</small></span>${icon("arrow-right", { size: 16 })}</a>`;
      const quick = [
        ["#/journal/new", "feather", "New story"],
        ["#/places/new", "map-pin", "New place"],
        ["#/experiences/new", "sparkles", "New experience"],
        ["#/themes/new", "palette", "New theme"],
        ["#/media", "upload", "Upload photos"],
      ];
      const hub = [
        ["#/settings?part=home", "house", "Home page", "Headline, intro and the big photo"],
        ["#/settings?part=about", "user", "About page", "Your story, photo and short bio"],
        ["#/settings?part=contact", "mail", "Contact links", "Email, Instagram and YouTube"],
        ["#/settings?part=site", "type", "Site name and footer", "The name, tagline and footer note"],
        ["#/themes", "palette", "Story themes", "The colours and looks a story can wear"],
        ["#/media", "images", "Media library", "Photos and their Cloudinary folders"],
      ];
      const summary = [`${U.plural(count("published"), "story", "stories")} published`, U.plural(count("draft"), "draft", "drafts"), stories.length ? `last edit ${U.relativeTime(stories[0].updatedAt)}` : ""]
        .filter(Boolean)
        .join(" \u00b7 ");
      const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      view.innerHTML = `<section class="welcome">
          <div>
            <p class="eyebrow">${esc(today)}</p>
            <h1 class="welcome-title">${esc(greeting())}${s.authorName ? `, ${esc(s.authorName)}` : ""}</h1>
            <p class="welcome-text">${esc(summary)}</p>
          </div>
          <div class="inline-list">
            ${draft ? `<a class="btn btn-light" href="#/journal/${esc(draft.id)}">${icon("pencil", { size: 16 })}Continue &ldquo;${esc(short(draft.title || "Untitled"))}&rdquo;</a>` : ""}
            <a class="btn btn-primary" href="#/journal/new">${icon("feather", { size: 18 })}Write a story</a>
          </div>
        </section>
        <div class="stat-grid">
          ${stat("#/journal?tab=published", "book-open", count("published"), "published stories")}
          ${stat("#/journal?tab=drafts", "file-text", count("draft"), "drafts")}
          ${scheduled ? stat("#/journal?tab=scheduled", "clock", scheduled, "scheduled") : ""}
          ${stat("#/places", "map-pin", A.alive(d.places).length, "places")}
          ${stat("#/experiences", "sparkles", A.alive(d.experiences).length, "experiences")}
          ${stat("#/themes", "palette", A.alive(d.themes).length, "themes")}
          ${stat("#/media", "images", A.alive(d.images).length, "photos")}
        </div>
        <div class="grid-2col">
          <div class="stack">
            <div class="card">
              <div class="card-head"><h2 class="card-title">Recently edited</h2><a class="link-arrow" href="#/journal">All stories ${icon("arrow-right", { size: 16 })}</a></div>
              <div class="list">${stories.slice(0, 6).map(row).join("") || A.empty({ icon: "feather", title: "No stories yet", action: '<a class="btn btn-primary" href="#/journal/new">Write the first one</a>' })}</div>
            </div>
            <div class="card">
              <div class="card-head"><h2 class="card-title">Needs attention</h2></div>
              <div class="card-body">${
                checks.length
                  ? `<div class="hub-list">${checks.map(([href, ic, n, one, many, text]) => hubLink(href, ic, U.plural(n, one, many), text, true)).join("")}</div>`
                  : `<p class="all-clear">${icon("circle-check", { size: 18 })}All tidy: nothing needs your attention.</p>`
              }</div>
            </div>
          </div>
          <div class="stack">
            <div class="card"><div class="card-head"><h2 class="card-title">Add something new</h2></div><div class="card-body"><div class="quick-grid">${quick
              .map(([href, ic, label]) => `<a class="btn btn-light btn-sm" href="${href}">${icon(ic, { size: 16 })}${esc(label)}</a>`)
              .join("")}</div></div></div>
            <div class="card"><div class="card-head"><h2 class="card-title">Your site</h2></div><div class="card-body"><div class="hub-list">${hub.map(([href, ic, title, text]) => hubLink(href, ic, title, text)).join("")}</div></div></div>
          </div>
        </div>`;
    },
  });

  /* ---------- Start ---------- */

  if (A.api.isSignedIn()) load();
  else signInScreen("");
})();
