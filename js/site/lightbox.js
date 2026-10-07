// Sasha Travel Stories: the full-screen photo viewer (SASHA.lightbox). SASHA.lightbox.open([{ src, alt, caption }], start); arrows, swipes and Esc work.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const icon = SASHA.icon;

  let el = null;
  let items = [];
  let index = 0;
  let lastFocus = null;
  let touchX = null;

  const big = (src) => SASHA.img.url(src, { w: 2000 });

  function build() {
    el = document.createElement("div");
    el.className = "lightbox";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Photo viewer");
    el.innerHTML = `<div class="lb-top">
        <span class="lb-count" aria-live="polite"></span>
        <button class="icon-btn" type="button" data-lb="close" aria-label="Close the photo viewer">${icon("x", { size: 22 })}</button>
      </div>
      <div class="lb-stage">
        <img alt="">
        <button class="icon-btn lb-prev" type="button" data-lb="prev" aria-label="Previous photo">${icon("chevron-left", { size: 26 })}</button>
        <button class="icon-btn lb-next" type="button" data-lb="next" aria-label="Next photo">${icon("chevron-right", { size: 26 })}</button>
      </div>
      <p class="lb-caption"></p>`;
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lb]");
      if (btn) {
        if (btn.dataset.lb === "close") close();
        else go(btn.dataset.lb === "next" ? 1 : -1);
        return;
      }
      if (e.target.classList.contains("lb-stage")) close();
    });
    const stage = el.querySelector(".lb-stage");
    stage.addEventListener(
      "touchstart",
      (e) => {
        touchX = e.touches.length === 1 ? e.touches[0].clientX : null;
      },
      { passive: true }
    );
    stage.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
    document.body.appendChild(el);
  }

  function show() {
    const item = items[index];
    const img = el.querySelector(".lb-stage img");
    img.src = big(item.src);
    img.alt = item.alt || "";
    el.querySelector(".lb-caption").textContent = item.caption || item.alt || "";
    el.querySelector(".lb-count").textContent = items.length > 1 ? `${index + 1} of ${items.length}` : "";
    el.querySelectorAll(".lb-prev, .lb-next").forEach((b) => {
      b.hidden = items.length < 2;
    });
    // Loads the photos either side, so moving between them feels instant.
    [index - 1, index + 1].forEach((i) => {
      const next = items[(i + items.length) % items.length];
      if (next && items.length > 1) new Image().src = big(next.src);
    });
  }

  function go(step) {
    if (items.length < 2) return;
    index = (index + step + items.length) % items.length;
    show();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Tab") {
      const buttons = Array.from(el.querySelectorAll("button")).filter((b) => !b.hidden);
      if (!buttons.length) return;
      const at = buttons.indexOf(document.activeElement);
      e.preventDefault();
      const next = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
      buttons[next].focus();
    }
  }

  function open(list, start) {
    items = (Array.isArray(list) ? list : []).filter((i) => i && i.src);
    if (!items.length) return;
    if (!el) build();
    index = Math.min(Math.max(0, Number(start) || 0), items.length - 1);
    lastFocus = document.activeElement;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    show();
    el.querySelector('[data-lb="close"]').focus();
  }

  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  SASHA.lightbox = { open, close };
})();
