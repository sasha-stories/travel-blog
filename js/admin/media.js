// Sasha Travel Stories: the media library (#/media) and the photo picker used across the dashboard (A.media.pick).
// Every photo lives in Cloudinary inside the "Sasha Blog" folder; folders made here are made there too, and the sheet's Media tab keeps the list.
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const A = SASHA.admin;
  const U = SASHA.util;
  const S = SASHA.schema;
  const esc = U.esc;
  const icon = SASHA.icon;

  const ROOT = "Sasha Blog";
  const ALL = "*";
  const TOP = "-";
  const SOURCES = { cloudinary: "Cloudinary", unsplash: "Unsplash", link: "Web link" };
  const real = (folder) => (folder && folder !== ALL && folder !== TOP ? folder : "");
  const inside = (f, parent) => f === parent || f.indexOf(`${parent}/`) === 0;
  const alive = () => A.alive(A.data.images);
  const where = (folder) => [ROOT].concat(real(folder) ? real(folder).split("/") : []).join(" / ");
  const folderOptions = () => [["", `${ROOT} (top level)`]].concat((A.data.folders || []).map((f) => [f, where(f)]));

  function nameOf(im) {
    if (im.alt) return im.alt;
    if (im.publicId) return im.publicId.split("/").pop();
    return (im.url.split("?")[0].split("/").pop() || "Photo").slice(0, 60);
  }

  function filtered(folder, q) {
    let list = alive();
    if (folder === TOP) list = list.filter((im) => !im.folder);
    else if (folder !== ALL) list = list.filter((im) => im.folder && inside(im.folder, folder));
    if (q) {
      const n = A.norm(q);
      list = list.filter((im) => A.norm(`${im.alt} ${im.caption} ${im.folder} ${im.credit}`).includes(n));
    }
    return list;
  }

  function setFolders(list) {
    A.data.settings.mediaFolders = list.slice();
    A.data.folders = list.slice();
  }

  // Asks the bridge once per visit whether Cloudinary is set up.
  function photoStatus() {
    if (!A.photoCheck) {
      A.photoCheck = A.api
        .status()
        .then((s) => s.photos || null)
        .catch(() => null);
    }
    return A.photoCheck;
  }

  // Cloudinary copies folder changes when it can; the Media tab in the sheet is always the true list.
  async function syncNote(synced, involvesCloudinary) {
    if (synced || !involvesCloudinary) return;
    const photos = await photoStatus();
    if (photos && photos.ok) A.toast("Saved. Cloudinary didn't take this change, so its own folders may look different there. Photo links keep working.", "info");
  }

  /* ---------- Uploading ---------- */

  // Uploads files one by one, with a progress row each in listEl. onEach(item) runs after every success.
  async function uploadFiles(files, folder, listEl, onEach) {
    for (const file of Array.from(files || [])) {
      const row = document.createElement("div");
      row.className = "upload-item";
      row.innerHTML = `<span class="upload-name">${esc(file.name || "Photo")}</span><span data-state>Getting ready...</span><div class="progress"><span></span></div>`;
      listEl.hidden = false;
      listEl.prepend(row);
      const bar = row.querySelector(".progress span");
      const state = row.querySelector("[data-state]");
      try {
        const item = await A.api.upload(file, {
          folder: real(folder),
          onProgress: (p) => {
            bar.style.width = `${p}%`;
            state.textContent = `${p}%`;
          },
        });
        A.upsert("images", item);
        bar.style.width = "100%";
        state.textContent = "Done";
        setTimeout(() => {
          row.remove();
          if (!listEl.children.length) listEl.hidden = true;
        }, 2500);
        if (onEach) onEach(item);
      } catch (err) {
        row.classList.add("is-error");
        state.textContent = err.message || "Upload failed";
        if (err.code === "UNAUTHORIZED" || err.code === "NOT_CONFIGURED") {
          A.fail(err);
          return;
        }
      }
    }
  }

  async function addByLink(folder) {
    const url = await A.prompt({
      title: "Add a photo by link",
      label: "Photo address",
      placeholder: "https://images.unsplash.com/...",
      help: "Paste a link that starts with https://, for example from Unsplash.",
      confirmLabel: "Add photo",
    });
    if (!url) return null;
    try {
      const item = await A.save("images", { url, folder: real(folder) });
      A.toast("Photo added");
      return item;
    } catch (err) {
      A.fail(err);
      return null;
    }
  }

  function chooseFolder(title, confirmLabel) {
    return new Promise((resolve) => {
      const m = A.modal({
        title,
        body: `${A.f.select({ name: "folder", label: "Folder", options: folderOptions(), value: "" })}${A.f.text({ name: "newFolder", label: "Or make a new folder", placeholder: "Folder name, e.g. Trips/Kerala" })}`,
        foot: `<button class="btn btn-light" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-ok>${esc(confirmLabel)}</button>`,
        onClose: (v) => resolve(typeof v === "string" ? v : null),
      });
      m.el.querySelector("[data-ok]").addEventListener("click", () => {
        const typed = S.cleanFolder(m.el.querySelector('[name="newFolder"]').value);
        m.close(typed || m.el.querySelector('[name="folder"]').value);
      });
    });
  }

  /* ---------- One photo ---------- */

  function openPhoto(id, onChange) {
    const im = A.data.images.find((x) => x.id === id);
    if (!im) return;
    const info = [
      ["Source", SOURCES[im.source] || im.source],
      im.source === "cloudinary" ? ["In Cloudinary", where(im.folder)] : null,
      im.width ? ["Size", `${im.width} x ${im.height} pixels`] : null,
      im.bytes ? ["File", `${Math.max(1, Math.round(im.bytes / 1024))} KB`] : null,
      ["Added", U.formatDate(im.createdAt)],
    ].filter(Boolean);
    const m = A.modal({
      title: "Photo details",
      wide: true,
      body: `<div class="photo-detail">
          <div><img src="${esc(SASHA.img.url(im.url, { w: 1200 }))}" alt="${esc(im.alt || "")}"><dl class="kv">${info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
          <form class="stack" data-photo>
            ${A.f.text({ name: "alt", label: "Description", value: im.alt, max: 200, help: "What the photo shows. Read aloud by screen readers." })}
            ${A.f.textarea({ name: "caption", label: "Caption", value: im.caption, rows: 3, max: 400 })}
            ${A.f.text({ name: "credit", label: "Credit", value: im.credit, max: 120, placeholder: "Photographer or source" })}
            ${A.f.select({ name: "folder", label: "Folder", value: im.folder, options: folderOptions() })}
          </form>
        </div>`,
      foot: `<button class="btn btn-ghost push" type="button" data-del>${icon("trash-2", { size: 16 })}Delete</button><button class="btn btn-light" type="button" data-copy>${icon("copy", { size: 16 })}Copy link</button><button class="btn btn-primary" type="button" data-ok data-busy="Saving...">Save</button>`,
    });
    const form = m.el.querySelector("[data-photo]");
    A.wireForm(form);
    m.el.querySelector("[data-ok]").addEventListener("click", (e) =>
      A.busy(e.currentTarget, async () => {
        try {
          const v = A.readForm(form);
          const moved = v.folder !== (im.folder || "");
          const saved = await A.save("images", { id: im.id, alt: v.alt, caption: v.caption, credit: v.credit, folder: v.folder }, im.updatedAt);
          A.toast(moved ? `Photo saved and moved to ${where(saved.folder)}` : "Photo saved");
          m.close(true);
          onChange();
        } catch (err) {
          A.fail(err, form);
        }
      })
    );
    m.el.querySelector("[data-del]").addEventListener("click", async () => {
      const ok = await A.confirm({ title: "Delete this photo?", text: "It leaves the media library. Stories already using it keep showing it.", confirmLabel: "Delete", danger: true });
      if (!ok) return;
      try {
        await A.remove("images", im.id);
        A.toast("Photo deleted");
        m.close(true);
        onChange();
      } catch (err) {
        A.fail(err);
      }
    });
    m.el.querySelector("[data-copy]").addEventListener("click", async () => {
      A.toast((await U.copyText(im.url)) ? "Link copied" : "Couldn't copy the link", "info");
    });
  }

  /* ---------- Library page ---------- */

  function folderButtons(active) {
    const all = alive();
    const btn = (value, label, n, depth, ic, title) =>
      `<button class="folder depth-${depth}${active === value ? " is-active" : ""}" type="button" data-folder="${esc(value)}"${title ? ` title="${esc(title)}"` : ""}>${icon(ic, { size: 16 })}<span>${esc(label)}</span><span class="folder-count">${n}</span></button>`;
    return (
      btn(ALL, "All photos", all.length, 0, "images", "") +
      btn(TOP, ROOT, all.filter((im) => !im.folder).length, 0, "folder", "Photos that aren't in a folder") +
      (A.data.folders || [])
        .map((f) => {
          const parts = f.split("/");
          return btn(f, parts[parts.length - 1], all.filter((im) => im.folder && inside(im.folder, f)).length, Math.min(2, parts.length), "folder", where(f));
        })
        .join("")
    );
  }

  function pathHtml(folder) {
    const trail = [ROOT].concat(real(folder) ? real(folder).split("/") : []).map((p) => `<strong>${esc(p)}</strong>`).join('<span class="sep">/</span>');
    const note = folder === ALL ? "Showing every photo. New uploads go to the top level." : folder === TOP ? "Photos that aren't in a folder. New uploads go here." : "New uploads go here.";
    return `<p class="folder-path">${icon("folder", { size: 16 })}${trail}<span class="sep">&middot;</span><span>${esc(note)}</span></p>`;
  }

  function gridHtml(list, selected) {
    if (!list.length) return `<div class="card">${A.empty({ icon: "images", title: "No photos here", text: "Upload photos, drop them on the box above, or add one by link." })}</div>`;
    return `<div class="media-grid">${list
      .map((im) => {
        const on = selected.has(im.id);
        return `<div class="media-item${on ? " is-selected" : ""}">
          <div class="media-thumb">
            <button class="media-check" type="button" data-select="${esc(im.id)}" aria-pressed="${on}" aria-label="Select this photo">${on ? icon("check", { size: 14 }) : ""}</button>
            <button class="media-open" type="button" data-open="${esc(im.id)}" aria-label="Open ${esc(nameOf(im))}"><img src="${esc(SASHA.img.url(im.url, { w: 320, h: 320 }))}" alt="" loading="lazy"></button>
          </div>
          <span class="media-name">${esc(nameOf(im))}</span>
        </div>`;
      })
      .join("")}</div>`;
  }

  function page(view) {
    let folder = ALL;
    let q = "";
    const selected = new Set();
    view.innerHTML =
      A.head({
        title: "Media library",
        sub: `Uploads go to Cloudinary, inside the <strong>${ROOT}</strong> folder, and are resized for every screen. Folders made here appear in Cloudinary too.`,
        actions: `<button class="btn btn-light" type="button" data-link-add>${icon("link", { size: 18 })}Add by link</button><button class="btn btn-primary" type="button" data-upload-btn>${icon("upload", { size: 18 })}Upload photos</button><input type="file" accept="image/*" multiple hidden data-upload>`,
      }) +
      `<div class="media-layout">
        <aside class="card">
          <div class="card-head"><h2 class="card-title">Folders</h2><button class="icon-btn" type="button" data-folder-new aria-label="New folder" title="New folder">${icon("folder-plus", { size: 18 })}</button></div>
          <div class="folder-list" data-folders></div>
        </aside>
        <div class="stack">
          <div class="list-toolbar">
            <label class="search-input">${icon("search", { size: 16 })}<input class="input" type="search" placeholder="Search photos" data-q aria-label="Search photos"></label>
            <div class="inline-list" data-folder-tools></div>
          </div>
          <div data-path></div>
          <div class="dropzone" data-drop>${icon("cloud-upload", { size: 28 })}<strong>Drop photos here to upload them</strong><span class="help">JPG, PNG, WebP or HEIC. Big photos are made smaller first.</span></div>
          <div class="upload-list" data-uploads hidden></div>
          <div data-grid></div>
          <div class="bulk-bar" data-bulk hidden></div>
        </div>
      </div>`;

    const draw = () => {
      if (!(A.data.folders || []).includes(folder) && folder !== ALL && folder !== TOP) folder = ALL;
      view.querySelector("[data-folders]").innerHTML = folderButtons(folder);
      view.querySelector("[data-path]").innerHTML = pathHtml(folder);
      view.querySelector("[data-grid]").innerHTML = gridHtml(filtered(folder, q), selected);
      view.querySelector("[data-folder-tools]").innerHTML = real(folder)
        ? `<button class="btn btn-light btn-sm" type="button" data-folder-rename>${icon("pencil", { size: 16 })}Rename folder</button><button class="btn btn-ghost btn-sm" type="button" data-folder-delete>${icon("trash-2", { size: 16 })}Delete folder</button>`
        : "";
      const bar = view.querySelector("[data-bulk]");
      bar.hidden = !selected.size;
      bar.innerHTML = selected.size
        ? `<span>${selected.size} selected</span><button class="btn btn-light" type="button" data-bulk-move>${icon("folder", { size: 16 })}Move to folder</button><button class="btn btn-light" type="button" data-bulk-delete data-busy="Deleting...">${icon("trash-2", { size: 16 })}Delete</button><button class="icon-btn" type="button" data-bulk-clear aria-label="Clear the selection">${icon("x", { size: 18 })}</button>`
        : "";
      A.refreshNav();
    };
    draw();

    photoStatus().then((photos) => {
      if (!photos || photos.ok || !view.isConnected) return;
      const note = document.createElement("div");
      note.className = "notice notice-warn";
      note.innerHTML = `${icon("cloud-off", { size: 18 })}<span>${esc(photos.message)}</span>`;
      view.querySelector(".media-layout > .stack").prepend(note);
    });

    const uploads = view.querySelector("[data-uploads]");
    const input = view.querySelector("[data-upload]");
    input.addEventListener("change", () => {
      uploadFiles(input.files, folder, uploads, draw);
      input.value = "";
    });

    const drop = view.querySelector("[data-drop]");
    view.addEventListener("dragover", (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      drop.classList.add("is-over");
    });
    view.addEventListener("dragleave", (e) => {
      if (!view.contains(e.relatedTarget)) drop.classList.remove("is-over");
    });
    view.addEventListener("drop", (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      drop.classList.remove("is-over");
      uploadFiles(e.dataTransfer.files, folder, uploads, draw);
    });
    view.querySelector("[data-q]").addEventListener(
      "input",
      U.debounce((e) => {
        q = e.target.value.trim();
        draw();
      }, 150)
    );

    view.addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      const ds = t.dataset;
      try {
        if (ds.folder !== undefined) {
          folder = ds.folder;
          selected.clear();
          draw();
        } else if (ds.select) {
          if (selected.has(ds.select)) selected.delete(ds.select);
          else selected.add(ds.select);
          draw();
        } else if (ds.open) {
          openPhoto(ds.open, draw);
        } else if (t.hasAttribute("data-upload-btn")) {
          input.click();
        } else if (t.hasAttribute("data-link-add")) {
          if (await addByLink(folder)) draw();
        } else if (t.hasAttribute("data-folder-new")) {
          const parent = real(folder);
          const name = await A.prompt({
            title: "New folder",
            label: "Folder name",
            placeholder: "e.g. Hampi",
            help: `It goes inside ${where(folder)}. Folders can be up to three levels deep.`,
            confirmLabel: "Create folder",
          });
          if (!name) return;
          const full = S.cleanFolder(parent ? `${parent}/${name}` : name);
          const res = await A.api.folders("create", { name: full });
          setFolders(res.folders);
          folder = full;
          A.toast("Folder created");
          draw();
        } else if (t.hasAttribute("data-folder-rename")) {
          const from = folder;
          const parts = from.split("/");
          const typed = await A.prompt({ title: "Rename folder", label: "New name", value: parts[parts.length - 1], confirmLabel: "Rename" });
          if (!typed) return;
          const to = S.cleanFolder(parts.slice(0, -1).concat(typed).join("/"));
          if (!to || to === from) return;
          const res = await A.api.folders("rename", { from, to });
          const cloud = A.data.images.some((im) => im.source === "cloudinary" && im.folder && inside(im.folder, from));
          setFolders(res.folders);
          A.data.images.forEach((im) => {
            if (im.folder && inside(im.folder, from)) im.folder = to + im.folder.slice(from.length);
          });
          folder = to;
          A.toast("Folder renamed");
          syncNote(res.synced, cloud);
          draw();
        } else if (t.hasAttribute("data-folder-delete")) {
          const ok = await A.confirm({ title: `Delete the folder "${folder}"?`, text: "Only empty folders can be deleted. Photos are never touched.", confirmLabel: "Delete folder", danger: true });
          if (!ok) return;
          const res = await A.api.folders("delete", { name: folder });
          setFolders(res.folders);
          folder = ALL;
          A.toast("Folder deleted");
          draw();
        } else if (t.hasAttribute("data-bulk-clear")) {
          selected.clear();
          draw();
        } else if (t.hasAttribute("data-bulk-move")) {
          const target = await chooseFolder(`Move ${U.plural(selected.size, "photo", "photos")}`, "Move");
          if (target === null) return;
          const res = await A.api.moveImages([...selected], target);
          res.images.forEach((im) => A.upsert("images", im));
          selected.clear();
          A.toast(`Moved to ${where(target)}`);
          syncNote(res.synced, res.images.some((im) => im.source === "cloudinary"));
          draw();
        } else if (t.hasAttribute("data-bulk-delete")) {
          const n = selected.size;
          const ok = await A.confirm({ title: `Delete ${U.plural(n, "photo", "photos")}?`, text: "They leave the media library. Stories already using them keep showing them.", confirmLabel: "Delete", danger: true });
          if (!ok) return;
          await A.busy(t, async () => {
            for (const id of [...selected]) {
              await A.remove("images", id);
              selected.delete(id);
            }
          });
          A.toast("Photos deleted");
          draw();
        }
      } catch (err) {
        A.fail(err);
        draw();
      }
    });
  }

  /* ---------- Picker: choose photos from anywhere in the dashboard ---------- */

  function pick(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let folder = ALL;
      let q = "";
      const chosen = new Set();
      const m = A.modal({
        title: o.multiple ? "Choose photos" : "Choose a photo",
        wide: true,
        body: `<div class="list-toolbar">
            <div class="inline-list"><span class="select"><select data-pf aria-label="Folder"></select></span><label class="search-input">${icon("search", { size: 16 })}<input class="input" type="search" placeholder="Search photos" data-pq aria-label="Search photos"></label></div>
            <div class="inline-list"><button class="btn btn-light btn-sm" type="button" data-plink>${icon("link", { size: 16 })}Use a link</button><button class="btn btn-light btn-sm" type="button" data-pup>${icon("upload", { size: 16 })}Upload</button><input type="file" accept="image/*"${o.multiple ? " multiple" : ""} hidden data-pfile></div>
          </div>
          <div class="upload-list" data-puploads hidden></div>
          <div data-pgrid></div>`,
        foot: `<span class="help push" data-pcount></span><button class="btn btn-light" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-pok disabled>${o.multiple ? "Add photos" : "Use this photo"}</button>`,
        onClose: (v) => resolve(v || null),
      });
      const el = m.el;
      const result = () => {
        const items = A.data.images.filter((im) => chosen.has(im.id)).map((im) => ({ url: im.url, alt: im.alt || "", caption: im.caption || "" }));
        return o.multiple ? items : items[0] || null;
      };
      const draw = () => {
        el.querySelector("[data-pf]").innerHTML = [[ALL, "All photos"], [TOP, `${ROOT} (top level)`]]
          .concat((A.data.folders || []).map((f) => [f, where(f)]))
          .map(([v, l]) => `<option value="${esc(v)}"${v === folder ? " selected" : ""}>${esc(l)}</option>`)
          .join("");
        const list = filtered(folder, q);
        el.querySelector("[data-pgrid]").innerHTML = list.length
          ? `<div class="media-grid">${list
              .map((im) => {
                const on = chosen.has(im.id);
                return `<button class="media-item${on ? " is-selected" : ""}" type="button" data-pick-id="${esc(im.id)}" aria-pressed="${on}"><span class="media-thumb">${on ? `<span class="media-check">${icon("check", { size: 14 })}</span>` : ""}<img src="${esc(SASHA.img.url(im.url, { w: 320, h: 320 }))}" alt="" loading="lazy"></span><span class="media-name">${esc(nameOf(im))}</span></button>`;
              })
              .join("")}</div>`
          : A.empty({ icon: "images", title: "No photos here", text: "Upload a photo or use a link." });
        el.querySelector("[data-pok]").disabled = !chosen.size;
        el.querySelector("[data-pcount]").textContent = chosen.size && o.multiple ? `${chosen.size} selected` : "";
      };
      const choose = (id) => {
        if (!o.multiple) chosen.clear();
        chosen.add(id);
      };
      draw();

      el.querySelector("[data-pf]").addEventListener("change", (e) => {
        folder = e.target.value;
        draw();
      });
      el.querySelector("[data-pq]").addEventListener(
        "input",
        U.debounce((e) => {
          q = e.target.value.trim();
          draw();
        }, 150)
      );
      const file = el.querySelector("[data-pfile]");
      file.addEventListener("change", () => {
        uploadFiles(file.files, folder, el.querySelector("[data-puploads]"), (item) => {
          choose(item.id);
          draw();
        });
        file.value = "";
      });
      el.addEventListener("click", async (e) => {
        const t = e.target.closest("button");
        if (!t) return;
        if (t.dataset.pickId) {
          const id = t.dataset.pickId;
          if (chosen.has(id)) chosen.delete(id);
          else choose(id);
          draw();
        } else if (t.hasAttribute("data-pup")) {
          file.click();
        } else if (t.hasAttribute("data-plink")) {
          const item = await addByLink(folder);
          if (!item) return;
          choose(item.id);
          if (!o.multiple) m.close(result());
          else draw();
        } else if (t.hasAttribute("data-pok")) {
          m.close(result());
        }
      });
      el.addEventListener("dblclick", (e) => {
        const t = e.target.closest("[data-pick-id]");
        if (t && !o.multiple) {
          choose(t.dataset.pickId);
          m.close(result());
        }
      });
    });
  }

  A.media = { pick, upload: uploadFiles };

  A.register({
    id: "media",
    label: "Media library",
    icon: "images",
    group: "site",
    order: 6,
    count: () => alive().length,
    render: page,
  });
})();
