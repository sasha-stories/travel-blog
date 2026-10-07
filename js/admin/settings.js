// Sasha Travel Stories: Settings in the dashboard (#/settings; ?part=site, home, about or contact jumps to a card), the connection check and the tools.
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const A = SASHA.admin;
  const U = SASHA.util;
  const S = SASHA.schema;
  const C = SASHA.content;
  const esc = U.esc;
  const icon = SASHA.icon;
  const CFG = window.SASHA_CONFIG || {};

  const PARTS = [
    { id: "site", title: "Site name and footer", keys: ["siteTitle", "tagline", "footerNote"] },
    { id: "home", title: "Home page", keys: ["heroTitle", "heroSubtitle", "heroImage"] },
    { id: "about", title: "About page", keys: ["aboutTitle", "aboutBody", "aboutImage", "authorName", "authorBio", "authorPhoto"] },
    { id: "contact", title: "Contact links", keys: ["email", "instagramUrl", "youtubeUrl"] },
  ];

  const HELP = {
    siteTitle: "Shown in the header, the footer and browser tabs.",
    tagline: "A short line about the blog; search engines show it too.",
    footerNote: "A line of your own at the bottom of every page.",
    heroTitle: "The big headline on the home page.",
    heroImage: "The large photo at the top of the home page.",
    aboutBody: "Leave an empty line between paragraphs.",
    authorName: "Shown on the about page and under every story.",
    authorBio: "Two or three sentences, shown in the footer and under every story.",
    authorPhoto: "A photo of you, shown under every story and on the home page.",
    email: "Shown as a button on the about page. Leave it empty to hide the button.",
  };

  function fieldFor(def, value) {
    if (def.type === "image") return A.f.image({ name: def.key, label: def.label, value, help: HELP[def.key] });
    if (def.type === "text") return A.f.textarea({ name: def.key, label: def.label, value, rows: def.key === "aboutBody" ? 10 : 3, max: def.max, span2: true, help: HELP[def.key] });
    const type = def.type === "email" ? "email" : def.type === "url" ? "url" : "text";
    return A.f.text({ name: def.key, label: def.label, value, type, max: def.max, span2: true, placeholder: def.type === "url" ? "https://" : "", help: HELP[def.key] });
  }

  async function connection(box) {
    const notice = (part, ic) =>
      `<div class="notice ${part.ok ? "notice-success" : "notice-warn"}">${icon(part.ok ? "circle-check" : ic, { size: 18 })}<span>${esc(part.message || "")}</span></div>`;
    try {
      const status = await A.api.status();
      A.photoCheck = Promise.resolve(status.photos || null);
      if (!box.isConnected) return;
      box.innerHTML = notice(status.content || {}, "database") + notice(status.photos || {}, "cloud-off");
    } catch (err) {
      if (box.isConnected) box.innerHTML = `<div class="notice notice-error">${icon("circle-alert", { size: 18 })}<span>${esc(err.message)}</span></div>`;
    }
  }

  function settingsPage(view, route) {
    const values = A.data.settings;
    const byKey = Object.fromEntries(S.SETTINGS.map((d) => [d.key, d]));
    view.innerHTML =
      A.head({
        title: "Settings",
        sub: "The words and photos used across the whole site.",
        actions: `<span class="save-state" data-saved="All changes saved">All changes saved</span><button class="btn btn-primary" type="submit" form="settings-form" data-busy="Saving...">${icon("save", { size: 18 })}Save settings</button>`,
      }) +
      `<div class="grid-2col">
        <form class="stack" id="settings-form" novalidate>
          ${PARTS.map(
            (p) =>
              `<div class="card" id="set-${p.id}"><div class="card-head"><h2 class="card-title">${esc(p.title)}</h2></div><div class="card-body"><div class="form-grid">${p.keys.map((k) => fieldFor(byKey[k], values[k])).join("")}</div></div></div>`
          ).join("")}
          <div class="form-actions"><button class="btn btn-primary" type="submit" data-busy="Saving...">${icon("save", { size: 18 })}Save settings</button></div>
        </form>
        <div class="stack">
          <div class="card"><div class="card-head"><h2 class="card-title">Connection</h2></div><div class="card-body" data-status><p class="help">Checking&hellip;</p></div></div>
          <div class="card"><div class="card-head"><h2 class="card-title">Tools</h2></div><div class="card-body">
            <div class="inline-list">
              <button class="btn btn-light" type="button" data-export data-busy="Preparing...">${icon("save", { size: 16 })}Download a backup</button>
              <button class="btn btn-light" type="button" data-sitemap data-busy="Preparing...">${icon("globe", { size: 16 })}Download sitemap.xml</button>
            </div>
            <p class="help">The backup is one file with all your words and photo links. The sitemap helps Google find every story: put it next to index.html when you publish the site.</p>
          </div></div>
        </div>
      </div>`;
    connection(view.querySelector("[data-status]"));

    const form = view.querySelector("#settings-form");
    A.wireForm(form, () => A.setDirty(true));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      A.clearErrors(form);
      const v = A.readForm(form);
      try {
        S.cleanSettings(v);
      } catch (err) {
        A.fail(err, form);
        return;
      }
      await A.busy(e.submitter || view.querySelector('[form="settings-form"]'), async () => {
        try {
          const saved = await A.api.saveSettings(v);
          A.data.settings = Object.assign({}, A.data.settings, saved);
          A.setDirty(false);
          const brand = document.querySelector(".side-brand strong");
          if (brand) brand.textContent = A.data.settings.siteTitle;
          A.toast("Settings saved");
        } catch (err) {
          A.fail(err, form);
        }
      });
    });

    view.addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      try {
        if (t.hasAttribute("data-export")) {
          await A.busy(t, async () => {
            const data = await A.api.exportAll();
            A.download(`sasha-travel-stories-backup-${U.today()}.json`, JSON.stringify(data, null, 2));
          });
        } else if (t.hasAttribute("data-sitemap")) {
          if (!CFG.siteUrl) {
            A.toast("First put the site's public address in siteUrl in js/config.js.", "info");
            return;
          }
          await A.busy(t, async () => {
            const site = await SASHA.store.getSite({ force: true });
            A.download("sitemap.xml", C.sitemapXml(site, CFG.siteUrl), "application/xml");
          });
        }
      } catch (err) {
        A.fail(err);
      }
    });

    const part = route.query.get("part");
    const target = part && view.querySelector(`#set-${CSS.escape(part)}`);
    if (target) {
      target.classList.add("is-target");
      setTimeout(() => target.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
      setTimeout(() => target.classList.remove("is-target"), 2600);
    }
  }

  A.register({ id: "settings", label: "Settings", icon: "settings", group: "site", order: 7, render: settingsPage });
})();
