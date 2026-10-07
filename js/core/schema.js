// Sasha Travel Stories: content rules (SASHA.schema). Sasha Blog Bridge.gs repeats them, so the sheet only ever gets clean data.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const U = SASHA.util;

  class ValidationError extends Error {
    constructor(field, message) {
      super(message);
      this.name = "ValidationError";
      this.code = "INVALID";
      this.field = field;
    }
  }

  const invalid = (field, message) => {
    throw new ValidationError(field, message);
  };
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

  const PUBLISH = ["draft", "published", "deleted"];
  const BLOCK_TYPES = ["paragraph", "heading", "image", "gallery", "quote", "tip", "list", "divider", "map"];
  const IMAGE_SIZES = ["normal", "wide", "full"];
  const PARAGRAPH_SIZES = ["large", "small"];
  // Suggestions in the dashboard; any short label is allowed.
  const EXPERIENCE_KINDS = ["Food", "Stay", "Trek", "Walk", "Culture", "Nature", "Adventure", "Festival", "Journey", "Shopping"];

  /* ---------- Themes and reading style ---------- */

  // Every theme starts from a look: an icon and two colours. Sasha Blog Bridge.gs has the same colours.
  const LOOKS = {
    journal: { label: "Journal", icon: "feather", accent: "#a4532f", tint: "#f7f2e8" },
    snow: { label: "Snow", icon: "snowflake", accent: "#3d6e98", tint: "#eef3f8" },
    mountain: { label: "Mountain", icon: "mountain", accent: "#4e6a5b", tint: "#eef1ec" },
    forest: { label: "Forest", icon: "tree-pine", accent: "#47773f", tint: "#edf4e9" },
    coast: { label: "Coast", icon: "waves", accent: "#2b7884", tint: "#ebf4f3" },
    desert: { label: "Desert", icon: "sun", accent: "#b0612b", tint: "#f8eddd" },
    heritage: { label: "Heritage", icon: "landmark", accent: "#93573a", tint: "#f5ece2" },
    blossom: { label: "Blossom", icon: "flower", accent: "#b0546d", tint: "#f9edf0" },
    dusk: { label: "Dusk", icon: "moon", accent: "#74588a", tint: "#f2eef7" },
    spice: { label: "Spice", icon: "flame", accent: "#a96f1f", tint: "#faf1df" },
  };

  function lookOf(key) {
    const k = has(LOOKS, key) ? key : "journal";
    return Object.assign({ key: k }, LOOKS[k]);
  }

  // Each choice is [value, label]; the fallback is used when nothing valid is set.
  const READING = {
    textSize: { label: "Text size", fallback: "normal", options: [["small", "Small"], ["normal", "Normal"], ["large", "Large"], ["xlarge", "Extra large"]] },
    font: { label: "Story font", fallback: "modern", options: [["modern", "Modern sans-serif"], ["book", "Book serif"], ["classic", "Classic serif"]] },
    spacing: { label: "Line spacing", fallback: "comfortable", options: [["compact", "Compact"], ["comfortable", "Comfortable"], ["airy", "Airy"]] },
  };

  function readingStyle(x) {
    const out = {};
    Object.keys(READING).forEach((key) => {
      const def = READING[key];
      out[key] = pick(x && x[key], def.options.map((o) => o[0]), def.fallback);
    });
    return out;
  }

  /* ---------- Links ---------- */

  function cleanUrl(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw);
      return u.protocol === "https:" ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  // Like cleanUrl, but complains instead of quietly dropping a bad link.
  function urlField(x, key, message) {
    const raw = String(x[key] ?? "").trim();
    const url = cleanUrl(raw);
    if (raw && !url) invalid(key, message);
    return url;
  }

  function guessSource(url) {
    if (/^https:\/\/res\.cloudinary\.com\//i.test(url)) return "cloudinary";
    if (/^https:\/\/images\.unsplash\.com\//i.test(url)) return "unsplash";
    return "link";
  }

  /* ---------- Story blocks ---------- */

  function cleanBlock(b) {
    if (!b || typeof b !== "object") return null;
    switch (b.type) {
      case "paragraph": {
        const text = U.multiLine(b.text, 6000);
        if (!text) return null;
        const p = { type: "paragraph", text };
        if (PARAGRAPH_SIZES.includes(b.size)) p.size = b.size;
        if (READING.font.options.some((o) => o[0] === b.font)) p.font = b.font;
        return p;
      }
      case "heading": {
        const text = U.oneLine(b.text, 160);
        return text ? { type: "heading", text, level: Number(b.level) === 3 ? 3 : 2 } : null;
      }
      case "image": {
        const url = cleanUrl(b.url);
        return url ? { type: "image", url, alt: U.oneLine(b.alt, 200), caption: U.oneLine(b.caption, 300), size: pick(b.size, IMAGE_SIZES, "normal") } : null;
      }
      case "gallery": {
        const images = (Array.isArray(b.images) ? b.images : [])
          .map((i) => ({ url: cleanUrl(i && i.url), alt: U.oneLine(i && i.alt, 200), caption: U.oneLine(i && i.caption, 300) }))
          .filter((i) => i.url)
          .slice(0, 24);
        return images.length ? { type: "gallery", images, caption: U.oneLine(b.caption, 300) } : null;
      }
      case "quote": {
        const text = U.multiLine(b.text, 1000);
        return text ? { type: "quote", text, cite: U.oneLine(b.cite, 120) } : null;
      }
      case "tip": {
        const text = U.multiLine(b.text, 2000);
        return text ? { type: "tip", title: U.oneLine(b.title, 80) || "Travel note", text } : null;
      }
      case "list": {
        const items = (Array.isArray(b.items) ? b.items : String(b.items ?? "").split("\n"))
          .map((i) => U.oneLine(i, 400))
          .filter(Boolean)
          .slice(0, 60);
        return items.length ? { type: "list", style: b.style === "number" ? "number" : "bullet", items } : null;
      }
      case "divider":
        return { type: "divider" };
      case "map": {
        const lat = U.coord(b.lat, -90, 90);
        const lng = U.coord(b.lng, -180, 180);
        return lat !== null && lng !== null ? { type: "map", lat, lng, label: U.oneLine(b.label, 120), zoom: U.clampInt(b.zoom, 3, 18, 12) } : null;
      }
      default:
        return null;
    }
  }

  const cleanBlocks = (blocks) => (Array.isArray(blocks) ? blocks : []).slice(0, 250).map(cleanBlock).filter(Boolean);

  // Media library folders: letters, numbers, spaces, - and _, up to three levels ("Trips/Hampi").
  function cleanFolder(value) {
    return String(value ?? "")
      .split("/")
      .map((part) => part.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("/")
      .slice(0, 80);
  }

  /* ---------- Each collection ---------- */

  const NORMALIZE = {
    stories(x) {
      const r = {
        slug: U.slugify(x.slug),
        title: U.oneLine(x.title, 140),
        subtitle: U.oneLine(x.subtitle, 200),
        excerpt: U.multiLine(x.excerpt, 400),
        coverImage: urlField(x, "coverImage", "The cover photo link must start with https://"),
        coverAlt: U.oneLine(x.coverAlt, 200),
        location: U.oneLine(x.location, 120),
        placeId: U.oneLine(x.placeId, 60),
        theme: U.slugify(x.theme),
        tags: U.tagList(x.tags),
        tripStart: U.day(x.tripStart),
        tripEnd: U.day(x.tripEnd),
        ...readingStyle(x),
        featured: U.bool(x.featured),
        status: pick(x.status, PUBLISH, "draft"),
        publishedAt: U.stamp(x.publishedAt),
        blocks: cleanBlocks(x.blocks),
      };
      if (!r.title) invalid("title", "Give the story a title.");
      if (r.tripStart && r.tripEnd && r.tripEnd < r.tripStart) invalid("tripEnd", "The trip can't end before it starts.");
      if (r.status === "published" && !r.coverImage) invalid("coverImage", "Add a cover photo before publishing.");
      if (JSON.stringify(r.blocks).length > 48000) {
        invalid("blocks", "This story is too long for one Google Sheets cell (about 50,000 characters). Split it into two stories.");
      }
      return r;
    },

    places(x) {
      const r = {
        slug: U.slugify(x.slug),
        name: U.oneLine(x.name, 120),
        region: U.oneLine(x.region, 80),
        country: U.oneLine(x.country, 60) || "India",
        summary: U.multiLine(x.summary, 400),
        description: U.multiLine(x.description, 6000),
        coverImage: urlField(x, "coverImage", "The cover photo link must start with https://"),
        coverAlt: U.oneLine(x.coverAlt, 200),
        lat: U.coord(x.lat, -90, 90),
        lng: U.coord(x.lng, -180, 180),
        bestTime: U.oneLine(x.bestTime, 80),
        visitedOn: U.month(x.visitedOn),
        tags: U.tagList(x.tags),
        featured: U.bool(x.featured),
        status: pick(x.status, PUBLISH, "draft"),
        sortOrder: U.clampInt(x.sortOrder, 0, 9999, 0),
      };
      if (!r.name) invalid("name", "Give the place a name.");
      if ((r.lat === null) !== (r.lng === null)) invalid("lat", "Add both latitude and longitude, or leave both empty.");
      return r;
    },

    experiences(x) {
      const r = {
        slug: U.slugify(x.slug),
        title: U.oneLine(x.title, 140),
        kind: U.oneLine(x.kind, 40),
        placeId: U.oneLine(x.placeId, 60),
        summary: U.multiLine(x.summary, 400),
        image: urlField(x, "image", "The photo link must start with https://"),
        imageAlt: U.oneLine(x.imageAlt, 200),
        date: U.day(x.date),
        rating: U.clampInt(x.rating, 0, 5, 0),
        duration: U.oneLine(x.duration, 60),
        cost: U.oneLine(x.cost, 40),
        storySlug: U.slugify(x.storySlug),
        link: urlField(x, "link", "The link must start with https://"),
        featured: U.bool(x.featured),
        status: pick(x.status, PUBLISH, "draft"),
        sortOrder: U.clampInt(x.sortOrder, 0, 9999, 0),
      };
      if (!r.title) invalid("title", "Give the experience a title.");
      return r;
    },

    themes(x) {
      const look = lookOf(x.look);
      const r = {
        slug: U.slugify(x.slug),
        name: U.oneLine(x.name, 60),
        description: U.multiLine(x.description, 300),
        look: look.key,
        accent: U.hexColor(x.accent) || look.accent,
        tint: U.hexColor(x.tint) || look.tint,
        sortOrder: U.clampInt(x.sortOrder, 0, 9999, 0),
        status: pick(x.status, ["active", "hidden", "deleted"], "active"),
      };
      if (!r.name) invalid("name", "Give the theme a name.");
      return r;
    },

    images(x) {
      const url = urlField(x, "url", "Add a photo link that starts with https://");
      if (!url) invalid("url", "Add a photo link that starts with https://");
      return {
        url,
        publicId: U.oneLine(x.publicId, 200),
        folder: cleanFolder(x.folder),
        alt: U.oneLine(x.alt, 200),
        caption: U.multiLine(x.caption, 400),
        credit: U.oneLine(x.credit, 120),
        width: U.clampInt(x.width, 0, 100000, 0),
        height: U.clampInt(x.height, 0, 100000, 0),
        bytes: U.clampInt(x.bytes, 0, 10000000000, 0),
        source: pick(x.source, ["cloudinary", "unsplash", "link"], guessSource(url)),
        status: pick(x.status, ["active", "deleted"], "active"),
      };
    },
  };

  function normalize(collection, input) {
    if (!has(NORMALIZE, collection)) invalid("collection", "Unknown section.");
    return NORMALIZE[collection](input || {});
  }

  /* ---------- Site settings: the Settings tab, one Key and Value per row ---------- */

  const SETTINGS = [
    { key: "siteTitle", label: "Site name", max: 80 },
    { key: "tagline", label: "Tagline", max: 160 },
    { key: "footerNote", label: "Footer note", max: 160 },
    { key: "authorName", label: "Your name", max: 60 },
    { key: "authorBio", label: "Short bio", type: "text", max: 400 },
    { key: "authorPhoto", label: "Your photo", type: "image" },
    { key: "heroTitle", label: "Headline", max: 120 },
    { key: "heroSubtitle", label: "Intro", type: "text", max: 320 },
    { key: "heroImage", label: "Big photo", type: "image" },
    { key: "aboutTitle", label: "Page title", max: 100 },
    { key: "aboutBody", label: "Page text", type: "text", max: 5000 },
    { key: "aboutImage", label: "Page photo", type: "image" },
    { key: "email", label: "Email", type: "email" },
    { key: "instagramUrl", label: "Instagram link", type: "url" },
    { key: "youtubeUrl", label: "YouTube link", type: "url" },
    { key: "mediaFolders", label: "Media folders", type: "json", private: true },
  ];

  const DEFAULT_SETTINGS = {
    siteTitle: "Sasha Travel Stories",
    tagline: "Slow journeys across India, written down before they fade.",
    footerNote: "Written slowly, one journey at a time.",
    authorName: "Sasha",
    authorBio: "I travel slowly, mostly by train and bus, and write about the places that stay with me long after I've left.",
    authorPhoto: "",
    heroTitle: "Notes from the road, kept like a journal.",
    heroSubtitle: "Stories, places and small moments from my travels across India, from Himalayan villages to temple towns and quiet coastlines.",
    heroImage: "",
    aboutTitle: "Hello, I'm Sasha",
    aboutBody:
      "This blog started as a paper notebook: train tickets taped between the pages, recipes scribbled in the margins and far too many sunsets described in far too many words.\n\nI travel slowly, usually for a few days at a time, and I write about the places that stay with me. Expect long walks, small towns, good food, honest tips and the occasional over-ambitious sunrise hike.\n\nIf a story here helps you plan a trip, or simply makes you want to go somewhere, it has done its job.",
    aboutImage: "",
    email: "",
    instagramUrl: "",
    youtubeUrl: "",
    mediaFolders: [],
  };

  function normalizeSettings(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const out = {};
    SETTINGS.forEach((def) => {
      const v = s[def.key];
      if (def.type === "json") out[def.key] = Array.isArray(v) ? v.map(cleanFolder).filter(Boolean) : [];
      else out[def.key] = v === undefined || v === null ? DEFAULT_SETTINGS[def.key] : String(v);
    });
    return out;
  }

  // Cleans only the keys present in values, and throws a ValidationError on bad input.
  function cleanSettings(values) {
    const v = values || {};
    const out = {};
    SETTINGS.forEach((def) => {
      if (def.private || !has(v, def.key)) return;
      const raw = v[def.key];
      if (def.type === "image" || def.type === "url") {
        const text = String(raw ?? "").trim();
        const url = cleanUrl(text);
        if (text && !url) invalid(def.key, `${def.label}: the link must start with https://`);
        out[def.key] = url;
      } else if (def.type === "email") {
        const email = U.oneLine(raw, 120);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid(def.key, "That email address doesn't look right.");
        out[def.key] = email;
      } else if (def.type === "text") {
        out[def.key] = U.multiLine(raw, def.max || 2000);
      } else {
        out[def.key] = U.oneLine(raw, def.max || 200);
      }
    });
    if (has(out, "siteTitle") && !out.siteTitle) invalid("siteTitle", "The blog needs a name.");
    return out;
  }

  /* ---------- Everything together ---------- */

  function listFolders(data) {
    const set = new Set();
    ((data.settings && data.settings.mediaFolders) || []).forEach((f) => {
      const clean = cleanFolder(f);
      if (clean) set.add(clean);
    });
    (data.images || []).forEach((im) => {
      if (im.status !== "deleted" && im.folder) set.add(im.folder);
    });
    [...set].forEach((f) => {
      const parts = f.split("/");
      for (let i = 1; i < parts.length; i += 1) set.add(parts.slice(0, i).join("/"));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // Makes sure every list exists and the settings have defaults. Rows themselves are kept as they are.
  function normalizeData(raw) {
    const d = raw && typeof raw === "object" ? raw : {};
    const list = (v) => (Array.isArray(v) ? v.filter((r) => r && typeof r === "object") : []);
    return {
      settings: normalizeSettings(d.settings),
      themes: list(d.themes),
      stories: list(d.stories),
      places: list(d.places),
      experiences: list(d.experiences),
      images: list(d.images),
    };
  }

  SASHA.schema = {
    ValidationError,
    BLOCK_TYPES,
    IMAGE_SIZES,
    PARAGRAPH_SIZES,
    EXPERIENCE_KINDS,
    LOOKS,
    lookOf,
    READING,
    readingStyle,
    SETTINGS,
    DEFAULT_SETTINGS,
    cleanUrl,
    cleanBlocks,
    cleanFolder,
    normalize,
    normalizeSettings,
    cleanSettings,
    listFolders,
    normalizeData,
  };
})();
