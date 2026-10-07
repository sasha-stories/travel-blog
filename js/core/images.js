// Sasha Travel Stories: photos (SASHA.img). Cloudinary and Unsplash photos are resized on the fly, so phones never download huge files.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const esc = SASHA.util.esc;

  const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;
  const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;
  const transformable = (src) => CLOUDINARY.test(src || "") || UNSPLASH.test(src || "");

  // Shown when a photo is missing or fails to load.
  const PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#ece4d6"/><path d="M118 214l58-74 40 46 28-30 58 58z" fill="#ddd2bf"/><circle cx="262" cy="112" r="16" fill="#ddd2bf"/></svg>'
    );

  // A resized link. Width and height together crop to fill; one of them only limits the size.
  function url(src, opts = {}) {
    if (!src) return "";
    if (CLOUDINARY.test(src)) {
      const t = [opts.format ? `f_${opts.format}` : "f_auto", "q_auto"];
      if (opts.w) t.push(`w_${Math.round(opts.w)}`);
      if (opts.h) t.push(`h_${Math.round(opts.h)}`);
      if (opts.w && opts.h) t.push("c_fill", "g_auto");
      else if (opts.w || opts.h) t.push("c_limit");
      return src.replace("/image/upload/", `/image/upload/${t.join(",")}/`);
    }
    if (UNSPLASH.test(src)) {
      try {
        const u = new URL(src);
        if (opts.format) u.searchParams.set("fm", opts.format);
        else u.searchParams.set("auto", "format");
        u.searchParams.set("fit", "crop");
        u.searchParams.set("q", "72");
        if (opts.w) u.searchParams.set("w", String(Math.round(opts.w)));
        if (opts.h) u.searchParams.set("h", String(Math.round(opts.h)));
        return u.href;
      } catch (e) {
        return src;
      }
    }
    return src;
  }

  const heightFor = (w, ratio) => (ratio ? Math.round((w * ratio[1]) / ratio[0]) : 0);

  function srcset(src, widths, ratio) {
    if (!transformable(src)) return "";
    return widths.map((w) => `${url(src, { w, h: heightFor(w, ratio) || undefined })} ${w}w`).join(", ");
  }

  // An <img> tag: ratio [w, h] crops to that shape, widths are the sizes on offer and sizes is how wide it shows.
  function tag(opts = {}) {
    const src = opts.src || "";
    const widths = opts.widths || [480, 800, 1200];
    const ratio = opts.ratio || null;
    const cls = opts.className ? ` class="${esc(opts.className)}"` : "";
    const load = opts.eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
    const extra = opts.attrs ? ` ${opts.attrs}` : "";
    const base = widths[Math.min(1, widths.length - 1)] || 800;
    const dims = ratio ? ` width="${base}" height="${heightFor(base, ratio)}"` : "";
    const alt = ` alt="${esc(opts.alt || "")}"`;
    if (!src) return `<img${cls} src="${PLACEHOLDER}"${alt}${dims}${load} decoding="async" data-placeholder${extra}>`;
    const main = url(src, { w: base, h: heightFor(base, ratio) || undefined });
    const set = srcset(src, widths, ratio);
    const responsive = set ? ` srcset="${esc(set)}" sizes="${esc(opts.sizes || "100vw")}"` : "";
    return `<img${cls} src="${esc(main)}"${responsive}${alt}${dims}${load} decoding="async"${extra}>`;
  }

  // One listener for the whole page: broken photos turn into the placeholder.
  function installFallback(root = document) {
    root.addEventListener(
      "error",
      (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
        img.dataset.failed = "1";
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.src = PLACEHOLDER;
      },
      true
    );
  }

  /* ---------- Preparing uploads ---------- */

  async function decode(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (e) {
        console.warn("[Sasha] Trying the slower way to read this photo.");
      }
    }
    return new Promise((resolve, reject) => {
      const link = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(link);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(link);
        reject(new Error("This photo couldn't be read."));
      };
      img.src = link;
    });
  }

  // Resizes a photo to JPEG and resolves to { blob, width, height, name }. Files the browser can't read (HEIC outside Safari) go up unchanged; Cloudinary converts them.
  async function shrink(file, opts = {}) {
    const max = opts.max || 2400;
    const quality = opts.quality || 0.88;
    const keepUnder = opts.keepUnder || 1.5 * 1024 * 1024;
    const name = file.name || "photo.jpg";
    if (/image\/gif/i.test(file.type || "")) return { blob: file, width: 0, height: 0, name };
    let pic;
    try {
      pic = await decode(file);
    } catch (e) {
      return { blob: file, width: 0, height: 0, name };
    }
    const w = pic.width || pic.naturalWidth;
    const h = pic.height || pic.naturalHeight;
    const scale = Math.min(1, max / Math.max(w, h));
    if (scale === 1 && /image\/jpe?g/i.test(file.type || "") && file.size <= keepUnder) {
      if (pic.close) pic.close();
      return { blob: file, width: w, height: h, name };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(pic, 0, 0, canvas.width, canvas.height);
    if (pic.close) pic.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return { blob: file, width: w, height: h, name };
    return { blob, width: canvas.width, height: canvas.height, name: `${name.replace(/\.[^.]+$/, "") || "photo"}.jpg` };
  }

  SASHA.img = {
    url,
    srcset,
    tag,
    PLACEHOLDER,
    installFallback,
    shrink,
    isCloudinary: (src) => CLOUDINARY.test(src || ""),
  };
})();
