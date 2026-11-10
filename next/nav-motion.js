/*
 * Directional page motion for the photos section (legacy pages and the Next.js app alike).
 *
 * Load it as a plain, render-blocking <script> in <head>, before any content paints: the browser
 * decides how a page is revealed before its first frame, so a listener added later is too late.
 *
 * Direction is worked out from where the visitor is and where they are going:
 *   - main tabs (อัลบั้ม -> รูปภาพ) slide by tab order: to a later tab slides left, earlier slides right
 *   - going deeper (home -> album -> sub-album) slides the new page in from the right
 *   - going up or back (breadcrumb, back link, browser back) slides it in from the left
 * Album depth is not in the URL, so every album page records the depth of itself, its breadcrumb
 * ancestors and its sub-folders in sessionStorage (see navMotion.rememberAlbums).
 *
 * Browsers with cross-document view transitions (Chrome/Edge, Safari 18.2+) animate old page out
 * and new page in, with the bottom tab bar held still. Other browsers get the new page's content
 * sliding in as it appears. Movement is along the X axis only (no fades), and nothing moves when the visitor
 * asks for reduced motion.
 */
(function () {
  "use strict";
  if (window.navMotion) return;

  var DEPTH_KEY = "navMotion:depth:";
  var HINT_KEY = "navMotion:hint";
  var DURATION = 300;
  var TAB_DURATION = 360;
  // A tapped tab first slides its indicator into place, then the page switches.
  var TAB_DELAY = 220;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var crossDocument = "PageRevealEvent" in window;

  var css = [
    "@view-transition{navigation:auto}",
    // The bottom tab bar is the same on both pages: keep it still while the pages slide under it.
    ".tabbar:not([hidden]),.album-tabbar,[data-nav-static=tabbar]{view-transition-name:nav-tabbar}",
    "::view-transition-group(nav-tabbar){animation:none}",
    "::view-transition-old(nav-tabbar){display:none}",
    "::view-transition-new(nav-tabbar){animation:none}",
    // Untyped transitions do not animate: no fades anywhere.
    "::view-transition-old(root),::view-transition-new(root){animation:none}",
    // The whole-page snapshot only moves for transitions that ask for it with the nav-root type: a
    // full page load, or a change inside one page (navMotion.run). The Next.js app animates its own
    // page element instead (React's <ViewTransition>), and a root sliding underneath it as well would
    // double every in-app navigation.
    // Forward (deeper): new page slides in from the right over the old one, which eases left behind it.
    // X axis only, no fading.
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-forward)::view-transition-old(root){animation:" + DURATION + "ms cubic-bezier(.4,0,.2,1) both nav-out-left}",
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-forward)::view-transition-new(root){animation:" + DURATION + "ms cubic-bezier(.2,.8,.2,1) both nav-in-right}",
    // Back (up a level): both pages push to the right together.
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-back)::view-transition-old(root){animation:" + DURATION + "ms cubic-bezier(.4,0,.2,1) both nav-out-right}",
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-back)::view-transition-new(root){animation:" + DURATION + "ms cubic-bezier(.2,.8,.2,1) both nav-in-left}",
    // Main tabs (อัลบั้ม / รูปภาพ): a clean push along the X axis only. Both pages move the full
    // width together, no fading, like swiping between tabs.
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-tab-forward)::view-transition-old(root){animation:" + TAB_DURATION + "ms cubic-bezier(.65,0,.35,1) both nav-push-out-left}",
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-tab-forward)::view-transition-new(root){animation:" + TAB_DURATION + "ms cubic-bezier(.65,0,.35,1) both nav-push-in-right}",
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-tab-back)::view-transition-old(root){animation:" + TAB_DURATION + "ms cubic-bezier(.65,0,.35,1) both nav-push-out-right}",
    "html:active-view-transition-type(nav-root):active-view-transition-type(nav-tab-back)::view-transition-new(root){animation:" + TAB_DURATION + "ms cubic-bezier(.65,0,.35,1) both nav-push-in-left}",
    "@keyframes nav-push-out-left{to{transform:translateX(-100%)}}",
    "@keyframes nav-push-in-right{from{transform:translateX(100%)}}",
    "@keyframes nav-push-out-right{to{transform:translateX(100%)}}",
    "@keyframes nav-push-in-left{from{transform:translateX(-100%)}}",
    "@keyframes nav-out-left{to{transform:translateX(-30%)}}",
    "@keyframes nav-in-right{from{transform:translateX(100%)}}",
    "@keyframes nav-out-right{to{transform:translateX(100%)}}",
    "@keyframes nav-in-left{from{transform:translateX(-100%)}}",
    // Browsers without view transitions: only the arriving content can move.
    "html.nav-enter-forward .photos-page,html.nav-enter-forward [data-nav-content]{animation:" + DURATION + "ms cubic-bezier(.2,.8,.2,1) both nav-in-right-soft}",
    "html.nav-enter-back .photos-page,html.nav-enter-back [data-nav-content]{animation:" + DURATION + "ms cubic-bezier(.2,.8,.2,1) both nav-in-left}",
    "@keyframes nav-in-right-soft{from{transform:translateX(30%)}}",
    "html.nav-enter-tab-forward .photos-page,html.nav-enter-tab-forward [data-nav-content]{animation:" + TAB_DURATION + "ms cubic-bezier(.65,0,.35,1) both nav-push-in-right}",
    "html.nav-enter-tab-back .photos-page,html.nav-enter-tab-back [data-nav-content]{animation:" + TAB_DURATION + "ms cubic-bezier(.65,0,.35,1) both nav-push-in-left}",
    // Tab bar indicator: one pill that slides between tabs instead of each tab painting its own
    // background. Tab colours follow the pill.
    ".nav-tab-pill{position:absolute;left:0;top:0;width:0;height:0;border-radius:999px;background:var(--accent,#b00909);pointer-events:none;z-index:0;opacity:0;transition:transform .32s cubic-bezier(.2,.8,.2,1),width .32s cubic-bezier(.2,.8,.2,1),height .32s cubic-bezier(.2,.8,.2,1),opacity .15s}",
    "[data-tab-bar].nav-tabs-ready [data-tab-item]{position:relative;z-index:1;background:transparent!important;color:#4b5563!important;transition:color .25s ease;-webkit-tap-highlight-color:transparent}",
    "[data-tab-bar].nav-tabs-ready [data-tab-item].active,[data-tab-bar].nav-tabs-ready [data-tab-item][aria-current=page]{color:#fff!important}",
    "@media (max-width:600px){.nav-tab-pill{border-radius:12px;background:rgba(176,9,9,.08)}[data-tab-bar].nav-tabs-ready [data-tab-item].active,[data-tab-bar].nav-tabs-ready [data-tab-item][aria-current=page]{color:var(--accent,#b00909)!important}}",
    "@media (prefers-reduced-motion:reduce){.nav-tab-pill{transition:none}::view-transition-old(*),::view-transition-new(*),::view-transition-group(*){animation:none!important}html[class*=nav-enter-] .photos-page,html[class*=nav-enter-] [data-nav-content]{animation:none!important}}",
  ].join("\n");
  var style = document.createElement("style");
  style.setAttribute("data-nav-motion", "");
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  function storage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  // Where a URL sits in the photos section.
  function place(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return { kind: "other" }; }
    if (u.origin !== location.origin) return { kind: "other" };
    var p = u.pathname.replace(/index\.html$/, "");
    if (!p.endsWith("/")) p += "/";
    var q = u.searchParams;
    if (p === "/photos/" || p === "/preview/photos/") {
      var view = q.get("view");
      return view ? { kind: "level", level: 1 } : { kind: "tab", tab: 0 };
    }
    if (p === "/photos/album/") {
      if (q.get("view") === "all") return { kind: "tab", tab: 1 };
      var share = q.get("share");
      var key = share ? "share:" + share + ":" + (q.get("a") || "") : (q.get("id") || "");
      var s = storage();
      var depth = s ? s.getItem(DEPTH_KEY + key) : null;
      return { kind: "album", level: depth == null ? null : Number(depth) };
    }
    return { kind: "other" };
  }

  function levelOf(pl) {
    if (pl.kind === "tab") return 0;
    if (pl.kind === "level" || pl.kind === "album") return pl.level;
    return null;
  }

  // "forward" | "back" (hierarchy), "tab-forward" | "tab-back" (main tabs), or null (no directional
  // motion: unrelated pages, or the same place)
  function direction(fromHref, toHref) {
    var from = place(fromHref);
    var to = place(toHref);
    if (from.kind === "other" || to.kind === "other") return null;
    if (from.kind === "tab" && to.kind === "tab") {
      if (from.tab === to.tab) return null;
      return to.tab > from.tab ? "tab-forward" : "tab-back";
    }
    var a = levelOf(from), b = levelOf(to);
    if (a != null && b != null && a !== b) return b > a ? "forward" : "back";
    if (to.kind === "tab") return "back";
    // An album never visited in this tab yet is almost always reached by opening it: deeper.
    return "forward";
  }

  // A one-off override for the next navigation, for callers that know better than the URLs.
  function hint(dir) {
    var s = storage();
    if (s) s.setItem(HINT_KEY, JSON.stringify({ dir: dir, at: Date.now() }));
  }
  function takeHint() {
    var s = storage();
    if (!s) return null;
    var raw = s.getItem(HINT_KEY);
    s.removeItem(HINT_KEY);
    try {
      var h = JSON.parse(raw);
      return h && Date.now() - h.at < 10000 ? h.dir : null;
    } catch (e) { return null; }
  }

  // Album pages call this after loading: breadcrumb is [{id,...}] from the top folder down to the
  // parent, children are the sub-folders. prefix scopes ids for share links.
  function rememberAlbums(breadcrumb, currentId, children, prefix) {
    var s = storage();
    if (!s) return;
    prefix = prefix || "";
    var depth = (breadcrumb ? breadcrumb.length : 0) + 1;
    try {
      (breadcrumb || []).forEach(function (b, i) { s.setItem(DEPTH_KEY + prefix + b.id, String(i + 1)); });
      if (currentId != null) s.setItem(DEPTH_KEY + prefix + currentId, String(depth));
      (children || []).forEach(function (c) { s.setItem(DEPTH_KEY + prefix + c.id, String(depth + 1)); });
    } catch (e) { /* storage full: directions fall back to "forward" */ }
  }

  function addType(transition, dir) {
    if (dir && transition && transition.types) transition.types.add("nav-" + dir);
  }
  // Marks a transition whose motion belongs to the whole-page snapshot (see the CSS above).
  function addRootType(transition) {
    if (transition && transition.types) transition.types.add("nav-root");
  }

  // ---- Leaving this page (browsers with cross-document transitions) ----
  window.addEventListener("pageswap", function (e) {
    if (!e.viewTransition || reduceMotion) return;
    var to = e.activation && e.activation.entry && e.activation.entry.url;
    var dir = null;
    var s = storage();
    var raw = s && s.getItem(HINT_KEY);
    if (raw) { try { var h = JSON.parse(raw); if (h && Date.now() - h.at < 10000) dir = h.dir; } catch (err) {} }
    if (!dir && to) dir = direction(location.href, to);
    if (!dir) { e.viewTransition.skipTransition(); return; }
    addType(e.viewTransition, dir);
    addRootType(e.viewTransition);
    // The arriving page reads the same answer (it cannot see this page's hint otherwise).
    if (s) s.setItem(HINT_KEY, JSON.stringify({ dir: dir, at: Date.now() }));
  });

  // ---- Arriving on this page ----
  function arrivalDirection() {
    var hinted = takeHint();
    if (hinted) return hinted;
    var from = document.referrer;
    return from ? direction(from, location.href) : null;
  }

  if (crossDocument) {
    window.addEventListener("pagereveal", function (e) {
      var dir = arrivalDirection();
      if (!e.viewTransition) return;
      if (!dir || reduceMotion) { e.viewTransition.skipTransition(); return; }
      addType(e.viewTransition, dir);
      addRootType(e.viewTransition);
    });
  } else if (!reduceMotion) {
    var dir = arrivalDirection();
    if (dir) {
      var cls = "nav-enter-" + dir;
      document.documentElement.classList.add(cls);
      setTimeout(function () { document.documentElement.classList.remove(cls); }, DURATION + 80);
    }
  }

  // A newer transition skipping this one is expected, not an error.
  function quietly(t) {
    var quiet = function () {};
    if (t && t.ready) t.ready.catch(quiet);
    if (t && t.finished) t.finished.catch(quiet);
    if (t && t.updateCallbackDone) t.updateCallbackDone.catch(quiet);
    return t;
  }

  // ---- Changes within a page (e.g. switching to the trash view) ----
  // update() must change the DOM synchronously.
  function run(dir, update) {
    if (reduceMotion || !dir) { update(); return; }
    if (document.startViewTransition) {
      var t;
      try {
        t = document.startViewTransition({ update: update, types: ["nav-" + dir, "nav-root"] });
      } catch (e) {
        t = document.startViewTransition(update);
        addType(t, dir);
        addRootType(t);
      }
      return quietly(t);
    }
    update();
    var cls = "nav-enter-" + dir;
    var root = document.documentElement;
    root.classList.remove("nav-enter-forward", "nav-enter-back", "nav-enter-tab-forward", "nav-enter-tab-back");
    void root.offsetWidth;
    root.classList.add(cls);
    setTimeout(function () { root.classList.remove(cls); }, DURATION + 80);
  }

  // ---- Bottom tab bar indicator ----
  // Markup: a bar with [data-tab-bar] holding [data-tab-item] tabs; the current one has class
  // "active" or aria-current="page". An optional .nav-tab-pill child is reused (React renders its
  // own so it is never an unknown node); otherwise one is added. A tab with data-tab-href is a
  // page change: the pill slides there first, then the page loads, and since the tab bar is held
  // still during the page slide, the pill is already in place on the next page.
  function setupTabBar(bar) {
    if (!bar || bar.__navTabs) return;
    bar.__navTabs = true;
    bar.setAttribute("data-tab-bar", "");
    var pill = bar.querySelector(".nav-tab-pill");
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "nav-tab-pill";
      pill.setAttribute("aria-hidden", "true");
      bar.insertBefore(pill, bar.firstChild);
    }
    bar.classList.add("nav-tabs-ready");
    function items() { return Array.prototype.slice.call(bar.querySelectorAll("[data-tab-item]")); }
    function current() {
      return items().filter(function (i) { return i.classList.contains("active") || i.getAttribute("aria-current") === "page"; })[0];
    }
    function place(el, animate) {
      if (!el || !el.offsetWidth) { pill.style.opacity = "0"; return; }
      if (!animate) pill.style.transition = "none";
      pill.style.width = el.offsetWidth + "px";
      pill.style.height = el.offsetHeight + "px";
      pill.style.transform = "translate(" + el.offsetLeft + "px," + el.offsetTop + "px)";
      pill.style.opacity = "1";
      if (!animate) { void pill.offsetWidth; pill.style.transition = ""; }
    }
    place(current(), false);
    // Layout changes (rotation, phone/desktop breakpoint, the bar becoming visible) re-place it
    // without animating; a change of the active tab animates.
    if (window.ResizeObserver) new ResizeObserver(function () { place(current(), false); }).observe(bar);
    new MutationObserver(function () { place(current(), true); })
      .observe(bar, { subtree: true, attributes: true, attributeFilter: ["class", "aria-current"] });
    bar.addEventListener("click", function (e) {
      var item = e.target.closest && e.target.closest("[data-tab-item]");
      if (!item || item === current()) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = item.getAttribute("data-tab-href");
      items().forEach(function (i) {
        var on = i === item;
        i.classList.toggle("active", on);
        if (on) i.setAttribute("aria-current", "page"); else i.removeAttribute("aria-current");
      });
      place(item, true);
      if (href) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTimeout(function () { location.assign(href); }, reduceMotion ? 0 : TAB_DELAY);
      }
    }, true);
  }
  function setupAllTabBars() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab-bar]"), setupTabBar);
  }
  // The Next.js app sets its tab bars up after hydration (changing them earlier breaks hydration).
  if (!self.__next_f) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAllTabBars);
    else setupAllTabBars();
  }
  // Pages restored from the back/forward cache keep the pill where it was tapped: re-place it.
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab-bar]"), function (bar) {
      if (bar.__navTabs) { bar.__navTabs = false; }
      setupTabBar(bar);
    });
  });

  // ---- Browser back/forward inside the Next.js app ----
  // Next.js restores the previous page in memory but without a view transition, so Back cut
  // instantly. This script runs before Next.js registers its own popstate listener, which lets it
  // hold the event: snapshot the page as it is, then hand the event to Next.js inside the transition
  // and wait for the new page to render before the slide plays.
  var lastHref = location.href;
  ["pushState", "replaceState"].forEach(function (name) {
    var orig = history[name];
    history[name] = function () {
      var r = orig.apply(this, arguments);
      lastHref = location.href;
      return r;
    };
  });
  var replaying = false;
  // The app reports the commit that ends a held-back popstate render (see navMotion.renderedRoute and
  // the NavProgress component). Waiting for that commit, instead of guessing from DOM mutations, is
  // what keeps Back from snapping: a snapshot taken too early captures the page the visitor is leaving
  // and the transition animates it against itself.
  var awaitingRender = null;
  function renderedRoute() {
    var resolve = awaitingRender;
    if (!resolve) return;
    awaitingRender = null;
    resolve();
  }
  function samePlace(a, b) {
    try {
      var x = new URL(a, location.href), y = new URL(b, location.href);
      return x.pathname === y.pathname && x.search === y.search;
    } catch (e) { return false; }
  }
  window.addEventListener("popstate", function (e) {
    if (replaying) return;
    var from = lastHref;
    lastHref = location.href;
    // Only the Next.js app (window.next); legacy pages handle their own history.
    if (!window.next || !document.startViewTransition || reduceMotion) return;
    // A hash-only step renders nothing, so there would be no commit to wait for.
    if (samePlace(from, location.href)) return;
    var dir = direction(from, location.href);
    if (!dir) return;
    e.stopImmediatePropagation();
    var state = e.state;
    var settled = function () {
      return new Promise(function (resolve) {
        var done = false;
        var timer = null;
        var finish = function () {
          if (done) return;
          done = true;
          awaitingRender = null;
          if (timer) clearTimeout(timer);
          // One frame after the commit, so the new page is laid out before it is captured.
          requestAnimationFrame(function () { requestAnimationFrame(resolve); });
        };
        awaitingRender = finish;
        // A render that never reports (an error, a route the app does not own) must not hold the old
        // frame on screen.
        timer = setTimeout(finish, 700);
      });
    };
    var update = function () {
      var wait = settled();
      replaying = true;
      try { window.dispatchEvent(new PopStateEvent("popstate", { state: state })); } finally { replaying = false; }
      return wait;
    };
    var t;
    try {
      t = document.startViewTransition({ update: update, types: ["nav-" + dir, "nav-root"] });
    } catch (err) {
      t = document.startViewTransition(update);
      addType(t, dir);
      addRootType(t);
    }
    quietly(t);
  }, true);

  window.navMotion = { direction: direction, hint: hint, rememberAlbums: rememberAlbums, run: run, setupTabBar: setupTabBar, renderedRoute: renderedRoute };
})();
