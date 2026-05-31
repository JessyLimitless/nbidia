/* ============================================================
   AI MATRIX — E-book builder
   Reads the 5 markdown source files, splits into pages,
   converts markdown -> HTML, emits a self-contained index.html.
   Usage:  node build.mjs
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = [
  "AI_MATRIX_book_ch00_ch01.md",
  "AI_MATRIX_book_ch02_ch03.md",
  "AI_MATRIX_book_ch04_ch06.md",
  "AI_MATRIX_book_ch07_ch10.md",
  "AI_MATRIX_book_ch11_epilogue.md",
];
const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV" };
const C0 = "", C1 = ""; // private-use placeholders for inline code

/* ---------------- inline markdown ---------------- */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return C0 + (codes.length - 1) + C1; });
  s = esc(s);
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
  s = s.replace(new RegExp(C0 + "(\\d+)" + C1, "g"), (m, i) => "<code>" + esc(codes[+i]) + "</code>");
  return s;
}

/* ---------------- block markdown ---------------- */
function mdToHtml(md, state) {
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "", i = 0, para = [];
  const flush = () => { if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (/^<br\s*\/?>(\s*<br\s*\/?>)*$/.test(t)) { flush(); i++; continue; }

    if (t.startsWith("```")) {
      flush(); const fence = t.slice(3).trim().toLowerCase(); i++; const buf = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) { buf.push(lines[i]); i++; }
      i++;
      if (fence === "viz") html += renderViz(buf.join("\n"));
      else html += '<pre class="diagram"><code>' + esc(buf.join("\n")) + "</code></pre>";
      continue;
    }

    if (/^-{3,}$/.test(t)) { flush(); html += "<hr>"; i++; continue; }

    const hm = /^(#{2,3})\s+(.*)$/.exec(t);
    if (hm) {
      flush();
      const lvl = hm[1].length, txt = hm[2];
      const isImap = /Investment\s*MAP/i.test(txt);
      if (isImap) state.imapNext = true;
      html += "<h" + lvl + (isImap ? ' class="imap-h"' : "") + ">" + inline(txt) + "</h" + lvl + ">";
      i++; continue;
    }

    if (t.startsWith(">")) {
      flush(); const buf = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (lt.startsWith(">")) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        else if (lt === "" && i + 1 < lines.length && lines[i + 1].trim().startsWith(">")) { buf.push(""); i++; }
        else break;
      }
      const joined = buf.join("\n");
      const isSummary = /^\s*\*\*핵심\s*요약\*\*/.test(buf[0] || "") || /핵심\s*요약/.test(joined.slice(0, 30));
      const inner = mdToHtml(joined, state);
      html += '<blockquote class="' + (isSummary ? "summary" : "note") + '">' + inner + "</blockquote>";
      continue;
    }

    if (t.startsWith("|") && i + 1 < lines.length &&
        /^\|?[\s:|-]+\|/.test(lines[i + 1].trim()) && lines[i + 1].includes("-")) {
      flush(); const buf = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { buf.push(lines[i].trim()); i++; }
      html += renderTable(buf, state);
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      flush(); const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++;
      }
      html += "<ul>" + items.map((x) => "<li>" + inline(x) + "</li>").join("") + "</ul>";
      continue;
    }

    if (t === "") { flush(); i++; continue; }

    para.push(t); i++;
  }
  flush();
  return html;
}

