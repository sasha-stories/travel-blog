// Sasha Travel Stories: one story (story.html?slug=...), shown in its theme's colours and its own reading style.
(function () {
  "use strict";
  const U = SASHA.util;
  const C = SASHA.content;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  const slug = SITE.param("slug");
  let ticket = 0;
  let photos = [];
  let current = null;

  /* ---------- Story text ---------- */

  function zoomButton(index, alt, inner) {
    return `<button class="zoom" type="button" data-zoom="${index}" aria-label="View larger photo${alt ? `: ${esc(alt)}` : ""}">${inner}</button>`;
  }

  function imageBlock(b) {
    const size = ["wide", "full"].includes(b.size) ? b.size : "normal";
    const sizes = size === "full" ? "100vw" : size === "wide" ? "(max-width: 1040px) 100vw, 1000px" : "(max-width: 740px) 100vw, 700px";
    const widths = size === "normal" ? [480, 800, 1200] : [800, 1200, 1800];
    const index = photos.push({ src: b.url, alt: b.alt, caption: b.caption }) - 1;
    return `<figure class="story-figure size-${size}">
      ${zoomButton(index, b.alt, SASHA.img.tag({ src: b.url, alt: b.alt, widths, sizes }))}
      ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}
    </figure>`;
  }

  function galleryBlock(b) {
    const items = (Array.isArray(b.images) ? b.images : [])
      .map((im) => {
        const index = photos.push({ src: im.url, alt: im.alt, caption: im.caption || b.caption }) - 1;
        return zoomButton(index, im.alt, SASHA.img.tag({ src: im.url, alt: im.alt, widths: [400, 640, 960], sizes: "(max-width: 700px) 50vw, 330px", ratio: [4, 3] }));
      })
      .join("");
    return items ? `<figure class="story-gallery"><div class="gallery-grid">${items}</div>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>` : "";
  }

  function mapBlock(b) {
    const where = `${b.lat},${b.lng}`;
    const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
    return `<figure class="story-map-wrap">
      <div class="story-map" data-lat="${esc(b.lat)}" data-lng="${esc(b.lng)}" data-zoom="${esc(b.zoom || 12)}" data-label="${esc(b.label || "")}" hidden></div>
      <figcaption class="map-caption"><span>${icon("map-pin", { size: 15 })}${esc(b.label || where)}</span><a href="${esc(google)}" target="_blank" rel="noopener">Open in Google Maps</a></figcaption>
    </figure>`;
  }

  // The first paragraph gets the drop cap; single paragraphs can have their own size and font, chosen in the dashboard.
  function paragraphClass(b, first) {
    const size = b.size === "large" ? "p-large" : b.size === "small" ? "p-small" : "";
    const font = SASHA.schema.READING.font.options.some((o) => o[0] === b.font) ? `p-font-${b.font}` : "";
    return [first ? "lead" : "", size, font].filter(Boolean).join(" ");
  }

  function blocksHtml(blocks) {
    let first = true;
    return (Array.isArray(blocks) ? blocks : [])
      .map((b) => {
        if (!b) return "";
        switch (b.type) {
          case "paragraph": {
            const cls = paragraphClass(b, first);
            first = false;
            return `<p${cls ? ` class="${cls}"` : ""}>${U.inline(b.text)}</p>`;
          }
          case "heading": {
            const tag = Number(b.level) === 3 ? "h3" : "h2";
            return `<${tag} id="${esc(U.slugify(b.text))}">${esc(b.text)}</${tag}>`;
          }
          case "image":
            return b.url ? imageBlock(b) : "";
          case "gallery":
            return galleryBlock(b);
          case "quote":
            return `<blockquote class="story-quote"><p>${U.inline(b.text)}</p>${b.cite ? `&mdash; ${esc(b.cite)}` : ""}</blockquote>`;
          case "tip":
            return `<aside class="story-tip paper taped"><p class="tip-title">${icon("lightbulb", { size: 16 })}${esc(b.title || "Travel note")}</p><div class="tip-body">${U.paragraphs(b.text)}</div></aside>`;
          case "list": {
            const tag = b.style === "number" ? "ol" : "ul";
            const items = (Array.isArray(b.items) ? b.items : []).map((it) => `<li>${U.inline(it)}</li>`).join("");
            return items ? `<${tag} class="story-list">${items}</${tag}>` : "";
          }
          case "divider":
            return '<hr class="story-divider">';
          case "map":
            return mapBlock(b);
          default:
            return "";
        }
      })
      .join("");
  }

  /* ---------- Page pieces ---------- */

  function headHtml(st) {
    const where = st.place
      ? `<a href="${esc(C.links.place(st.place.slug))}">${esc(st.location || st.place.name)}</a>`
      : st.location
        ? `<span>${esc(st.location)}</span>`
        : "";
    const kicker = [SITE.themePill(st.theme), where].filter(Boolean).join('<span class="dot" aria-hidden="true"></span>');
    const trip = st.tripStart ? U.formatRange(st.tripStart, st.tripEnd) : "";
    const meta = [
      trip ? `<span>${icon("calendar", { size: 16 })}${esc(trip)}</span>` : "",
      `<span>${icon("clock", { size: 16 })}${st.readingTime} min read</span>`,
      st.publishedAt ? `<span>${icon("feather", { size: 16 })}Written ${esc(U.formatDate(st.publishedAt))}</span>` : "",
    ].join("");
    return `<header class="story-head container">
        ${kicker ? `<p class="story-kicker">${kicker}</p>` : ""}
        <h1 class="story-title">${esc(st.title)}</h1>
        ${st.subtitle ? `<p class="story-sub">${esc(st.subtitle)}</p>` : ""}
        <p class="story-meta">${meta}</p>
      </header>
      <figure class="story-cover">
        <div class="story-cover-media torn-bottom">${SASHA.img.tag({ src: st.coverImage, alt: st.coverAlt, widths: [800, 1400, 2000], sizes: "(max-width: 1240px) 100vw, 1200px", eager: true })}</div>
      </figure>`;
  }

  function shareHtml(st) {
    const url = location.href.split("#")[0];
    const mail = `mailto:?subject=${encodeURIComponent(st.title)}&body=${encodeURIComponent(`${st.title}\n${url}`)}`;
    return `<div class="share">
      <span class="share-label">Share this story</span>
      ${navigator.share ? `<button type="button" data-share="native" aria-label="Share">${icon("share-2", { size: 18 })}</button>` : ""}
      <a href="${esc(mail)}" aria-label="Share by email">${icon("mail", { size: 18 })}</a>
      <button type="button" data-share="copy" aria-label="Copy the link">${icon("link", { size: 18 })}</button>
      <span class="share-status" role="status"></span>
    </div>`;
  }

  function authorHtml(s) {
    if (!s.authorName && !s.authorBio) return "";
    return `<div class="author-box paper${s.authorPhoto ? "" : " no-photo"}">
      ${s.authorPhoto ? SASHA.img.tag({ src: s.authorPhoto, alt: "", widths: [144], sizes: "72px", ratio: [1, 1] }) : ""}
      <div>
        <p class="eyebrow">Written by</p>
        ${s.authorName ? `<p class="author-name">${esc(s.authorName)}</p>` : ""}
        ${s.authorBio ? `<p class="author-bio">${esc(s.authorBio)}</p>` : ""}
        <a class="link-arrow small" href="${esc(C.links.about())}">More about me ${icon("arrow-right", { size: 16 })}</a>
      </div>
    </div>`;
  }

  function placeHtml(p) {
    if (!p) return "";
    const line = [p.region, p.bestTime ? `Best time: ${p.bestTime}` : ""].filter(Boolean).join(" \u00b7 ");
    return `<a class="place-callout" href="${esc(p.url)}">
      ${SASHA.img.tag({ src: p.coverImage, alt: "", widths: [240, 400], sizes: "120px", ratio: [4, 3] })}
      <div><p class="eyebrow">The place</p><strong>${esc(p.name)}</strong>${line ? `<p>${esc(line)}</p>` : ""}</div>
    </a>`;
  }

  function navHtml(model) {
    if (!model.newer && !model.older) return "";
    const link = (s, cls, label) =>
      s
        ? `<a class="${cls}" href="${esc(s.url)}">${SASHA.img.tag({ src: s.coverImage, alt: "", widths: [200, 320], sizes: "96px", ratio: [4, 3] })}<span><small>${label}</small><strong>${esc(s.title)}</strong></span></a>`
        : "<span></span>";
    return `<nav class="story-nav" aria-label="More stories">${link(model.older, "prev", "Previous story")}${link(model.newer, "next", "Next story")}</nav>`;
  }

  function render(site, model, main) {
    const st = model.story;
    photos = [];
    current = st;
    SITE.applyTheme(st.theme);
    SITE.setTitle(st.title);
    SITE.setDescription(st.excerpt || st.subtitle || site.settings.tagline);
    const body = blocksHtml(st.blocks) || (st.excerpt ? `<p class="lead">${esc(st.excerpt)}</p>` : "");
    const tags = st.tags.length ? `<div class="story-tags">${st.tags.map((t) => `<a class="tag" href="${esc(C.links.journal({ tag: t }))}">#${esc(t)}</a>`).join("")}</div>` : "";
    const nav = navHtml(model);
    const more = st.place ? C.links.experiences({ place: st.place.slug }) : C.links.experiences();
    main.innerHTML = `<div class="read-progress" aria-hidden="true"></div>
      <article class="story-article ${C.readingClass(st.reading)}">
        ${headHtml(st)}
        <div class="story-body">${body}</div>
        <footer class="story-foot">
          ${tags}
          ${shareHtml(st)}
          ${authorHtml(site.settings)}
          ${placeHtml(st.placeDetails)}
        </footer>
      </article>
      ${model.experiences.length ? `<section class="section"><div class="container">${SITE.sectionHead({ eyebrow: "From this trip", title: "Experiences", href: more, link: "See more" })}<div class="grid grid-3">${model.experiences.slice(0, 3).map(SITE.expCard).join("")}</div></div></section>` : ""}
      ${nav ? `<section class="section"><div class="container-narrow">${nav}</div></section>` : ""}
      ${model.related.length ? `<section class="section"><div class="container">${SITE.sectionHead({ eyebrow: "Keep reading", title: "You might also like", href: C.links.journal(), link: "All stories" })}<div class="grid grid-3">${model.related.map(SITE.storyCard).join("")}</div></div></section>` : ""}`;
    drawMaps(main);
  }

  function drawMaps(root) {
    const els = Array.from(root.querySelectorAll(".story-map"));
    if (!els.length) return;
    SITE.loadScript("js/site/map.js").then((ok) => {
      if (!ok || !SASHA.map) return;
      els.forEach((el) => {
        if (!document.body.contains(el)) return;
        el.hidden = false;
        SASHA.map.single(el, { lat: Number(el.dataset.lat), lng: Number(el.dataset.lng), label: el.dataset.label, zoom: Number(el.dataset.zoom) || 12 });
      });
    });
  }

  function notFound(main) {
    SITE.applyTheme(null);
    SITE.setTitle("Story not found");
    main.innerHTML = `<div class="container">${SITE.state({
      icon: "book-open",
      heading: "h1",
      big: true,
      title: "Story not found",
      text: "This story may have been moved or unpublished.",
      action: `<a class="btn btn-primary" href="${esc(C.links.journal())}">Browse the journal</a>`,
    })}</div>`;
  }

  // The photo viewer is only downloaded the first time someone opens a photo.
  function openPhoto(index) {
    if (SASHA.lightbox) {
      SASHA.lightbox.open(photos, index);
      return;
    }
    SITE.loadScript("js/site/lightbox.js").then((ok) => {
      if (ok && SASHA.lightbox) SASHA.lightbox.open(photos, index);
      else if (photos[index]) window.open(photos[index].src, "_blank", "noopener");
    });
  }

  /* ---------- Reading progress bar ---------- */

  let queued = false;

  function progress() {
    queued = false;
    const bar = document.querySelector(".read-progress");
    const body = document.querySelector(".story-body");
    if (!bar || !body) return;
    const rect = body.getBoundingClientRect();
    const total = Math.max(1, rect.height - window.innerHeight * 0.6);
    const done = Math.min(1, Math.max(0, -rect.top / total));
    bar.style.transform = `scaleX(${done})`;
  }

  const onScroll = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(progress);
    }
  };

  /* ---------- Start ---------- */

  SITE.boot((site, ctx) => {
    const main = ctx.main;
    const mine = ++ticket;
    if (!slug) {
      notFound(main);
      return;
    }
    SASHA.store
      .getStory(slug)
      .then((model) => {
        if (mine !== ticket) return;
        if (!model) notFound(main);
        else render(site, model, main);
        SITE.finish(main);
        progress();
        const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) target.scrollIntoView();
      })
      .catch((err) => {
        if (mine !== ticket) return;
        main.innerHTML = `<div class="container">${SITE.state({
          icon: "cloud-off",
          title: "This story couldn't be opened",
          text: err.message,
          action: '<button class="btn btn-primary" type="button" data-action="retry">Try again</button>',
        })}</div>`;
        SITE.finish(main);
      });

    ctx.once("events", () => {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      main.addEventListener("click", async (e) => {
        const zoom = e.target.closest("[data-zoom]");
        if (zoom) {
          openPhoto(Number(zoom.dataset.zoom));
          return;
        }
        const share = e.target.closest("[data-share]");
        if (!share || !current) return;
        const url = location.href.split("#")[0];
        const status = main.querySelector(".share-status");
        if (share.dataset.share === "native") {
          try {
            await navigator.share({ title: current.title, text: current.excerpt || current.subtitle || "", url });
          } catch (err) {
            console.warn("[Sasha] Sharing was closed:", err.message);
          }
        } else if (share.dataset.share === "copy") {
          const ok = await U.copyText(url);
          if (status) {
            status.textContent = ok ? "Link copied" : "Couldn't copy. Copy it from the address bar.";
            setTimeout(() => {
              status.textContent = "";
            }, 2500);
          }
        }
      });
    });
  });
})();
