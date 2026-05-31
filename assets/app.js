/* ============================================================
   AI MATRIX — Premium E-book  ·  Client App
   NAV·TOC·progress·prev/next·search·resume·font·theme·bookmark·print
   ============================================================ */
(function () {
  "use strict";

  var NAV = window.__NAV__ || [];
  var byId = {};
  NAV.forEach(function (p, i) { p.index = i; byId[p.id] = p; });

  var LS = { last: "aimatrix:last", scale: "aimatrix:scale", theme: "aimatrix:theme", bm: "aimatrix:bm" };
  var progress = document.getElementById("progress");
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("overlay");
  var tbKicker = document.querySelector("#topbar .tb-kicker");
  var tbTitle = document.querySelector("#topbar .tb-title");
  var current = null;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function crumbFor(p) {
    if (!p) return "";
    if (p.type === "chapter") return "PART " + (p.partRoman || "") + " · " + p.chap + "장";
    if (p.type === "part") return "PART " + p.roman;
    if (p.type === "prologue") return "프롤로그";
    if (p.type === "epilogue") return "에필로그";
    return "";
  }

  /* ---------- TOC ---------- */
  function buildTOC() {
    var scroll = document.querySelector("#sidebar .sb-scroll");
    var html = "";
    NAV.forEach(function (p) {
      if (p.type === "cover") html += tocItem(p, "special", "표지");
      else if (p.type === "prologue") html += tocItem(p, "special", "프롤로그");
      else if (p.type === "epilogue") html += tocItem(p, "special", "에필로그");
      else if (p.type === "part") {
        html += '<div class="toc-part">PART ' + p.roman + '<span class="tp-desc">' + esc(p.shortDesc || "") + "</span></div>";
        html += tocItem(p, "part", p.tocLabel || ("제" + p.part + "부"));
      } else if (p.type === "chapter") html += tocItem(p, "chapter", p.tocLabel);
    });
    scroll.innerHTML = html;
    scroll.querySelectorAll(".toc-item").forEach(function (el) {
      el.addEventListener("click", function () { go(el.dataset.id); });
    });
  }
  function tocItem(p, lvl, label) {
    var num = p.type === "chapter" ? p.chap + "장" : "";
    var text = p.type === "chapter" ? (p.tocTitle || label) : label;
    return '<div class="toc-item lvl-' + lvl + (lvl === "special" ? " toc-special" : "") +
      '" data-id="' + p.id + '"><span class="ti-num">' + num + '</span><span class="ti-label">' + esc(text) + "</span></div>";
  }

  /* ---------- Navigation ---------- */
  function go(id, push) {
    if (!byId[id]) id = NAV[0].id;
    var prevEl = document.getElementById("page-" + current);
    if (prevEl) prevEl.classList.remove("active");
    var el = document.getElementById("page-" + id);
    if (!el) return;
    el.classList.remove("active"); void el.offsetWidth; el.classList.add("active");
    current = id;
    if (push === false) history.replaceState(null, "", "#" + id);
    else if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    window.scrollTo({ top: 0, behavior: "auto" });
    if (id !== "cover") lsSet(LS.last, id);
    updateTOC(); updateTopbar(); closeDrawer(); updateProgress();
  }
  function updateTOC() {
    document.querySelectorAll(".toc-item").forEach(function (el) { el.classList.toggle("active", el.dataset.id === current); });
    var a = document.querySelector(".toc-item.active");
    if (a) { var r = a.getBoundingClientRect(); if (r.top < 80 || r.bottom > window.innerHeight - 20) a.scrollIntoView({ block: "center" }); }
  }
  function updateTopbar() {
    var p = byId[current]; if (!p) return;
    if (p.type === "cover") { tbKicker.textContent = ""; tbTitle.textContent = ""; }
    else if (p.type === "chapter") { tbKicker.textContent = "PART " + (p.partRoman || "") + " · " + p.chap + "장"; tbTitle.textContent = p.tocTitle || ""; }
    else if (p.type === "part") { tbKicker.textContent = "PART " + p.roman; tbTitle.textContent = p.shortDesc || ""; }
    else { tbKicker.textContent = p.type === "prologue" ? "PROLOGUE" : "EPILOGUE"; tbTitle.textContent = p.tocTitle || ""; }
  }

  /* ---------- prev / next ---------- */
  function buildPageNavs() {
    NAV.forEach(function (p) {
      var sec = document.getElementById("page-" + p.id);
      if (!sec || p.type === "cover") return;
      var nav = document.createElement("div");
      nav.className = "page-nav";
      nav.innerHTML = navBtn(NAV[p.index - 1], "prev") + navBtn(NAV[p.index + 1], "next");
      sec.appendChild(nav);
      nav.querySelectorAll(".pn-btn[data-id]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.id); }); });
    });
  }
  function navBtn(p, dir) {
    if (!p) return '<div class="pn-btn ' + dir + ' disabled"></div>';
    return '<div class="pn-btn ' + dir + '" data-id="' + p.id + '"><span class="pn-dir">' +
      (dir === "prev" ? "← 이전" : "다음 →") + "</span><span class=\"pn-label\">" + esc(navLabel(p)) + "</span></div>";
  }
  function navLabel(p) {
    if (p.type === "chapter") return p.chap + "장 · " + (p.tocTitle || "");
    if (p.type === "part") return "PART " + p.roman + " · " + (p.shortDesc || "");
    if (p.type === "prologue") return "프롤로그";
    if (p.type === "epilogue") return "에필로그";
    if (p.type === "cover") return "표지";
    return p.tocTitle || "";
  }

  /* ---------- progress ---------- */
  function updateProgress() {
    var p = byId[current]; if (!p) return;
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var frac = docH > 0 ? Math.min(1, window.scrollY / docH) : 0;
    var total = NAV.length - 1;
    progress.style.width = (total > 0 ? ((p.index + frac) / total) * 100 : 0).toFixed(2) + "%";
  }

  /* ---------- drawer ---------- */
  function openDrawer() { sidebar.classList.add("open"); overlay.classList.add("show"); }
  function closeDrawer() { sidebar.classList.remove("open"); overlay.classList.remove("show"); }

  /* ---------- font size ---------- */
  function applyScale(s) { document.documentElement.style.setProperty("--read-scale", s); lsSet(LS.scale, s); }
  function initFont() { var s = parseFloat(lsGet(LS.scale)); if (!s || isNaN(s)) s = 1; applyScale(s); }
  function bumpFont(d) { var s = parseFloat(lsGet(LS.scale)) || 1; s = Math.min(1.4, Math.max(0.85, Math.round((s + d) * 100) / 100)); applyScale(s); }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    lsSet(LS.theme, t);
    var btn = document.getElementById("themeBtn");
    if (btn) btn.innerHTML = t === "dark" ? "☀" : "☾";
  }
  function initTheme() { applyTheme(lsGet(LS.theme) === "dark" ? "dark" : "light"); }
  function toggleTheme() { applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }

  /* ---------- resume ---------- */
  function initResume() {
    var saved = lsGet(LS.last), btn = document.getElementById("resumeBtn");
    if (!btn) return;
    if (saved && byId[saved] && saved !== "cover") {
      btn.querySelector(".rt").textContent = "이어 읽기 · " + (navLabel(byId[saved]).split(" · ")[0] || "");
      btn.classList.add("show");
      btn.addEventListener("click", function () { go(saved); });
    }
  }

  /* ---------- bookmarks ---------- */
  function bmLoad() { try { return JSON.parse(lsGet(LS.bm) || "[]"); } catch (e) { return []; } }
  function bmSave(a) { lsSet(LS.bm, JSON.stringify(a)); updateBmBadge(); }
  function updateBmBadge() {
    var b = document.getElementById("bmBadge"); if (!b) return;
    var n = bmLoad().length; b.textContent = n; b.classList.toggle("show", n > 0);
  }
  function currentHeadingLabel() {
    var sec = document.getElementById("page-" + current); if (!sec) return "";
    var hs = sec.querySelectorAll(".ch-title,.part-title,.prose h2,.prose h3");
    var label = "", limit = window.scrollY + 130;
    hs.forEach(function (h) { if (h.getBoundingClientRect().top + window.scrollY <= limit) label = h.textContent.trim(); });
    if (!label && hs[0]) label = hs[0].textContent.trim();
    return label;
  }
  function addCurrentBookmark() {
    var p = byId[current]; if (!p || p.type === "cover") { return; }
    var list = bmLoad();
    var y = Math.round(window.scrollY);
    list.unshift({ pageId: current, crumb: crumbFor(p), label: currentHeadingLabel() || navLabel(p), y: y });
    bmSave(list.slice(0, 100));
    renderBookmarks();
  }
  function removeBookmark(i) { var a = bmLoad(); a.splice(i, 1); bmSave(a); renderBookmarks(); }
  function jumpBookmark(b) {
    closeBookmarks(); go(b.pageId);
    setTimeout(function () { window.scrollTo({ top: b.y || 0, behavior: "smooth" }); }, 90);
  }
  function renderBookmarks() {
    var list = bmLoad(), box = document.getElementById("bmList");
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="bm-empty">아직 북마크가 없습니다.<br>"현재 위치 추가"를 눌러 저장하세요.</div>'; return; }
    box.innerHTML = list.map(function (b, i) {
      return '<div class="bm-item" data-i="' + i + '"><div class="bm-body"><div class="bm-crumb">' + esc(b.crumb) +
        '</div><div class="bm-label">' + esc(b.label) + '</div></div><button class="bm-del" data-del="' + i + '" aria-label="삭제">×</button></div>';
    }).join("");
    box.querySelectorAll(".bm-item").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest(".bm-del")) { e.stopPropagation(); removeBookmark(+e.target.closest(".bm-del").dataset.del); return; }
        jumpBookmark(bmLoad()[+el.dataset.i]);
      });
    });
  }
  function openBookmarks() { renderBookmarks(); document.getElementById("bookmarks").classList.add("show"); }
  function closeBookmarks() { document.getElementById("bookmarks").classList.remove("show"); }
  function toggleBookmarks() { document.getElementById("bookmarks").classList.contains("show") ? closeBookmarks() : openBookmarks(); }

  /* ---------- search ---------- */
  var INDEX = [], PTEXT = {}, results = [], sel = -1;
  function buildIndex() {
    NAV.forEach(function (p) {
      if (p.type === "cover") return;
      var sec = document.getElementById("page-" + p.id); if (!sec) return;
      var crumb = crumbFor(p);
      var titleEl = sec.querySelector(".ch-title, .part-title");
      if (titleEl) INDEX.push({ pageId: p.id, el: titleEl, crumb: crumb, text: titleEl.textContent.trim() });
      sec.querySelectorAll(".prose h2, .prose h3").forEach(function (h) { INDEX.push({ pageId: p.id, el: h, crumb: crumb, text: h.textContent.trim() }); });
      PTEXT[p.id] = { crumb: crumb, text: (sec.querySelector(".prose") || sec).textContent };
    });
  }
  function openSearch() { document.getElementById("search").classList.add("show"); var inp = document.getElementById("searchInput"); inp.value = ""; inp.focus(); runSearch(""); }
  function closeSearch() { document.getElementById("search").classList.remove("show"); }
  function highlight(text, q) {
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q); if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<span class="hl">' + esc(text.slice(i, i + q.length)) + "</span>" + esc(text.slice(i + q.length));
  }
  function runSearch(q) {
    q = (q || "").trim().toLowerCase(); results = [];
    var box = document.getElementById("searchResults");
    if (q.length < 1) { box.innerHTML = '<div class="sr-empty">제목·소제목·본문을 검색합니다. (장 제목, 기업명, 키워드)</div>'; return; }
    var seen = {};
    INDEX.forEach(function (e) { if (e.text.toLowerCase().indexOf(q) >= 0) { results.push(e); seen[e.pageId] = true; } });
    NAV.forEach(function (p) {
      if (p.type === "cover" || seen[p.id]) return;
      var pt = PTEXT[p.id]; if (!pt) return;
      var lt = pt.text.toLowerCase(), i = lt.indexOf(q);
      if (i >= 0) { var start = Math.max(0, i - 32); results.push({ pageId: p.id, el: null, crumb: pt.crumb, text: (start > 0 ? "… " : "") + pt.text.slice(start, i + q.length + 48).trim() + " …", body: true }); }
    });
    results = results.slice(0, 40); sel = results.length ? 0 : -1;
    if (!results.length) { box.innerHTML = '<div class="sr-empty">검색 결과가 없습니다.</div>'; return; }
    box.innerHTML = results.map(function (r, i) {
      return '<button class="sr-item' + (i === sel ? " sel" : "") + '" data-i="' + i + '"><div class="sr-crumb">' + esc(r.crumb) + (r.body ? " · 본문" : "") +
        '</div><div class="sr-text">' + highlight(r.text, q) + "</div></button>";
    }).join("");
    box.querySelectorAll(".sr-item").forEach(function (b) {
      b.addEventListener("click", function () { pickResult(+b.dataset.i); });
      b.addEventListener("mousemove", function () { setSel(+b.dataset.i); });
    });
  }
  function setSel(i) { sel = i; document.querySelectorAll("#searchResults .sr-item").forEach(function (b, k) { b.classList.toggle("sel", k === i); }); }
  function pickResult(i) { var r = results[i]; if (!r) return; closeSearch(); go(r.pageId); if (r.el) setTimeout(function () { scrollToEl(r.el); }, 80); }
  function scrollToEl(el) {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 78, behavior: "smooth" });
    el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 1300);
  }

  /* ---------- init ---------- */
  function init() {
    initTheme(); buildTOC(); buildPageNavs(); buildIndex(); initFont(); initResume(); updateBmBadge();

    document.getElementById("menuBtn").addEventListener("click", openDrawer);
    overlay.addEventListener("click", closeDrawer);
    document.querySelector("#sidebar .sb-head").addEventListener("click", function () { go("cover"); });

    wire("searchBtn", "click", openSearch);
    wire("fontDec", "click", function () { bumpFont(-0.07); });
    wire("fontInc", "click", function () { bumpFont(0.07); });
    wire("themeBtn", "click", toggleTheme);
    wire("bookmarkBtn", "click", toggleBookmarks);
    wire("bmAdd", "click", addCurrentBookmark);
    wire("pdfBtn", "click", function () { closeDrawer(); window.print(); });

    var searchEl = document.getElementById("search");
    if (searchEl) {
      searchEl.addEventListener("click", function (e) { if (e.target === searchEl) closeSearch(); });
      document.getElementById("searchInput").addEventListener("input", function (e) { runSearch(e.target.value); });
    }
    document.addEventListener("click", function (e) {
      var bm = document.getElementById("bookmarks");
      if (bm && bm.classList.contains("show") && !e.target.closest("#bookmarks") && !e.target.closest("#bookmarkBtn")) closeBookmarks();
    });

    document.body.addEventListener("click", function (e) { var g = e.target.closest("[data-goto]"); if (g) go(g.dataset.goto); });
    window.addEventListener("hashchange", function () { var id = location.hash.replace("#", ""); if (id && id !== current) go(id, false); });
    window.addEventListener("scroll", updateProgress, { passive: true });

    document.addEventListener("keydown", function (e) {
      var searchOpen = document.getElementById("search").classList.contains("show");
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); searchOpen ? closeSearch() : openSearch(); return; }
      if (searchOpen) {
        if (e.key === "Escape") closeSearch();
        else if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) setSel((sel + 1) % results.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) setSel((sel - 1 + results.length) % results.length); }
        else if (e.key === "Enter") { e.preventDefault(); pickResult(sel); }
        return;
      }
      if (e.key === "Escape") closeBookmarks();
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      var p = byId[current]; if (!p) return;
      if (e.key === "ArrowRight" && NAV[p.index + 1]) go(NAV[p.index + 1].id);
      if (e.key === "ArrowLeft" && NAV[p.index - 1]) go(NAV[p.index - 1].id);
    });

    var startId = location.hash.replace("#", "");
    go(byId[startId] ? startId : "cover", false);
  }
  function wire(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