function renderTable(buf, state) {
  const rows = buf.map((r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
  const header = rows[0];
  const body = rows.slice(2);
  const imap = state.imapNext; state.imapNext = false;

  if (imap) {
    const cards = body.map((r) => {
      const title = inline(r[0] || "");
      const fields = r.slice(1).map((c, idx) =>
        '<div class="imap-field"><span class="imap-label">' + inline(header[idx + 1] || "") +
        '</span><span class="imap-val">' + inline(c) + "</span></div>"
      ).join("");
      return '<div class="imap-card"><div class="imap-card-title">' + title + "</div>" + fields + "</div>";
    }).join("");
    return '<div class="imap-grid">' + cards + "</div>";
  }

  return '<div class="table-wrap"><table><thead><tr>' +
    header.map((c) => "<th>" + inline(c) + "</th>").join("") +
    "</tr></thead><tbody>" +
    body.map((r) => "<tr>" + header.map((_, k) => "<td>" + inline(r[k] || "") + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";
}

/* ---------------- visualization (```viz {json}```) ---------------- */
function grp(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  if (!Number.isInteger(n)) return String(n);
  return (n < 0 ? "-" : "") + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmt(v, u) { return (typeof v === "number" ? grp(v) : esc(String(v))) + (u ? (" " + u) : ""); }
let vizSeq = 0;
function svgWrap(w, h, inner) {
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" class="vz" preserveAspectRatio="xMidYMid meet">' + inner + "</svg>";
}
function vizBar(s) {
  const d = s.data || []; const max = Math.max.apply(null, d.map((x) => Math.abs(x.value)).concat([1]));
  const W = 720, rowH = 48, padT = 4, labelW = s.labelW || 200, barX = labelW + 18, barEnd = W - 96, H = padT + d.length * rowH + 6;
  const uid = "bg" + (vizSeq++);
  let g = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--gold)"/><stop offset="1" stop-color="var(--gold-soft)"/></linearGradient></defs>';
  d.forEach((x, i) => {
    const y = padT + i * rowH + rowH / 2;
    const w = Math.max(3, (Math.abs(x.value) / max) * (barEnd - barX));
    g += '<text x="' + labelW + '" y="' + (y + 5) + '" text-anchor="end" class="vz-lbl">' + esc(String(x.label)) + "</text>";
    g += '<rect x="' + barX + '" y="' + (y - 10) + '" rx="6" height="20" width="' + (barEnd - barX) + '" class="vz-track"/>';
    g += '<rect x="' + barX + '" y="' + (y - 10) + '" rx="6" height="20" width="' + w.toFixed(1) + '" ' + (x.hi ? 'fill="url(#' + uid + ')"' : 'class="vz-bar2"') + "/>";
    g += '<text x="' + (barX + w + 11) + '" y="' + (y + 5) + '" class="vz-val' + (x.hi ? " vz-val-hi" : "") + '">' + esc(fmt(x.value, s.unit)) + "</text>";
  });
  return svgWrap(W, H, g);
}
function vizTrend(s) {
  const W = 720, H = 300, padL = 58, padR = 22, padT = 24, padB = 40;
  const x = s.x || [];
  const series = s.series || [{ label: s.label || "", values: s.values || [] }];
  const all = series.reduce((a, se) => a.concat(se.values), []);
  const max = Math.max.apply(null, all.concat([1])), min = Math.min.apply(null, all.concat([0]));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xi = (i) => padL + (x.length <= 1 ? plotW / 2 : (i / (x.length - 1)) * plotW);
  const yi = (v) => padT + plotH - ((v - min) / ((max - min) || 1)) * plotH;
  const uid = "tg" + (vizSeq++);
  let g = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".20"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>';
  [0, plotH].forEach((dy) => { const yy = padT + dy; g += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" class="vz-grid"/>'; });
  g += '<text x="' + (padL - 10) + '" y="' + (padT + 5) + '" text-anchor="end" class="vz-axis">' + esc(grp(Math.round(max))) + "</text>";
  x.forEach((c, i) => { g += '<text x="' + xi(i).toFixed(1) + '" y="' + (H - padB + 24) + '" text-anchor="middle" class="vz-axis">' + esc(String(c)) + "</text>"; });
  series.forEach((se, si) => {
    const main = si === 0, stroke = se.color || (main ? "var(--gold)" : "var(--teal)");
    const pts = se.values.map((v, i) => xi(i).toFixed(1) + "," + yi(v).toFixed(1));
    if (main && se.values.length) g += '<path d="M' + padL + ',' + (padT + plotH) + ' L' + pts.join(" L") + ' L' + xi(se.values.length - 1).toFixed(1) + ',' + (padT + plotH) + ' Z" fill="url(#' + uid + ')"/>';
    g += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + stroke + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    se.values.forEach((v, i) => {
      const end = (i === 0 || i === se.values.length - 1);
      g += '<circle cx="' + xi(i).toFixed(1) + '" cy="' + yi(v).toFixed(1) + '" r="' + (end ? "5" : "3") + '" fill="' + stroke + '"/>';
      if (end) g += '<text x="' + xi(i).toFixed(1) + '" y="' + (yi(v) - 13).toFixed(1) + '" text-anchor="middle" class="vz-val vz-val-hi">' + esc(fmt(v, "")) + "</text>";
    });
    if (main && se.values.length >= 2 && se.values[0] > 0) {
      const rr = se.values[se.values.length - 1] / se.values[0];
      if (rr >= 1.2) g += '<text x="' + (W - padR + 10) + '" y="' + (yi(se.values[se.values.length - 1]) + 4).toFixed(1) + '" class="vz-pill">' + (rr >= 10 ? Math.round(rr) : rr.toFixed(1)) + "×</text>";
    }
  });
  return svgWrap(W, H, g) + legend(series);
}
function legend(series) {
  if (series.length < 2 && !(series[0] && series[0].label)) return "";
  return '<div class="viz-legend">' + series.map((se, si) =>
    '<span class="vl-item"><i style="background:' + (se.color || (si === 0 ? "var(--gold)" : "var(--teal)")) + '"></i>' + esc(se.label || "") + "</span>").join("") + "</div>";
}
function vizDonut(s) {
  const pct = Math.max(0, Math.min(100, +s.value || 0));
  const r = 92, sw = 18, c = 2 * Math.PI * r, on = c * pct / 100;
  const uid = "dg" + (vizSeq++);
  let g = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--gold)"/><stop offset="1" stop-color="var(--navy)"/></linearGradient></defs>';
  g += '<circle cx="130" cy="130" r="92" fill="none" class="vz-track-r" stroke-width="' + sw + '"/>';
  g += '<circle cx="130" cy="130" r="92" fill="none" stroke="url(#' + uid + ')" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + on.toFixed(1) + " " + (c - on).toFixed(1) + '" transform="rotate(-90 130 130)"/>';
  g += '<text x="130" y="150" text-anchor="middle" class="vz-big" fill="url(#' + uid + ')">' + pct + '<tspan class="vz-pct">%</tspan></text>';
  const cap = s.label ? '<div class="vz-donut-lbl">' + inline(String(s.label)) + "</div>" : "";
  return '<div class="vz-donut-wrap">' + svgWrap(260, 260, g) + cap + "</div>";
}
function vizStat(s) {
  const items = s.data || [];
  return '<div class="viz-stats">' + items.map((x) =>
    '<div class="viz-stat"><div class="vs-val">' + inline(String(x.value)) + '</div><div class="vs-lbl">' + inline(String(x.label)) + "</div>" +
    (x.sub ? '<div class="vs-sub">' + inline(String(x.sub)) + "</div>" : "") + "</div>").join("") + "</div>";
}

/* ---- slide-style (content structure) ---- */
// shift: concept diagram — the center of gravity moves from A to B
function vizShift(s) {
  const box = (o, cls) => '<div class="sh-box ' + cls + '"><b class="sh-name">' + inline(String((o && o.label) || "")) + "</b>" +
    ((o && o.sub) ? '<span class="sh-sub">' + inline(String(o.sub)) + "</span>" : "") + "</div>";
  return '<div class="viz-shift">' +
    (s.title ? '<div class="sh-head">' + inline(String(s.title)) + "</div>" : "") +
    '<div class="sh-row">' + box(s.from, "sh-from") +
      '<div class="sh-arrow">' + (s.metric ? '<span class="sh-metric">' + inline(String(s.metric)) + "</span>" : "") +
        '<span class="sh-line"></span>' + (s.metricLabel ? '<span class="sh-mlabel">' + inline(String(s.metricLabel)) + "</span>" : "") + "</div>" +
      box(s.to, "sh-to") + "</div>" +
    (s.note ? '<div class="sh-note">' + inline(String(s.note)) + "</div>" : "") +
  "</div>";
}
// flywheel: concept diagram — a self-reinforcing loop that strengthens as it turns
function vizFlywheel(s) {
  const nodes = (s.nodes || []).map((n, i) => '<div class="fw-node">' + '<span class="fw-n">' + (i + 1) + "</span>" + inline(String(n)) + "</div>");
  return '<div class="viz-flywheel">' +
    (s.title ? '<div class="fw-head">' + inline(String(s.title)) + "</div>" : "") +
    '<div class="fw-loop">' + nodes.join('<span class="fw-arrow"></span>') + "</div>" +
    '<div class="fw-return"><span class="fw-spin">↻</span>' + inline(String(s.center || "돌수록 강해진다")) + "</div>" +
  "</div>";
}
// lever: concept diagram — tiny share, total bottleneck (disproportion)
function vizLever(s) {
  const bar = (o, cls) => {
    const v = Math.max(0, Math.min(100, +(o && o.value) || 0));
    return '<div class="lv-item ' + cls + '"><div class="lv-top"><span class="lv-lbl">' + inline(String((o && o.label) || "")) +
      '</span><span class="lv-val">' + inline(String((o && o.display) || (v + "%"))) + "</span></div>" +
      '<div class="lv-track"><div class="lv-fill" style="width:' + v + '%"></div></div></div>';
  };
  return '<div class="viz-lever">' +
    (s.title ? '<div class="lv-head">' + inline(String(s.title)) + "</div>" : "") +
    bar(s.left, "lv-small") + (s.conn ? '<div class="lv-conn">' + inline(String(s.conn)) + "</div>" : '<div class="lv-conn">그런데</div>') + bar(s.right, "lv-hi") +
    (s.note ? '<div class="lv-note">' + inline(String(s.note)) + "</div>" : "") +
  "</div>";
}
// tollgate: concept diagram — uncertain bets funnel through one certain toll gate
function vizTollgate(s) {
  const bets = (s.bets || []).map((b) => '<span class="tg-bet">' + inline(String(b)) + "</span>").join("");
  const items = (s.gateItems || []).map((g) => '<span class="tg-item">' + inline(String(g)) + "</span>").join("");
  return '<div class="viz-tollgate">' +
    (s.title ? '<div class="tg-head">' + inline(String(s.title)) + "</div>" : "") +
    '<div class="tg-bets">' + bets + "</div>" +
    (s.betLabel ? '<div class="tg-betlabel">' + inline(String(s.betLabel)) + "</div>" : "") +
    '<div class="tg-funnel"><span class="tg-fl"></span></div>' +
    '<div class="tg-gate"><div class="tg-gate-label">' + inline(String(s.gate || "통행세 게이트")) + "</div>" +
      (items ? '<div class="tg-gate-items">' + items + "</div>" : "") + "</div>" +
    (s.result ? '<div class="tg-out"><span class="tg-down"></span><span class="tg-result">' + inline(String(s.result)) + "</span></div>" : "") +
  "</div>";
}
// chainmap: AI ecosystem investment map. rows:[{band}|{tag,seg,role,toll,us[],kr[],etc[]}]
function vizChainmap(s) {
  const rows = s.rows || [];
  const note = s.note ? '<div class="cm-note">' + inline(s.note) + "</div>" : "";
  const chip = (n, side) => '<span class="cm-node cm-' + side + '">' + inline(String(n)) + "</span>";
  const nodes = (arr, side) => (arr && arr.length) ? arr.map((n) => chip(n, side)).join("") : '<span class="cm-dash">·</span>';
  const bandClass = (t) => /통행세/.test(t) ? " cm-band-toll" : /다음 병목/.test(t) ? " cm-band-next" : /프론티어/.test(t) ? " cm-band-frontier" : "";
  let cells =
    '<div class="cm-h cm-h-seg">밸류체인 구간</div>' +
    '<div class="cm-h cm-h-us">미국</div>' +
    '<div class="cm-h cm-h-kr">한국</div>';
  for (const r of rows) {
    if (r.band) { cells += '<div class="cm-band' + bandClass(String(r.band)) + '">' + inline(String(r.band)) + "</div>"; continue; }
    const tc = r.toll ? " is-toll" : "";
    cells +=
      '<div class="cm-c cm-seg' + tc + '">' +
        '<div class="cm-seghead"><span class="cm-tag">' + inline(String(r.tag || "")) + "</span>" + (r.toll ? '<span class="cm-toll">통행세</span>' : "") + "</div>" +
        '<b class="cm-segname">' + inline(String(r.seg || "")) + "</b>" +
        (r.role ? '<span class="cm-role">' + inline(String(r.role)) + "</span>" : "") +
      "</div>" +
      '<div class="cm-c cm-cell-us' + tc + '"><div class="cm-nodes">' + nodes(r.us, "us") + "</div></div>" +
      '<div class="cm-c cm-cell-kr' + tc + '"><div class="cm-nodes">' + nodes(r.kr, "kr") +
        ((r.etc && r.etc.length) ? '<div class="cm-etc">해외 · ' + r.etc.map((e) => inline(String(e))).join(" · ") + "</div>" : "") +
      "</div></div>";
  }
  return '<div class="viz-chainmap">' + note + '<div class="cm-grid">' + cells + "</div></div>";
}
// layers: stacked bands top->bottom. data:[{tag,label,desc,hi}]
function vizLayers(s) {
  const d = s.data || [];
  return '<div class="viz-layers">' + d.map((x, i) =>
    '<div class="vl-band' + (x.hi ? " is-hi" : "") + '">' +
      (x.tag ? '<span class="vl-tag">' + inline(String(x.tag)) + "</span>" : "") +
      '<span class="vl-body"><b class="vl-name">' + inline(String(x.label || "")) + "</b>" +
      (x.desc ? '<span class="vl-desc">' + inline(String(x.desc)) + "</span>" : "") + "</span>" +
    "</div>").join("") + "</div>";
}
// flow: process/causal steps. data:[{label,desc}]
function vizFlow(s) {
  const d = s.data || [], dir = s.dir === "v" ? "v" : "h";
  const steps = d.map((x, i) =>
    '<div class="vf-step' + (x.hi ? " is-hi" : "") + '">' +
      (x.k ? '<span class="vf-k">' + inline(String(x.k)) + "</span>" : "") +
      '<b class="vf-lbl">' + inline(String(x.label || "")) + "</b>" +
      (x.desc ? '<span class="vf-desc">' + inline(String(x.desc)) + "</span>" : "") +
    "</div>");
  return '<div class="viz-flow vf-' + dir + '">' + steps.join('<span class="vf-arrow" aria-hidden="true"></span>') + "</div>";
}
// compare: side-by-side columns. cols:[{head,sub,items:[],tone:"hot|cool"}]
function vizCompare(s) {
  const cols = s.cols || [];
  return '<div class="viz-compare" style="--vc-n:' + cols.length + '">' + cols.map((c) =>
    '<div class="vc-col vc-' + (c.tone === "hot" ? "hot" : c.tone === "cool" ? "cool" : "neutral") + '">' +
      '<div class="vc-head">' + inline(String(c.head || "")) + "</div>" +
      (c.sub ? '<div class="vc-sub">' + inline(String(c.sub)) + "</div>" : "") +
      '<ul class="vc-list">' + (c.items || []).map((it) => "<li>" + inline(String(it)) + "</li>").join("") + "</ul>" +
    "</div>").join('<div class="vc-vs">vs</div>') + "</div>";
}
// callout: thesis slide. kicker, lead, points:[]
function vizCallout(s) {
  return '<div class="viz-callout">' +
    (s.kicker ? '<div class="vco-kicker">' + inline(String(s.kicker)) + "</div>" : "") +
    '<div class="vco-lead">' + inline(String(s.lead || s.title || "")) + "</div>" +
    ((s.points && s.points.length) ? '<ul class="vco-points">' + s.points.map((p) => "<li>" + inline(String(p)) + "</li>").join("") + "</ul>" : "") +
    "</div>";
}
// quadrant: 2x2 matrix. x:[left,right], y:[top,bottom], cells:[tl,tr,bl,br]{title,items,hi}
function vizQuadrant(s) {
  const x = s.x || ["", ""], y = s.y || ["", ""], c = s.cells || [];
  const cell = (q) => {
    const o = c[q] || {};
    return '<div class="vq-cell' + (o.hi ? " is-hi" : "") + '">' +
      '<b class="vq-title">' + inline(String(o.title || "")) + "</b>" +
      (o.items ? '<ul class="vq-list">' + o.items.map((it) => "<li>" + inline(String(it)) + "</li>").join("") + "</ul>" : "") +
    "</div>";
  };
  return '<div class="viz-quadrant">' +
    '<div class="vq-xhead"><span>' + inline(String(x[0])) + "</span><span>" + inline(String(x[1])) + "</span></div>" +
    '<div class="vq-main">' +
      '<div class="vq-yhead"><span>' + inline(String(y[0])) + "</span><span>" + inline(String(y[1])) + "</span></div>" +
      '<div class="vq-grid">' + cell(0) + cell(1) + cell(2) + cell(3) + "</div>" +
    "</div>" +
  "</div>";
}
function renderViz(raw) {
  let s; try { s = JSON.parse(raw); } catch (e) { return '<pre class="diagram"><code>' + esc(raw) + "</code></pre>"; }
  const t = s.type || "bar";
  let body =
    t === "trend" ? vizTrend(s) :
    t === "donut" ? vizDonut(s) :
    t === "stat" ? vizStat(s) :
    t === "layers" ? vizLayers(s) :
    t === "flow" ? vizFlow(s) :
    t === "compare" ? vizCompare(s) :
    t === "callout" ? vizCallout(s) :
    t === "quadrant" ? vizQuadrant(s) :
    t === "chainmap" ? vizChainmap(s) :
    t === "tollgate" ? vizTollgate(s) :
    t === "shift" ? vizShift(s) :
    t === "flywheel" ? vizFlywheel(s) :
    t === "lever" ? vizLever(s) :
    vizBar(s);
  const title = (s.title && !["callout", "tollgate", "shift", "flywheel", "lever"].includes(t)) ? '<div class="viz-title">' + inline(s.title) + "</div>" : "";
  const cap = (s.note ? '<span class="viz-note">' + inline(s.note) + "</span>" : "") + (s.source ? '<span class="viz-src">출처 · ' + inline(s.source) + "</span>" : "");
  return '<figure class="viz viz-' + t + '">' + title + body + (cap ? "<figcaption>" + cap + "</figcaption>" : "") + "</figure>";
}

/* ---------------- cleaning ---------------- */
function cleanBody(body) {
  let lines = body.replace(/\r/g, "").split("\n");
  lines = lines.filter((l) => !/^\*다음/.test(l.trim()));
  const isJunk = (l) => { const t = l.trim(); return t === "" || /^-{3,}$/.test(t) || /^<br\s*\/?>(\s*<br\s*\/?>)*$/.test(t); };
  while (lines.length && isJunk(lines[0])) lines.shift();
  while (lines.length && isJunk(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}
function readingTime(body) {
  const plain = body.replace(/[#>*`|\-]/g, "").replace(/\s+/g, "");
  return Math.max(1, Math.round(plain.length / 480));
}

/* ---------------- split into pages ---------------- */
const srcDir = path.join(__dir, "src");
const combined = fs.existsSync(srcDir)
  ? fs.readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort()
      .map((f) => fs.readFileSync(path.join(srcDir, f), "utf8")).join("\n\n")
  : SRC.map((f) => fs.readFileSync(path.join(__dir, f), "utf8")).join("\n\n");
const segments = combined.split(/\n(?=# )/);

const pages = [];
let curPart = 0;

for (const seg of segments) {
  const nl = seg.indexOf("\n");
  const h1 = seg.slice(0, nl < 0 ? seg.length : nl).replace(/^#\s+/, "").trim();
  const body = nl < 0 ? "" : seg.slice(nl + 1);

  if (/^AI MATRIX$/.test(h1)) continue;                  // cover handled separately
  if (/AI MATRIX\s*—.*계속/.test(h1)) continue;          // "...계속" wrappers -> skip

  let m;
  if (/^프롤로그/.test(h1)) {
    const title = h1.split("|")[1] ? h1.split("|")[1].trim() : h1;
    pages.push({ type: "prologue", id: "prologue", tocTitle: title, html: mdToHtml(cleanBody(body), { imapNext: false }) });
  } else if (/^에필로그/.test(h1)) {
    const title = h1.split("|")[1] ? h1.split("|")[1].trim() : h1;
    pages.push({ type: "epilogue", id: "epilogue", tocTitle: title, html: mdToHtml(cleanBody(body), { imapNext: false }) });
  } else if ((m = /제\s*([1-4])\s*부/.exec(h1))) {
    const n = +m[1];
    curPart = n;
    let desc = "";
    if (h1.includes("|")) desc = h1.split("|")[1].trim();
    else desc = h1.replace(/^AI MATRIX\s*—\s*/, "").replace(/제\s*[1-4]\s*부\s*/, "").trim();
    const shortDesc = desc.split(/[:：]/)[0].trim();
    pages.push({
      type: "part", id: "part-" + n, part: n, roman: ROMAN[n],
      partDesc: desc, shortDesc: shortDesc,
      tocLabel: "제" + n + "부",
      introHtml: mdToHtml(cleanBody(body), { imapNext: false }),
    });
  } else if ((m = /^(\d+)\s*장/.exec(h1))) {
    const n = +m[1];
    const titleFull = h1.includes("|") ? h1.split("|").slice(1).join("|").trim() : h1;
    const clean = cleanBody(body);
    pages.push({
      type: "chapter", id: "ch-" + n, chap: n, part: curPart, partRoman: ROMAN[curPart] || "",
      tocLabel: n + "장", tocTitle: titleFull,
      reading: readingTime(clean),
      html: mdToHtml(clean, { imapNext: false }),
    });
  }
}

/* attach chapter lists to part pages */
for (const p of pages) {
  if (p.type === "part") p.chapters = pages.filter((c) => c.type === "chapter" && c.part === p.part);
}

/* ---------------- build ordered NAV (cover first) ---------------- */
const cover = { type: "cover", id: "cover" };
const ordered = [cover, ...pages];

const NAV = ordered.map((p) => {
  const o = { id: p.id, type: p.type };
  if (p.type === "chapter") { o.chap = p.chap; o.part = p.part; o.partRoman = p.partRoman; o.tocLabel = p.tocLabel; o.tocTitle = p.tocTitle; }
  if (p.type === "part") { o.part = p.part; o.roman = p.roman; o.shortDesc = p.shortDesc; o.tocLabel = p.tocLabel; }
  if (p.type === "prologue" || p.type === "epilogue") o.tocTitle = p.tocTitle;
  return o;
});

/* ---------------- render sections ---------------- */
function coverSection() {
  return `<section class="page" id="page-cover" data-id="cover">
  <div class="page-inner"><div class="cover">
    <canvas id="matrix"></canvas>
    <div class="cover-veil"></div>
    <div class="cover-content">
      <div class="cover-eyebrow">인공지능 생태계 역설계 보고서</div>
      <h1 class="cover-title">AI&nbsp;MATRIX</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub">인공지능 생태계의 중력장과<br>돈이 흐르는 길목들</p>
      <p class="cover-tag">인프라 변곡점부터 피지컬 AI, 에이전트 보안까지<br>— 테크 자본을 선점하는 역설계 투자법</p>
      <div class="cover-epigraph">“이 책은 AI 투자 전망서가 아니다.<br>AI 생태계의 물리적 구조를 해부하는 역설계 보고서다.”</div>
      <div class="cover-actions">
        <button class="cover-start" data-goto="prologue">읽기 시작 <span class="arr">→</span></button>
        <button class="cover-resume" id="resumeBtn"><span class="rt">이어 읽기</span> <span class="arr">→</span></button>
      </div>
      <div class="cover-date">2026 · MAY</div>
    </div>
  </div></div>
</section>`;
}

function chapterHead(p) {
  return `<div class="ch-head">
    <div class="ch-kicker"><span class="dot"></span>PART ${p.partRoman} · <span class="ch-num">${p.chap}장</span></div>
    <h1 class="ch-title">${inline(p.tocTitle)}</h1>
    <div class="ch-meta">읽기 <b>${p.reading}분</b> · AI MATRIX</div>
  </div>`;
}
function specialHead(kicker, title) {
  return `<div class="ch-head">
    <div class="ch-kicker"><span class="dot"></span>${kicker}</div>
    <h1 class="ch-title">${inline(title)}</h1>
  </div>`;
}

function partSection(p) {
  const chaps = (p.chapters || []).map((c) =>
    `<div class="part-ch" data-goto="${c.id}">
       <span class="pc-num">${c.chap}장</span>
       <span class="pc-title">${inline(c.tocTitle)}</span>
       <span class="pc-arr">→</span>
     </div>`).join("");
  return `<section class="page" id="page-${p.id}" data-id="${p.id}">
    <div class="page-inner"><div class="part">
      <div class="part-kicker">PART</div>
      <div class="part-roman">${p.roman}</div>
      <h2 class="part-title">${inline(p.partDesc)}</h2>
      ${p.introHtml ? '<div class="part-desc-wrap prose">' + p.introHtml.replace(/<blockquote class="note">([\s\S]*?)<\/blockquote>/, '<div class="part-desc">$1</div>') + "</div>" : ""}
      <div class="part-chapters">${chaps}</div>
    </div></div>
  </section>`;
}

function contentSection(p, headHtml) {
  return `<section class="page" id="page-${p.id}" data-id="${p.id}">
    <div class="page-inner">
      ${headHtml}
      <div class="prose">${p.html}</div>
    </div>
  </section>`;
}

let sectionsHtml = coverSection();
for (const p of pages) {
  if (p.type === "part") sectionsHtml += "\n" + partSection(p);
  else if (p.type === "chapter") sectionsHtml += "\n" + contentSection(p, chapterHead(p));
  else if (p.type === "prologue") sectionsHtml += "\n" + contentSection(p, specialHead("PROLOGUE", p.tocTitle));
  else if (p.type === "epilogue") sectionsHtml += "\n" + contentSection(p, specialHead("EPILOGUE", p.tocTitle));
}

/* ---------------- assemble index.html ---------------- */
const css = fs.readFileSync(path.join(__dir, "assets", "app.css"), "utf8");
const js = fs.readFileSync(path.join(__dir, "assets", "app.js"), "utf8");

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AI MATRIX — 인공지능 생태계의 중력장과 돈이 흐르는 길목들</title>
<meta name="description" content="AI 생태계의 물리적 구조를 해부하는 역설계 투자 보고서. 인프라 변곡점부터 피지컬 AI까지, 자본이 흐르는 길목을 선점하는 법.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
${css}
</style>
</head>
<body>
<div id="progress"></div>

<header id="topbar">
  <div id="menuBtn" aria-label="목차 열기">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </div>
  <div class="tb-wrap">
    <span class="tb-kicker"></span>
    <span class="tb-title"></span>
  </div>
  <div class="tb-tools">
    <button class="tb-btn" id="searchBtn" aria-label="검색"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span class="k">⌘K</span></button>
    <button class="tb-btn" id="fontDec" aria-label="글자 작게">A−</button>
    <button class="tb-btn" id="fontInc" aria-label="글자 크게">A+</button>
    <button class="tb-btn" id="themeBtn" aria-label="라이트/다크 전환">☾</button>
    <button class="tb-btn" id="bookmarkBtn" aria-label="북마크"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1z"/></svg><span class="tb-badge" id="bmBadge"></span></button>
  </div>
  <span class="tb-brand">AI MATRIX</span>
</header>

<nav id="sidebar">
  <div class="sb-head">
    <div class="sb-logo">AI MATRIX</div>
    <div class="sb-sub">인공지능 생태계의 중력장과<br>돈이 흐르는 길목들</div>
  </div>
  <div class="sb-scroll"></div>
  <div class="sb-foot">
    <button id="pdfBtn" aria-label="PDF로 저장">⎙ PDF로 저장</button>
    <a id="epubLink" href="AI_MATRIX.epub" download>⤓ EPUB</a>
  </div>
</nav>
<div id="overlay"></div>

<div id="search" role="dialog" aria-modal="true">
  <div class="search-box">
    <div class="search-top">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="searchInput" type="text" placeholder="제목·소제목·본문 검색…" autocomplete="off" spellcheck="false">
      <span class="search-esc">ESC</span>
    </div>
    <div class="search-results" id="searchResults"></div>
  </div>
</div>

<div id="bookmarks">
  <div class="bm-head"><span class="bm-title">북마크</span><button class="bm-add" id="bmAdd">+ 현재 위치 추가</button></div>
  <div class="bm-list" id="bmList"></div>
</div>

<main id="reader">
${sectionsHtml}
</main>

<script>
window.__NAV__ = ${JSON.stringify(NAV)};
</script>
<script>
${js}
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dir, "index.html"), html, "utf8");

/* ---------------- EPUB ---------------- */
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (c ^ 0xFFFFFFFF) >>> 0; }
function zipArchive(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const crc = crc32(raw), comp = f.store ? raw : zlib.deflateRawSync(raw), m = f.store ? 0 : 8;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(m, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(m, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    central.push(ch, name); off += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat(parts.concat([cd, end]));
}
function epubSan(h) { return h.replace(/<svg[\s\S]*?<\/svg>/g, '<p class="fig-note">[도표 — 웹 버전에서 확인]</p>').replace(/<hr\s*\/?>/g, "<hr/>").replace(/<br\s*\/?>/g, "<br/>"); }
function xdoc(title, inner) { return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" lang="ko"><head><meta charset="utf-8"/><title>' + esc(title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' + inner + "</body></html>"; }
function buildEpub() {
  const items = [{ file: "cover.xhtml", title: "표지", xhtml: xdoc("AI MATRIX", '<div class="epub-cover"><p class="ce">인공지능 생태계 역설계 보고서</p><h1>AI MATRIX</h1><p class="cs">인공지능 생태계의 중력장과 돈이 흐르는 길목들</p></div>') }];
  let n = 0;
  for (const p of pages) {
    n++; const file = "p" + String(n).padStart(2, "0") + ".xhtml"; let title, inner;
    if (p.type === "chapter") { title = p.chap + "장 · " + p.tocTitle; inner = "<h1>" + esc(title) + "</h1>" + epubSan(p.html); }
    else if (p.type === "part") { title = "PART " + p.roman + " — " + p.partDesc; inner = "<h1>PART " + esc(p.roman) + "</h1><h2>" + esc(p.partDesc) + "</h2>" + epubSan(p.introHtml || ""); }
    else if (p.type === "prologue") { title = "프롤로그"; inner = "<h1>프롤로그</h1>" + epubSan(p.html); }
    else if (p.type === "epilogue") { title = "에필로그"; inner = "<h1>에필로그</h1>" + epubSan(p.html); }
    else continue;
    items.push({ file, title, xhtml: xdoc(title, inner) });
  }
  const nav = xdoc("목차", '<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc" id="toc"><h1>목차</h1><ol>' +
    items.slice(1).map((it) => '<li><a href="' + it.file + '">' + esc(it.title) + "</a></li>").join("") + "</ol></nav>");
  const opf = '<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:ai-matrix-ebook-2026</dc:identifier><dc:title>AI MATRIX</dc:title><dc:language>ko</dc:language><dc:creator>AI MATRIX</dc:creator></metadata><manifest>' +
    items.map((it, i) => '<item id="x' + i + '" href="' + it.file + '" media-type="application/xhtml+xml"/>').join("") +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine>' +
    items.map((it, i) => '<itemref idref="x' + i + '"/>').join("") + "</spine></package>";
  const css = "body{font-family:serif;line-height:1.8;margin:5%;color:#1c2128;}h1{font-size:1.6em;color:#0e2a52;border-bottom:2px solid #a9821a;padding-bottom:.3em;}h2{color:#0e2a52;}h3{color:#11707c;}table{border-collapse:collapse;width:100%;font-size:.9em;margin:1em 0;}th,td{border:1px solid #ccc;padding:6px;text-align:left;}th{background:#f6f0dd;}blockquote{border-left:3px solid #a9821a;margin:1em 0;padding:.6em 1em;background:#faf9f6;}code{background:#eee;padding:0 .2em;}.imap-card{border:1px solid #ccc;border-radius:8px;padding:10px 12px;margin:10px 0;}.imap-card-title{font-weight:bold;color:#0e2a52;}.imap-label{font-size:.72em;color:#a9821a;text-transform:uppercase;display:block;}.fig-note{color:#999;font-style:italic;}.epub-cover{text-align:center;margin-top:22%;}.epub-cover h1{font-size:3em;border:none;}.epub-cover .ce{letter-spacing:.3em;color:#a9821a;font-size:.8em;}.epub-cover .cs{color:#234574;}";
  const files = [
    { name: "mimetype", data: "application/epub+zip", store: true },
    { name: "META-INF/container.xml", data: '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/nav.xhtml", data: nav },
    { name: "OEBPS/style.css", data: css },
  ].concat(items.map((it) => ({ name: "OEBPS/" + it.file, data: it.xhtml })));
  fs.writeFileSync(path.join(__dir, "AI_MATRIX.epub"), zipArchive(files));
}
buildEpub();

/* ---------------- report ---------------- */
const stat = fs.statSync(path.join(__dir, "index.html"));
console.log("OK  index.html generated  (" + (stat.size / 1024).toFixed(0) + " KB)");
console.log("    pages: " + ordered.length + "  (cover + " + pages.length + ")");
console.log("    " + pages.filter(p => p.type === "chapter").length + " chapters, " +
  pages.filter(p => p.type === "part").length + " parts");
