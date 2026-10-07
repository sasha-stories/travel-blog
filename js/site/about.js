// Sasha Travel Stories: the about page; its words and photo come from Settings in the dashboard.
(function () {
  "use strict";
  const U = SASHA.util;
  const C = SASHA.content;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  SITE.boot((site, ctx) => {
    const s = site.settings;
    const st = site.stats;
    SITE.setTitle("About");
    SITE.setDescription(s.authorBio || s.tagline);
    const photo = s.aboutImage || s.authorPhoto;
    const contact = [
      s.email && `<a class="btn btn-primary" href="mailto:${esc(s.email)}">${icon("mail", { size: 18 })}Write to me</a>`,
      s.instagramUrl && `<a class="btn btn-light" href="${esc(s.instagramUrl)}" target="_blank" rel="noopener">${icon("instagram", { size: 18 })}Instagram</a>`,
      s.youtubeUrl && `<a class="btn btn-light" href="${esc(s.youtubeUrl)}" target="_blank" rel="noopener">${icon("youtube", { size: 18 })}YouTube</a>`,
      `<a class="btn btn-ghost" href="${esc(C.links.journal())}">${icon("book-open", { size: 18 })}Read the journal</a>`,
    ]
      .filter(Boolean)
      .join("");
    const stats = [
      [st.stories, "stories written"],
      [st.places, "places visited"],
      [st.experiences, "favourite experiences"],
    ];
    const latest = site.stories.slice(0, 3);

    ctx.main.innerHTML = `<section class="about"><div class="container about-grid">
        ${photo ? `<figure class="polaroid">${SASHA.img.tag({ src: photo, alt: "", widths: [480, 720, 1000], sizes: "(max-width: 860px) 90vw, 420px", ratio: [4, 5], eager: true })}${s.authorName ? `<figcaption>${esc(s.authorName)}</figcaption>` : ""}</figure>` : "<div></div>"}
        <div class="about-body">
          <p class="eyebrow">About</p>
          <h1 class="page-title">${esc(s.aboutTitle || "About")}</h1>
          <div class="prose">${U.paragraphs(s.aboutBody)}</div>
          <ul class="stats">${stats.map(([n, label]) => `<li><span class="stat-num">${n}</span><span class="stat-label">${esc(label)}</span></li>`).join("")}</ul>
          <div class="contact">${contact}</div>
        </div>
      </div></section>
      ${latest.length ? `<section class="section"><div class="container">${SITE.sectionHead({ eyebrow: "Start here", title: "Recent stories", href: C.links.journal(), link: "All stories" })}<div class="grid grid-3">${latest.map(SITE.storyCard).join("")}</div></div></section>` : ""}`;
  });
})();
