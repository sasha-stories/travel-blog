// Sasha Travel Stories: story themes in the dashboard. #/themes lists them; #/themes/new and #/themes/<id> open the editor with a live preview.
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const A = SASHA.admin;
  const U = SASHA.util;
  const S = SASHA.schema;
  const C = SASHA.content;
  const esc = U.esc;
  const icon = SASHA.icon;

  const TABS = [
    ["all", "All", (t) => t.status !== "deleted"],
    ["bin", "Bin", (t) => t.status === "deleted"],
  ];
  const usedBy = (t) => A.alive(A.data.stories).filter((s) => s.theme === t.slug);
  const viewUrl = (t) => (t.status === "active" && t.slug ? C.links.journal({ theme: t.slug }) : "");

  /* ---------- List ---------- */

  function row(t) {
    const look = S.lookOf(t.look);
    const link = viewUrl(t);
    const actions =
      t.status === "deleted"
        ? `<button class="icon-btn" type="button" data-restore="${esc(t.id)}" aria-label="Restore" title="Restore">${icon("rotate-ccw", { size: 18 })}</button>`
        : `<a class="icon-btn" href="#/themes/${esc(t.id)}" aria-label="Edit" title="Edit">${icon("pencil", { size: 18 })}</a>` +
          (link ? `<a class="icon-btn" href="${esc(link)}" target="_blank" rel="noopener" aria-label="View on the blog" title="View on the blog">${icon("eye", { size: 18 })}</a>` : "") +
          `<button class="icon-btn" type="button" data-delete="${esc(t.id)}" aria-label="Move to the bin" title="Move to the bin">${icon("trash-2", { size: 18 })}</button>`;
    const meta = [A.badge(t.status), `<span>${esc(look.label)} look</span>`, `<span>${U.plural(usedBy(t).length, "story", "stories")}</span>`].join("");
    return `<div class="row">${A.swatch(t)}<div class="row-main"><a class="row-title" href="#/themes/${esc(t.id)}">${esc(t.name || "Untitled theme")}</a><div class="row-meta">${meta}</div></div><div class="row-actions">${actions}</div></div>`;
  }

  function listView(view, route) {
    let tab = TABS.some((t) => t[0] === route.query.get("tab")) ? route.query.get("tab") : "all";
    let q = "";
    view.innerHTML =
      A.head({
        title: "Themes",
        sub: "A theme gives the stories that use it their own colours, like soft blue and white for a snowy trek. The rest of the site keeps its beige and white look.",
        actions: `<a class="btn btn-primary" href="#/themes/new">${icon("plus", { size: 18 })}New theme</a>`,
      }) +
      `<div class="list-toolbar"><div data-tabs></div><label class="search-input">${icon("search", { size: 16 })}<input class="input" type="search" placeholder="Search themes" data-q aria-label="Search themes"></label></div>
      <div class="card list" data-list></div>`;

    const draw = () => {
      view.querySelector("[data-tabs]").innerHTML = A.tabs(TABS.map(([id, label, fn]) => ({ id, label, count: A.data.themes.filter(fn).length })), tab);
      const fn = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
      let list = A.data.themes.filter(fn);
      if (q) {
        const n = A.norm(q);
        list = list.filter((t) => A.norm(`${t.name} ${t.description} ${S.lookOf(t.look).label}`).includes(n));
      }
      view.querySelector("[data-list]").innerHTML = list.length
        ? list.map(row).join("")
        : A.empty({
            icon: tab === "bin" ? "trash-2" : "palette",
            title: tab === "bin" ? "The bin is empty" : q ? "Nothing matches" : "No themes yet",
            text: tab === "bin" || q ? "" : "Make one, then choose it in a story's Look and feel card.",
            action: tab === "bin" || q ? "" : '<a class="btn btn-primary" href="#/themes/new">New theme</a>',
          });
    };
    draw();

    view.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-tab], [data-delete], [data-restore]");
      if (!t) return;
      if (t.dataset.tab) {
        tab = t.dataset.tab;
        draw();
        return;
      }
      const id = t.dataset.delete || t.dataset.restore;
      const theme = A.data.themes.find((x) => x.id === id);
      if (!theme) return;
      try {
        if (t.dataset.delete) {
          const ok = await A.confirm({ title: "Move to the bin?", text: `"${theme.name}" stops being shown on the blog. You can restore it from the Bin.`, confirmLabel: "Move to bin", danger: true });
          if (!ok) return;
          await A.remove("themes", id);
          A.toast("Moved to the bin");
        } else {
          await A.restore("themes", id);
          A.toast("Restored");
        }
        draw();
      } catch (err) {
        A.fail(err);
      }
    });
    view.querySelector("[data-q]").addEventListener(
      "input",
      U.debounce((e) => {
        q = e.target.value.trim();
        draw();
      }, 150)
    );
  }

  /* ---------- Editor ---------- */

  function lookGrid(current) {
    return `<div class="look-grid" role="radiogroup" aria-label="Look">${Object.entries(S.LOOKS)
      .map(
        ([key, l]) =>
          `<label class="look-option${key === current ? " is-selected" : ""}"><input type="radio" name="look" value="${key}"${key === current ? " checked" : ""}><span class="look-swatch" style="--a:${l.accent};--t:${l.tint}">${icon(l.icon, { size: 20 })}</span><span class="look-name">${esc(l.label)}</span></label>`
      )
      .join("")}</div>`;
  }

  function preview(card, name) {
    return `<div class="theme-preview" data-preview style="--a:${esc(card.accent)};--t:${esc(card.tint)};--s:${esc(card.soft)}">
      <div class="tp-glow">
        <span class="tp-pill"><span class="tp-pill-icon" data-preview-icon>${icon(card.icon, { size: 14 })}</span><span data-preview-name>${esc(name || "Your theme")}</span></span>
        <p class="tp-title">Over the pass in fresh snow</p>
        <p class="tp-text">A story with this theme takes on these colours: its page, links, quotes, tips and reading bar.</p>
      </div>
      <div class="tp-tip"><strong>Travel note</strong>Start early, carry warm layers and keep an eye on the weather.</div>
    </div>`;
  }

  function usedCard(item) {
    const stories = usedBy(item);
    const rows = stories
      .map(
        (s) =>
          `<div class="row">${A.thumb(s.coverImage)}<div class="row-main"><a class="row-title" href="#/journal/${esc(s.id)}">${esc(s.title || "Untitled")}</a><div class="row-meta">${A.badge(A.storyState(s))}</div></div></div>`
      )
      .join("");
    return `<div class="card">
      <div class="card-head"><h2 class="card-title">Stories using it</h2><span class="help">${stories.length}</span></div>
      <div class="list">${rows || A.empty({ icon: "book-open", title: "No stories yet", text: "Choose this theme in a story's Look and feel card." })}</div>
    </div>`;
  }

  function editorView(view, route) {
    let isNew = route.id === "new";
    let item = isNew ? { name: "", description: "", look: "journal", accent: "", tint: "", sortOrder: 0, status: "active" } : A.data.themes.find((t) => t.id === route.id);
    if (!item) {
      view.innerHTML = A.head({ title: "This theme wasn't found", back: "#/themes", backLabel: "All themes" });
      return;
    }
    let base = item.updatedAt || "";

    const draw = () => {
      const card = C.themeCard(item, 0);
      const savedText = isNew ? "Not saved yet" : "All changes saved";
      const link = isNew ? "" : viewUrl(item);
      view.innerHTML =
        A.head({ title: isNew ? "New theme" : item.name || "Untitled theme", back: "#/themes", backLabel: "All themes" }) +
        `<form class="grid-2col" data-form novalidate>
          <div class="card">
            <div class="card-body"><div class="form-grid">
              ${A.f.text({ name: "name", label: "Name", value: item.name, max: 60, placeholder: "e.g. Snowy escapes" })}
              ${A.f.select({ name: "status", label: "Status", value: item.status === "hidden" ? "hidden" : "active", options: [["active", "Shown on the blog"], ["hidden", "Hidden from the blog"]] })}
              ${A.f.textarea({ name: "description", label: "Description", value: item.description, rows: 3, max: 300, span2: true, help: "Shown on the theme's page in the journal and on its card." })}
              <div class="field span-2"><span class="label">Look</span>${lookGrid(card.look)}<p class="help">Choosing a look sets both colours below. Fine-tune them afterwards if you like.</p></div>
              ${A.f.color({ name: "accent", label: "Accent colour", value: card.accent, help: "Links, buttons, quotes and the reading bar." })}
              ${A.f.color({ name: "tint", label: "Background colour", value: card.tint, help: "The page itself. Keep it pale so text stays easy to read." })}
              ${A.f.text({ name: "sortOrder", label: "Order", type: "number", value: item.sortOrder || 0, help: "Lower numbers come first." })}
              ${isNew ? "" : `<div class="field"><span class="label">Link name</span><p class="help">journal.html?theme=<code>${esc(item.slug)}</code>. It never changes, so links keep working.</p></div>`}
            </div></div>
            <div class="card-foot">
              ${!isNew && item.status !== "deleted" ? `<button class="btn btn-ghost push" type="button" data-del>${icon("trash-2", { size: 16 })}Move to bin</button>` : ""}
              <span class="save-state" data-saved="${savedText}">${savedText}</span>
              ${link ? `<a class="btn btn-light" href="${esc(link)}" target="_blank" rel="noopener">${icon("eye", { size: 18 })}View</a>` : ""}
              <button class="btn btn-primary" type="submit" data-busy="Saving...">${icon("save", { size: 18 })}Save</button>
            </div>
          </div>
          <div class="stack">
            <div class="card">
              <div class="card-head"><h2 class="card-title">Preview</h2></div>
              <div class="card-body">${preview(card, item.name)}<p class="help">The site itself keeps its own beige and white; only stories with this theme change colour.</p></div>
            </div>
            ${isNew ? "" : usedCard(item)}
          </div>
        </form>`;

      const form = view.querySelector("[data-form]");
      const box = form.querySelector("[data-preview]");

      const setColour = (name, value) => {
        form.elements[name].value = value;
        const code = form.querySelector(`[data-hex-for="${name}"]`);
        if (code) code.textContent = value;
      };

      const updatePreview = () => {
        const v = A.readForm(form);
        const next = C.themeCard({ look: v.look, accent: v.accent, tint: v.tint }, 0);
        box.style.setProperty("--a", next.accent);
        box.style.setProperty("--t", next.tint);
        box.style.setProperty("--s", next.soft);
        box.querySelector("[data-preview-icon]").innerHTML = icon(next.icon, { size: 14 });
        box.querySelector("[data-preview-name]").textContent = (v.name || "").trim() || "Your theme";
      };

      A.wireForm(form, () => A.setDirty(true));
      form.addEventListener("change", (e) => {
        if (e.target.name === "look") {
          const look = S.lookOf(e.target.value);
          setColour("accent", look.accent);
          setColour("tint", look.tint);
          form.querySelectorAll(".look-option").forEach((o) => o.classList.toggle("is-selected", o.querySelector("input").checked));
        }
        updatePreview();
      });
      form.addEventListener("input", updatePreview);

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        A.clearErrors(form);
        const v = A.readForm(form);
        const data = { name: v.name, description: v.description, look: v.look, accent: v.accent, tint: v.tint, status: v.status, sortOrder: v.sortOrder };
        if (item.id) data.id = item.id;
        try {
          S.normalize("themes", data);
        } catch (err) {
          A.fail(err, form);
          return;
        }
        await A.busy(form.querySelector('button[type="submit"]'), async () => {
          try {
            item = await A.save("themes", data, base);
            base = item.updatedAt;
            A.setDirty(false);
            A.toast("Theme saved");
            if (isNew) {
              isNew = false;
              A.replaceHash(`#/themes/${item.id}`);
            }
            draw();
          } catch (err) {
            A.fail(err, form);
          }
        });
      });

      const del = form.querySelector("[data-del]");
      if (del) {
        del.addEventListener("click", async () => {
          const ok = await A.confirm({ title: "Move this theme to the bin?", text: `"${item.name}" stops being shown on the blog. You can restore it from the Bin.`, confirmLabel: "Move to bin", danger: true });
          if (!ok) return;
          try {
            await A.remove("themes", item.id);
            A.setDirty(false);
            A.toast("Moved to the bin");
            A.go("#/themes");
          } catch (err) {
            A.fail(err);
          }
        });
      }
    };
    draw();
  }

  A.register({
    id: "themes",
    label: "Themes",
    icon: "palette",
    group: "site",
    order: 5,
    count: (d) => A.alive(d.themes).length,
    render(view, route) {
      if (route.id) editorView(view, route);
      else listView(view, route);
    },
  });
})();
