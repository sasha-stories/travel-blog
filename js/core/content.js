// Sasha Travel Stories: what the public pages show (SASHA.content). Turns sheet rows into page data, and themes into colours.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const U = SASHA.util;
  const S = SASHA.schema;

  /* ---------- Page links: index.html sits at the top level, every other page in html/ ---------- */

  const PATHS = {
    home: () => "",
    journal: (params) => `html/journal.html${U.query(params)}`,
    story: (slug) => `html/story.html${U.query({ slug })}`,
    places: (params) => `html/places.html${U.query(params)}`,
    place: (slug) => `html/places.html${U.query({ place: slug })}`,
    experiences: (params) => `html/experiences.html${U.query(params)}`,
    about: () => "html/about.html",
    search: (q) => `html/search.html${U.query({ q })}`,
    admin: () => "html/admin.html",
  };

  const links = {};
  Object.keys(PATHS).forEach((name) => {
    links[name] = (...args) => U.root + PATHS[name](...args);
  });

  const bySort = (a, b) =>
    (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));
  const newest = (key) => (a, b) => String(b[key] || "").localeCompare(String(a[key] || ""));
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  // Live means published with its publish time passed, so stories can be scheduled.
  const isLive = (story, at = U.nowIso()) => Boolean(story) && story.status === "published" && (!story.publishedAt || story.publishedAt <= at);

  /* ---------- Themes ---------- */

  function themeColours(theme) {
    const look = S.lookOf(theme && theme.look);
    return { look, accent: U.hexColor(theme && theme.accent) || look.accent, tint: U.hexColor(theme && theme.tint) || look.tint };
  }

  // The colour variables a theme gives a page, all worked out from its accent and background colours.
  function themeVars(theme) {
    const { accent, tint } = themeColours(theme);
    return {
      "--accent": accent,
      "--accent-dark": U.mix(accent, "#000000", 0.78),
      "--accent-soft": U.mix(accent, "#ffffff", 0.14),
      "--paper": tint,
      "--paper-2": U.mix(tint, "#ffffff", 0.5),
      "--paper-3": U.mix(accent, tint, 0.07),
      "--card": U.mix(tint, "#ffffff", 0.25),
      "--line": U.mix(accent, tint, 0.17),
      "--line-2": U.mix(accent, tint, 0.09),
      "--ink": U.mix(accent, "#24211e", 0.18),
      "--ink-2": U.mix(accent, "#4a423a", 0.15),
      "--muted": U.mix(accent, "#6d6359", 0.2),
      "--tape": `${U.mix(accent, tint, 0.22)}d1`,
    };
  }

  const themeStyle = (theme) =>
    Object.entries(themeVars(theme))
      .map(([key, value]) => `${key}:${value}`)
      .join(";");

  function themeCard(t, count) {
    const { look, accent, tint } = themeColours(t);
    return {
      id: t.id || "",
      slug: t.slug || "",
      name: t.name || "Untitled theme",
      description: t.description || "",
      look: look.key,
      icon: look.icon,
      accent,
      tint,
      soft: U.mix(accent, "#ffffff", 0.14),
      url: links.journal({ theme: t.slug }),
      count: count || 0,
    };
  }

  const readingClass = (story) => {
    const r = S.readingStyle(story);
    return `text-${r.textSize} font-${r.font} space-${r.spacing}`;
  };

  /* ---------- Cards ---------- */

  function storyCard(st, ctx) {
    const place = ctx.placeById.get(st.placeId);
    return {
      id: st.id,
      slug: st.slug,
      url: links.story(st.slug),
      title: st.title || "Untitled",
      subtitle: st.subtitle || "",
      excerpt: st.excerpt || "",
      coverImage: st.coverImage || "",
      coverAlt: st.coverAlt || st.title || "",
      location: st.location || (place ? place.name : ""),
      theme: ctx.themeBySlug.get(st.theme) || null,
      place: place ? { id: place.id, slug: place.slug, name: place.name, region: place.region } : null,
      tags: Array.isArray(st.tags) ? st.tags : [],
      tripStart: st.tripStart || "",
      tripEnd: st.tripEnd || "",
      publishedAt: st.publishedAt || "",
      readingTime: st.readingTime || U.readingTime(st.blocks),
      featured: Boolean(st.featured),
      searchText: st.searchText || U.plainText(st.blocks).slice(0, 600),
    };
  }

  function placeCard(p, ctx) {
    return {
      id: p.id,
      slug: p.slug,
      url: links.place(p.slug),
      name: p.name || "Untitled place",
      region: p.region || "",
      country: p.country || "",
      summary: p.summary || "",
      description: p.description || "",
      coverImage: p.coverImage || "",
      coverAlt: p.coverAlt || p.name || "",
      lat: num(p.lat),
      lng: num(p.lng),
      bestTime: p.bestTime || "",
      visitedOn: p.visitedOn || "",
      tags: Array.isArray(p.tags) ? p.tags : [],
      featured: Boolean(p.featured),
      stories: ctx.live.filter((s) => s.placeId === p.id).map((s) => s.slug),
      experienceCount: ctx.experiences.filter((e) => e.placeId === p.id).length,
    };
  }

  function experienceCard(e, ctx) {
    const place = ctx.placeById.get(e.placeId);
    return {
      id: e.id,
      slug: e.slug,
      title: e.title || "Untitled",
      kind: e.kind || "",
      summary: e.summary || "",
      image: e.image || "",
      imageAlt: e.imageAlt || e.title || "",
      date: e.date || "",
      rating: U.clampInt(e.rating, 0, 5, 0),
      duration: e.duration || "",
      cost: e.cost || "",
      storySlug: ctx.liveSlugs.has(e.storySlug) ? e.storySlug : "",
      link: e.link || "",
      featured: Boolean(e.featured),
      placeId: place ? place.id : "",
      place: place ? { slug: place.slug, name: place.name, region: place.region } : null,
    };
  }

  /* ---------- Everything the public pages need (story text excluded) ---------- */

  function site(raw) {
    const data = S.normalizeData(raw);
    const at = U.nowIso();
    const live = data.stories.filter((s) => isLive(s, at)).sort(newest("publishedAt"));
    const themes = data.themes
      .filter((t) => t.status === "active")
      .sort(bySort)
      .map((t) => themeCard(t, live.filter((s) => s.theme === t.slug).length));
    const places = data.places.filter((p) => p.status === "published").sort(bySort);
    const experiences = data.experiences
      .filter((e) => e.status === "published")
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(b.date || "").localeCompare(String(a.date || "")));
    const ctx = {
      themeBySlug: new Map(themes.map((t) => [t.slug, t])),
      placeById: new Map(places.map((p) => [p.id, p])),
      liveSlugs: new Set(live.map((s) => s.slug)),
      live,
      experiences,
    };
    const stories = live.map((s) => storyCard(s, ctx));
    return {
      generatedAt: at,
      settings: data.settings,
      themes,
      stories,
      places: places.map((p) => placeCard(p, ctx)),
      experiences: experiences.map((e) => experienceCard(e, ctx)),
      stats: {
        stories: stories.length,
        places: places.length,
        experiences: experiences.length,
        regions: new Set(places.map((p) => p.region).filter(Boolean)).size,
      },
    };
  }

  /* ---------- One story page: the story, its text, related stories, newer and older ---------- */

  function story(siteModel, record) {
    if (!siteModel || !record || !isLive(record)) return null;
    const index = siteModel.stories.findIndex((s) => s.slug === record.slug);
    if (index === -1) return null;
    const card = siteModel.stories[index];
    const placeDetails = card.place ? siteModel.places.find((p) => p.id === card.place.id) || null : null;
    const related = siteModel.stories
      .filter((s) => s.id !== card.id)
      .map((s) => ({
        s,
        score:
          (s.theme && card.theme && s.theme.slug === card.theme.slug ? 2 : 0) +
          (s.place && card.place && s.place.id === card.place.id ? 3 : 0) +
          s.tags.filter((t) => card.tags.includes(t)).length,
      }))
      .sort((a, b) => b.score - a.score || String(b.s.publishedAt).localeCompare(String(a.s.publishedAt)))
      .slice(0, 3)
      .map((r) => r.s);
    const experiences = siteModel.experiences.filter((e) => e.storySlug === card.slug || (card.place && e.placeId === card.place.id)).slice(0, 4);
    const brief = (s) => (s ? { slug: s.slug, url: s.url, title: s.title, coverImage: s.coverImage, coverAlt: s.coverAlt } : null);
    return {
      story: Object.assign({}, card, {
        blocks: Array.isArray(record.blocks) ? record.blocks : [],
        reading: S.readingStyle(record),
        updatedAt: record.updatedAt || "",
        placeDetails,
      }),
      related,
      experiences,
      newer: brief(siteModel.stories[index - 1]),
      older: brief(siteModel.stories[index + 1]),
    };
  }

  /* ---------- Search ---------- */

  const norm = (value) =>
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // Every word must appear somewhere; title matches count most, and the start of a word a little extra.
  function score(fields, words) {
    let total = 0;
    for (const w of words) {
      let best = 0;
      for (const [text, weight] of fields) {
        if (!text) continue;
        const at = text.indexOf(w);
        if (at === -1) continue;
        const wordStart = at === 0 || text[at - 1] === " ";
        best = Math.max(best, weight * (wordStart ? 1.5 : 1));
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  function search(siteModel, q) {
    const words = norm(q).split(" ").filter(Boolean).slice(0, 8);
    const result = { query: String(q || ""), stories: [], places: [], experiences: [], total: 0 };
    if (!siteModel || !words.length) return result;
    const rank = (items, fieldsOf) =>
      items
        .map((item) => ({ item, s: score(fieldsOf(item), words) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.item);
    result.stories = rank(siteModel.stories, (s) => [
      [norm(s.title), 6],
      [norm(s.subtitle), 3],
      [norm(s.location), 4],
      [norm(s.place && s.place.name), 4],
      [norm(s.theme && s.theme.name), 3],
      [norm(s.tags.join(" ")), 3],
      [norm(s.excerpt), 2],
      [norm(s.searchText), 1],
    ]);
    result.places = rank(siteModel.places, (p) => [
      [norm(p.name), 6],
      [norm(p.region), 4],
      [norm(p.country), 2],
      [norm(p.tags.join(" ")), 3],
      [norm(p.summary), 2],
      [norm(p.description), 1],
    ]);
    result.experiences = rank(siteModel.experiences, (e) => [
      [norm(e.title), 6],
      [norm(e.kind), 3],
      [norm(e.place && e.place.name), 4],
      [norm(e.summary), 2],
    ]);
    result.total = result.stories.length + result.places.length + result.experiences.length;
    return result;
  }

  /* ---------- Timeline: stories grouped by the year of the trip ---------- */

  function timeline(siteModel) {
    const groups = new Map();
    siteModel.stories.forEach((s) => {
      const p = U.dateParts(s.tripStart || s.publishedAt);
      const year = p ? p.y : 0;
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(s);
    });
    const when = (s) => String(s.tripStart || s.publishedAt || "");
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, stories]) => ({ year, stories: stories.sort((a, b) => when(b).localeCompare(when(a))) }));
  }

  /* ---------- sitemap.xml, made in the dashboard and uploaded with the site ---------- */

  function sitemapXml(siteModel, baseUrl) {
    const base = String(baseUrl || "").trim().replace(/\/*$/, "/");
    const entry = (path, lastmod) => `  <url><loc>${U.esc(base + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
    const urls = [PATHS.home(), PATHS.journal(), PATHS.places(), PATHS.experiences(), PATHS.about()].map((p) => entry(p));
    siteModel.stories.forEach((s) => urls.push(entry(PATHS.story(s.slug), String(s.publishedAt || "").slice(0, 10))));
    siteModel.places.forEach((p) => urls.push(entry(PATHS.place(p.slug))));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }

  SASHA.content = {
    links,
    isLive,
    themeVars,
    themeStyle,
    themeCard,
    readingClass,
    site,
    story,
    search,
    timeline,
    sitemapXml,
    norm,
    findPlace: (siteModel, slug) => (siteModel ? siteModel.places.find((p) => p.slug === slug) || null : null),
    findTheme: (siteModel, slug) => (siteModel ? siteModel.themes.find((t) => t.slug === slug) || null : null),
  };
})();
