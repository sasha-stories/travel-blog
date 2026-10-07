// Sasha Travel Stories: the home page.
(function () {
  "use strict";
  const U = SASHA.util;
  const C = SASHA.content;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  const section = (inner) => `<section class="section"><div class="container">${inner}</div></section>`;

  function hero(site) {
    const s = site.settings;
    const st = site.stats;
    const stat = (n, one, many) => `<span><strong>${n}</strong>${n === 1 ? one : many}</span>`;
    const stats = st.stories
      ? `<p class="hero-stats">${stat(st.stories, "story", "stories")}${stat(st.places, "place", "places")}${st.regions ? stat(st.regions, "region", "regions") : ""}</p>`
      : "";
    return `<section class="hero">
      <div class="container">
        <div class="hero-media torn-bottom">${SASHA.img.tag({ src: s.heroImage, alt: "", widths: [800, 1400, 2000], sizes: "100vw", eager: true })}</div>
        <div class="hero-card paper taped">
          <p class="eyebrow">A travel journal${s.authorName ? ` by ${esc(s.authorName)}` : ""}</p>
          <h1 class="hero-title">${esc(s.heroTitle || s.siteTitle)}</h1>
          ${s.heroSubtitle ? `<p class="hero-text">${esc(s.heroSubtitle)}</p>` : ""}
          <div class="hero-actions">
            <a class="btn btn-primary" href="${esc(C.links.journal())}">${icon("book-open", { size: 18 })}Read the journal</a>
            <a class="btn btn-ghost" href="${esc(C.links.places())}">${icon("map", { size: 18 })}Explore places</a>
          </div>
          ${stats}
        </div>
      </div>
    </section>`;
  }

  function intro(site) {
    const s = site.settings;
    if (!s.authorBio) return "";
    const photo = s.authorPhoto || s.aboutImage;
    return `<section class="section"><div class="container-narrow">
      <div class="intro-note paper reveal${photo ? "" : " no-photo"}">
        ${photo ? SASHA.img.tag({ src: photo, alt: "", widths: [240, 400], sizes: "180px", ratio: [1, 1] }) : ""}
        <div>
          <p class="eyebrow">Hello${s.authorName ? `, I'm ${esc(s.authorName)}` : ""}</p>
          <p class="intro-quote">${esc(s.authorBio)}</p>
          <a class="link-arrow" href="${esc(C.links.about())}">More about me ${icon("arrow-right", { size: 18 })}</a>
        </div>
      </div>
    </div></section>`;
  }

  SITE.boot((site, ctx) => {
    SITE.setTitle("");
    SITE.setDescription(site.settings.tagline);

    if (!site.stories.length) {
      ctx.main.innerHTML = hero(site) + section(SITE.state({ icon: "feather", title: "The first story is on its way", text: "Stories appear here as soon as they are published." }));
      return;
    }

    const featured = site.stories.find((st) => st.featured) || site.stories[0];
    const latest = site.stories.filter((st) => st.id !== featured.id).slice(0, 3);
    const places = site.places.slice().sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 8);
    const picks = site.experiences.filter((e) => e.featured);
    const experiences = (picks.length ? picks : site.experiences).slice(0, 3);

    ctx.main.innerHTML = [
      hero(site),
      section(SITE.featureCard(featured)),
      latest.length
        ? section(SITE.sectionHead({ eyebrow: "Latest", title: "From the journal", href: C.links.journal(), link: "All stories" }) + `<div class="grid grid-3">${latest.map(SITE.storyCard).join("")}</div>`)
        : "",
      places.length
        ? section(
            SITE.sectionHead({ eyebrow: "Places", title: "Where I've been", text: "From temple towns to tea hills. Pick a place for its stories, tips and favourite moments.", href: C.links.places(), link: "All places" }) +
              SITE.scroller(places.map(SITE.placeCard).join(""), "Places")
          )
        : "",
      experiences.length
        ? section(SITE.sectionHead({ eyebrow: "Experiences", title: "Moments worth the journey", href: C.links.experiences(), link: "All experiences" }) + `<div class="grid grid-3">${experiences.map(SITE.expCard).join("")}</div>`)
        : "",
      intro(site),
    ].join("");
  });
})();
