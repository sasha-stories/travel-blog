// Sasha Travel Stories: maps (SASHA.map) drawn with Leaflet on free OpenStreetMap tiles; Leaflet only downloads when a page shows a map.
// places(el, list) pins every place, single(el, point) shows one spot, picker(el, point, onMove) lets the dashboard choose a spot.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const esc = SASHA.util.esc;

  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
  const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  // The second tile source is only used if the first won't load. The credit line is the condition for using them, so keep it.
  const TILE_SOURCES = [
    { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", options: { maxZoom: 19, attribution: OSM_CREDIT } },
    {
      url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      options: { maxZoom: 19, subdomains: "abc", attribution: `${OSM_CREDIT}, tiles by <a href="https://www.openstreetmap.fr/" target="_blank" rel="noopener">OSM France</a>` },
    },
  ];
  const INDIA = { lat: 22.5, lng: 79, zoom: 4 };

  const round = (n) => Math.round(n * 1e6) / 1e6;
  const isPoint = (p) => Boolean(p) && [p.lat, p.lng].every((v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)));

  let loading = null;

  function leaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = LEAFLET_CSS;
        document.head.appendChild(css);
        const js = document.createElement("script");
        js.src = LEAFLET_JS;
        js.onload = () => (window.L ? resolve(window.L) : reject(new Error("Leaflet did not load.")));
        js.onerror = () => {
          loading = null;
          reject(new Error("The map couldn't load. Check your internet connection."));
        };
        document.head.appendChild(js);
      });
    }
    return loading;
  }

  // Adds the map tiles, and switches to the backup source if several fail before any loads.
  function addTiles(L, map, index) {
    const i = index || 0;
    const source = TILE_SOURCES[i];
    const layer = L.tileLayer(source.url, Object.assign({ className: "sasha-tiles" }, source.options)).addTo(map);
    let loaded = 0;
    let failed = 0;
    layer.on("tileload", () => {
      loaded += 1;
    });
    layer.on("tileerror", () => {
      failed += 1;
      if (!loaded && failed >= 4 && i + 1 < TILE_SOURCES.length) {
        map.removeLayer(layer);
        addTiles(L, map, i + 1);
      }
    });
    return layer;
  }

  function pin(L) {
    return L.divIcon({ className: "", html: '<div class="sasha-pin"><span></span></div>', iconSize: [30, 30], iconAnchor: [15, 36], popupAnchor: [0, -34] });
  }

  function makeMap(L, el, options) {
    if (el._sashaMap) {
      el._sashaMap.remove();
      el._sashaMap = null;
    }
    const map = L.map(el, Object.assign({ scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomControl: true, attributionControl: true }, options || {}));
    addTiles(L, map, 0);
    // Scrolling the page never gets stuck on the map: click it first to zoom with the mouse wheel.
    map.once("click focus", () => map.scrollWheelZoom.enable());
    el._sashaMap = map;
    setTimeout(() => map.invalidateSize(), 80);
    return map;
  }

  function failed(el, err) {
    console.warn("[Sasha] Map:", err && err.message);
    el.hidden = true;
    return null;
  }

  function places(el, list) {
    const points = (list || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!el || !points.length) return Promise.resolve(null);
    return leaflet()
      .then((L) => {
        const map = makeMap(L, el);
        const icon = pin(L);
        const markers = points.map((p) =>
          L.marker([p.lat, p.lng], { icon, title: p.name, alt: p.name })
            .addTo(map)
            .bindPopup(`<div class="map-popup"><strong>${esc(p.name)}</strong>${p.region ? `<span>${esc(p.region)}</span>` : ""}<a href="${esc(p.url)}">Open this place &rarr;</a></div>`)
        );
        if (markers.length === 1) map.setView([points[0].lat, points[0].lng], 8);
        else map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [40, 40], maxZoom: 7 });
        return map;
      })
      .catch((err) => failed(el, err));
  }

  function single(el, point) {
    if (!el || !isPoint(point)) return Promise.resolve(null);
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    return leaflet()
      .then((L) => {
        const map = makeMap(L, el);
        map.setView([lat, lng], Number(point.zoom) || 12);
        const marker = L.marker([lat, lng], { icon: pin(L), title: point.label || "", alt: point.label || "Location" }).addTo(map);
        if (point.label) marker.bindPopup(`<div class="map-popup"><strong>${esc(point.label)}</strong></div>`);
        return map;
      })
      .catch((err) => failed(el, err));
  }

  // Click the map or drag the pin to choose a spot; onMove(lat, lng) runs after each change. Resolves to { set(lat, lng, zoom) }.
  function picker(el, point, onMove) {
    if (!el) return Promise.resolve(null);
    return leaflet()
      .then((L) => {
        const map = makeMap(L, el, { dragging: true, scrollWheelZoom: true });
        let marker = null;
        const report = () => {
          const p = marker.getLatLng();
          if (onMove) onMove(round(p.lat), round(p.lng));
        };
        const place = (lat, lng) => {
          if (marker) {
            marker.setLatLng([lat, lng]);
            return;
          }
          marker = L.marker([lat, lng], { icon: pin(L), draggable: true, autoPan: true, alt: "Chosen spot" }).addTo(map);
          marker.on("dragend", report);
        };
        map.on("click", (e) => {
          place(e.latlng.lat, e.latlng.lng);
          report();
        });
        if (isPoint(point)) {
          place(Number(point.lat), Number(point.lng));
          map.setView([Number(point.lat), Number(point.lng)], Number(point.zoom) || 11);
        } else {
          map.setView([INDIA.lat, INDIA.lng], INDIA.zoom);
        }
        return {
          set(lat, lng, zoom) {
            place(lat, lng);
            map.setView([lat, lng], zoom || Math.max(map.getZoom(), 11));
          },
        };
      })
      .catch((err) => failed(el, err));
  }

  SASHA.map = { places, single, picker, leaflet };
})();
