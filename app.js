/* 台股結構掃描 — 純前端，無建置步驟，直接以靜態檔部署。
 * 資料來源 FinMind；指標全部在瀏覽器內計算。
 */
"use strict";

const FINMIND = "https://api.finmindtrade.com/api/v4/data";
const LS_TOKEN = "twscan.finmind_token";
const LS_WATCH = "twscan.watch";
const LS_THEME = "twscan.theme";

const TOP50 = ["2330","2317","2454","2308","2303","2881","2882","2891","2892","2886","2885","2884","5880","2880","2887","2002","1301","1303","1326","1216","2207","2603","2615","2618","2629","2412","3711","3034","3037","6669","2379","2382","2357","3231","3661","3443","2345","2356","2360","2395","2408","3008","6415","1590","2049","2105","2327","2376","2883","2889"];
const HOT = [["2330","台積電"],["2317","鴻海"],["2454","聯發科"],["2303","聯電"],["2891","中信金"]];
const NAME_FALLBACK = {2330:"台積電",2317:"鴻海",2454:"聯發科",2308:"台達電",2303:"聯電",2881:"富邦金",2882:"國泰金",2891:"中信金",2892:"第一金",2886:"兆豐金",2885:"元大金",2884:"玉山金",5880:"合庫金",2412:"中華電",2603:"長榮",2002:"中鋼",1216:"統一",1301:"台塑",3711:"日月光投控",6669:"緯穎",2382:"廣達",2357:"華碩",3231:"緯創"};

const memCache = new Map();
const $ = (id) => document.getElementById(id);

/* ---------- 基礎 ---------- */
function fmtDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}
function addDays(base, n) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + n);
  return d;
}
function fmtNum(n, digits) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-Hant", { maximumFractionDigits: digits ?? 2, minimumFractionDigits: digits ?? 2 });
}
function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("zh-Hant");
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function getToken() { return localStorage.getItem(LS_TOKEN) || ""; }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function finmind(dataset, dataId, startDate, endDate, { force = false } = {}) {
  const token = getToken();
  const key = dataset + "|" + dataId + "|" + startDate + "|" + endDate + "|" + (token ? "t" : "a");
  if (!force && memCache.has(key)) return memCache.get(key);
  const params = new URLSearchParams({ dataset, data_id: dataId, start_date: startDate, end_date: endDate });
  if (token) params.set("token", token);
  const res = await fetch(FINMIND + "?" + params.toString());
  if (!res.ok) throw new Error("FinMind HTTP " + res.status + "（" + dataset + "）");
  const j = await res.json();
  if (j.status !== 200) throw new Error("FinMind 回傳異常：" + esc(j.msg || j.status));
  memCache.set(key, j.data || []);
  return j.data || [];
}

/* ---------- 指標 ---------- */
function ma(arr, n) {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}
function ema(arr, n) {
  const out = new Array(arr.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    prev = prev === null ? arr[i] : arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < n + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / n, al = l / n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}
function kd(highs, lows, closes, n = 9) {
  const K = new Array(closes.length).fill(null);
  const D = new Array(closes.length).fill(null);
  let k = 50, d = 50;
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) continue;
    const hh = Math.max(...highs.slice(i - n + 1, i + 1));
    const ll = Math.min(...lows.slice(i - n + 1, i + 1));
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    K[i] = k; D[i] = d;
  }
  return { K, D };
}
function macd(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const dif = closes.map((_, i) => e12[i] - e26[i]);
  const dea = ema(dif, 9);
  const hist = dif.map((v, i) => (v - dea[i]) * 2);
  return { dif, dea, hist };
}

/* ---------- 分析 ---------- */
async function resolveName(code, force) {
  if (NAME_FALLBACK[code]) return NAME_FALLBACK[code];
  try {
    const end = fmtDate(new Date());
    const rows = await finmind("TaiwanStockInfo", code, "2024-01-01", end, { force });
    if (rows && rows.length) return rows[rows.length - 1].stock_name || code;
  } catch (e) { /* 忽略，用代號顯示 */ }
  return code;
}

async function analyze(code, { force = false } = {}) {
  code = String(code).trim();
  if (!/^\d{4}[A-Z]?$/.test(code)) throw new Error("代號格式不正確：" + code);
  const end = fmtDate(new Date());
  const start = fmtDate(addDays(new Date(), -420));
  const [price, inst] = await Promise.all([
    finmind("TaiwanStockPrice", code, start, end, { force }),
    finmind("TaiwanStockInstitutionalInvestorsBuySell", code, start, end, { force }),
  ]);
  if (!price.length) throw new Error(code + " 查無股價資料（可能代號錯誤或已下市）");
  price.sort((a, b) => a.date < b.date ? -1 : 1);
  const closes = price.map((r) => r.close);
  const highs = price.map((r) => r.max);
  const lows = price.map((r) => r.min);
  const vols = price.map((r) => r.Trading_Volume);
  const last = price[price.length - 1];
  const prev = price[price.length - 2] || last;

  const ma5 = ma(closes, 5), ma10 = ma(closes, 10), ma20 = ma(closes, 20), ma60 = ma(closes, 60);
  const rsiArr = rsi(closes, 14);
  const { K, D } = kd(highs, lows, closes);
  const { dif, dea, hist } = macd(closes);
  const i = closes.length - 1;

  // 法人：按日彙總
  const byDate = {};
  for (const r of inst) {
    const d = r.date;
    byDate[d] = byDate[d] || { foreign: 0, trust: 0, dealer: 0 };
    if (r.name === "Foreign_Investor") byDate[d].foreign += (r.buy - r.sell);
    else if (r.name === "Investment_Trust") byDate[d].trust += (r.buy - r.sell);
    else byDate[d].dealer += (r.buy - r.sell);
  }
  const dates = Object.keys(byDate).sort();
  const lastDays = dates.slice(-12).map((d) => ({ date: d, ...byDate[d] }));
  const sum5 = (k) => dates.slice(-5).reduce((s, d) => s + byDate[d][k], 0);
  const streak = (k) => {
    let n = 0;
    for (let j = dates.length - 1; j >= 0; j--) {
      const v = byDate[dates[j]][k];
      if (n === 0) { if (v === 0) break; n = v > 0 ? 1 : -1; }
      else if ((n > 0 && v > 0) || (n < 0 && v < 0)) n += v > 0 ? 1 : -1;
      else break;
    }
    return n;
  };
  const fStreak = streak("foreign"), tStreak = streak("trust");

  const bias20 = ma20[i] ? ((closes[i] - ma20[i]) / ma20[i]) * 100 : null;
  const win60 = closes.slice(Math.max(0, i - 59));
  const hi60 = Math.max(...win60), lo60 = Math.min(...win60);
  const pos60 = hi60 === lo60 ? 50 : ((closes[i] - lo60) / (hi60 - lo60)) * 100;
  const drawdown = hi60 ? ((closes[i] - hi60) / hi60) * 100 : 0;
  const winYear = closes.slice(Math.max(0, i - 239));
  const hiY = Math.max(...winYear), loY = Math.min(...winYear);
  const posY = hiY === loY ? 50 : ((closes[i] - loY) / (hiY - loY)) * 100;

  // 六維度評分（0–6）
  const dims = [];
  const histUp3 = hist[i] > 0 && hist[i - 1] > 0 && hist[i - 2] > 0 && hist[i] >= hist[i - 1] && hist[i - 1] >= hist[i - 2];
  dims.push({ key: "MACD 柱狀", score: hist[i] > 0 ? (histUp3 ? 1 : 0.5) : 0, desc: "柱狀值 " + fmtNum(hist[i]) + (histUp3 ? "，連續擴張" : hist[i] > 0 ? "，翻紅但未連續擴張" : "，翻空") });
  const gold = (K[i] !== null && D[i] !== null && K[i - 1] !== null && D[i - 1] !== null && K[i - 1] <= D[i - 1] && K[i] > D[i]);
  const macdGold = dif[i - 1] <= dea[i - 1] && dif[i] > dea[i];
  dims.push({ key: "DIF/DEA", score: (macdGold || (dif[i] > dea[i] && dif[i] > 0)) ? 1 : (dif[i] > dea[i] ? 0.5 : 0), desc: "DIF " + fmtNum(dif[i]) + " / DEA " + fmtNum(dea[i]) + (macdGold ? "，剛形成金叉" : dif[i] > dea[i] ? "，DIF 在 DEA 之上" : "，DIF 在 DEA 之下") });
  dims.push({ key: "零軸格局", score: (dif[i] > 0 && dea[i] > 0) ? 1 : 0, desc: (dif[i] > 0 && dea[i] > 0) ? "DIF、DEA 同在零軸之上" : "尚未站上零軸" });
  const instScore = ((fStreak >= 3 || tStreak >= 3) ? 1 : 0) + ((fStreak > 0 && tStreak > 0) ? 0.5 : 0);
  dims.push({ key: "法人連買", score: Math.min(instScore, 1.5), desc: "外資連 " + fStreak + " 日、投信連 " + tStreak + " 日" });
  const bull = ma5[i] && ma10[i] && ma20[i] && ma5[i] > ma10[i] && ma10[i] > ma20[i] && closes[i] > ma5[i];
  dims.push({ key: "均線結構", score: bull ? 1 : 0, desc: bull ? "MA5 > MA10 > MA20 且收在 MA5 之上" : "非完全多頭排列" });
  dims.push({ key: "KD", score: gold ? 1 : (K[i] > D[i] ? 0.5 : 0), desc: "K " + fmtNum(K[i], 1) + " / D " + fmtNum(D[i], 1) + (gold ? "，剛形成金叉" : K[i] > D[i] ? "，K 在 D 之上" : "，K 在 D 之下") });
  const total = dims.reduce((s, d) => s + Math.min(d.score, 1), 0) + Math.max(0, Math.min(instScore, 1.5) - 1);

  let verdict, tone;
  if (total >= 5) { verdict = "結構強勢"; tone = "good"; }
  else if (total >= 4) { verdict = "偏多"; tone = "good"; }
  else if (total >= 3) { verdict = "中性偏多"; tone = "warn"; }
  else if (total >= 2) { verdict = "中性偏空"; tone = "warn"; }
  else { verdict = "結構偏弱"; tone = "bad"; }

  const chg = last.close - prev.close;
  const pct = prev.close ? (chg / prev.close) * 100 : 0;
  const name = await resolveName(code, force);
  return {
    code, name, last, prev, chg, pct,
    ma5: ma5[i], ma10: ma10[i], ma20: ma20[i], ma60: ma60[i],
    rsi: rsiArr[i], k: K[i], d: D[i], dif: dif[i], dea: dea[i], hist: hist[i],
    bias20, pos60, posY, drawdown,
    fStreak, tStreak, f5: sum5("foreign"), t5: sum5("trust"), d5: sum5("dealer"),
    lastDays, dims, total, verdict, tone,
    closes: closes.slice(-120), ma20line: ma20.slice(-120), dates: price.slice(-120).map((r) => r.date),
    volume: vols[i],
  };
}

/* ---------- 狀態 ---------- */
let current = null;
let scanning = false;

/* ---------- 個股診斷渲染 ---------- */
function verdictPill(a) {
  return '<span class="pill ' + a.tone + '">' + esc(a.verdict) + ' · ' + fmtNum(a.total, 1) + ' / 6</span>';
}
function dimRow(d) {
  const pct = Math.min(100, (Math.min(d.score, 1) / 1) * 100);
  return '<div class="cell"><b>' + esc(d.key) + ' — ' + fmtNum(Math.min(d.score, 1), 1) + ' 分</b>' +
    '<div class="bar" style="margin:6px 0"><i style="width:' + pct + '%"></i></div>' +
    '<span class="muted">' + esc(d.desc) + '</span></div>';
}
function drawChart(canvas, a) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600, h = 250;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, w, h);
  const closes = a.closes, m20 = a.ma20line;
  const vals = closes.concat(m20.filter((v) => v !== null));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || 1;
  const X = (idx) => 8 + (idx / (closes.length - 1)) * (w - 16);
  const Y = (v) => 10 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (h - 20);
  ctx.strokeStyle = css.getPropertyValue("--border") || "#ddd";
  for (let g = 0; g < 4; g++) {
    const y = 10 + (g / 3) * (h - 20);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // MA20
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#8a94a6";
  ctx.beginPath();
  let started = false;
  m20.forEach((v, idx) => {
    if (v === null) return;
    if (!started) { ctx.moveTo(X(idx), Y(v)); started = true; } else ctx.lineTo(X(idx), Y(v));
  });
  ctx.stroke();
  // 收盤線
  const up = a.chg >= 0;
  ctx.strokeStyle = up ? "#c81e1e" : "#15803d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  closes.forEach((v, idx) => { if (idx === 0) ctx.moveTo(X(idx), Y(v)); else ctx.lineTo(X(idx), Y(v)); });
  ctx.stroke();
}

async function renderStock(a) {
  current = a;
  const dir = a.chg > 0 ? "up" : a.chg < 0 ? "down" : "";
  const watched = getWatch().some((x) => x.code === a.code);
  $("stock-head").innerHTML =
    '<div class="row" style="justify-content:space-between">' +
    '<div><h2 style="margin:0">' + esc(a.name) + ' <span class="muted num">' + esc(a.code) + '</span></h2>' +
    '<p class="sub" style="margin:2px 0 0">資料日期 ' + esc(a.last.date) + ' · 收盤後數字以當日收盤為準</p></div>' +
    '<div>' + verdictPill(a) + '</div></div>' +
    '<div class="row" style="margin-top:8px">' +
    '<span class="num ' + dir + '" style="font-size:28px;font-weight:800">' + fmtNum(a.last.close) + '</span>' +
    '<span class="num ' + dir + '">' + (a.chg > 0 ? "+" : "") + fmtNum(a.chg) + '（' + (a.pct > 0 ? "+" : "") + fmtNum(a.pct) + '%）</span>' +
    '<span class="muted num" style="font-size:12.5px">開 ' + fmtNum(a.last.open) + ' · 高 ' + fmtNum(a.last.max) + ' · 低 ' + fmtNum(a.last.min) + ' · 量 ' + fmtInt(a.volume / 1000) + ' 張</span>' +
    '<span style="flex:1"></span>' +
    '<button type="button" id="btn-watch">' + (watched ? "已在追蹤清單" : "加入追蹤清單") + '</button></div>';
  $("btn-watch").addEventListener("click", () => { toggleWatch(a.code, a.name); renderStock(a); renderWatch(); });

  const rows = a.lastDays.slice().reverse().map((r) => {
    const f = r.foreign / 1000, t = r.trust / 1000, d = r.dealer / 1000;
    const cls = (v) => v > 0 ? "up" : v < 0 ? "down" : "";
    return "<tr><td class='num'>" + esc(r.date) + "</td><td class='num " + cls(f) + "'>" + fmtInt(f) + "</td><td class='num " + cls(t) + "'>" + fmtInt(t) + "</td><td class='num " + cls(d) + "'>" + fmtInt(d) + "</td></tr>";
  }).join("");

  $("stock-body").innerHTML =
    '<h3>六維度結構評分</h3><div class="matrix">' + a.dims.map(dimRow).join("") + '</div>' +
    '<div class="grid-3" style="margin-top:12px">' +
    '<div class="cell"><b>RSI(14)</b><span class="num" style="font-size:20px">' + fmtNum(a.rsi, 1) + '</span><br><span class="muted">' + (a.rsi === null ? "資料不足" : a.rsi >= 70 ? "過熱區" : a.rsi <= 30 ? "超賣區" : "中性區") + '</span></div>' +
    '<div class="cell"><b>乖離 MA20</b><span class="num" style="font-size:20px">' + (a.bias20 === null ? "—" : (a.bias20 > 0 ? "+" : "") + fmtNum(a.bias20) + "%") + '</span><br><span class="muted">MA20 ' + fmtNum(a.ma20) + '</span></div>' +
    '<div class="cell"><b>位置（60 日 / 年）</b><span class="num" style="font-size:20px">' + fmtNum(a.pos60, 0) + ' / ' + fmtNum(a.posY, 0) + '</span><br><span class="muted">距 60 日高點 ' + fmtNum(a.drawdown, 1) + '%</span></div></div>' +
    '<h3>近 120 日走勢（收盤線＋MA20）</h3><canvas class="chart" id="chart"></canvas>' +
    '<h3>法人籌碼</h3>' +
    '<p class="sub">近 5 日合計（張）：外資 <b class="num">' + fmtInt(a.f5 / 1000) + '</b> · 投信 <b class="num">' + fmtInt(a.t5 / 1000) + '</b> · 自營 <b class="num">' + fmtInt(a.d5 / 1000) + '</b>。連買賣：外資 ' + a.fStreak + ' 日、投信 ' + a.tStreak + ' 日（正數連買、負數連賣）。</p>' +
    '<div class="table-wrap"><table><thead><tr><th>日期</th><th>外資（張）</th><th>投信（張）</th><th>自營（張）</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<h3>判讀</h3><div class="kv">' +
    '<span class="muted">趨勢</span><span>' + esc(trendText(a)) + '</span>' +
    '<span class="muted">動能</span><span>' + esc(momentumText(a)) + '</span>' +
    '<span class="muted">籌碼</span><span>' + esc(chipText(a)) + '</span>' +
    '<span class="muted">位置</span><span>' + esc(posText(a)) + '</span></div>' +
    '<div class="alert" style="margin-top:10px">僅為量化結構描述，不是買賣建議。短線訊號雜訊大，法人與均線需互相確認；槓桿型 ETF 另有耗損與價差問題，不適用同一套解讀。</div>';
  drawChart($("chart"), a);
  pushRecent(a.code, a.name);
}
function trendText(a) {
  if (a.ma20 && a.last.close > a.ma20 && a.ma5 > a.ma10 && a.ma10 > a.ma20) return "收在 MA20 之上且短中均線多頭排列，趨勢偏多。";
  if (a.ma20 && a.last.close > a.ma20) return "收在 MA20 之上，但均線尚未完全多頭排列，趨勢中性偏多。";
  if (a.ma20 && a.last.close < a.ma20) return "收在 MA20 之下，趨勢偏空，先看能否站回。";
  return "均線資料不足。";
}
function momentumText(a) {
  const parts = [];
  parts.push("RSI " + fmtNum(a.rsi, 1));
  parts.push("KD " + (a.k === null ? "資料不足" : "K " + fmtNum(a.k, 1) + " / D " + fmtNum(a.d, 1)));
  parts.push("MACD 柱狀 " + fmtNum(a.hist));
  return parts.join("；") + "。";
}
function chipText(a) {
  if (a.fStreak >= 3 && a.tStreak >= 3) return "外資與投信同步連買 " + a.fStreak + " / " + a.tStreak + " 日，法人共識偏多。";
  if (a.fStreak >= 3) return "外資連買 " + a.fStreak + " 日，投信連 " + a.tStreak + " 日。";
  if (a.tStreak >= 3) return "投信連買 " + a.tStreak + " 日，外資連 " + a.fStreak + " 日。";
  if (a.fStreak <= -3) return "外資連賣 " + Math.abs(a.fStreak) + " 日，籌碼偏空。";
  return "法人方向不一致（外資 " + a.fStreak + " 日、投信 " + a.tStreak + " 日），以連續性為準，不要單看一日。";
}
function posText(a) {
  return "目前在近 60 日區間的 " + fmtNum(a.pos60, 0) + "% 位置，距高點 " + fmtNum(a.drawdown, 1) + "%；在近一年區間的 " + fmtNum(a.posY, 0) + "% 位置。";
}

/* ---------- 搜尋 ---------- */
async function doAnalyze(codeRaw, { force = false } = {}) {
  const code = String(codeRaw || "").trim();
  if (!code) { $("search-msg").textContent = "請先輸入代號。"; return; }
  // 名稱轉代號
  let target = code;
  if (!/^\d/.test(code)) {
    const hit = Object.entries(NAME_FALLBACK).find(([, n]) => n === code || code.includes(n));
    if (hit) target = hit[0];
    else {
      // 試著用 FinMind 查：抓 TaiwanStockInfo 全表太貴，改提示
      $("search-msg").textContent = "名稱不在內建對照，請改輸 4 碼代號。";
      return;
    }
  }
  $("btn-analyze").disabled = true;
  $("search-msg").textContent = "抓取 " + target + " 資料中（約數秒）…";
  try {
    const a = await analyze(target, { force });
    $("search-msg").textContent = "";
    switchTab("stock");
    await renderStock(a);
  } catch (e) {
    $("search-msg").textContent = "查詢失敗：" + (e instanceof Error ? e.message : e);
  } finally {
    $("btn-analyze").disabled = false;
  }
}

/* ---------- 掃描 ---------- */
function scoreByMode(a, mode) {
  if (mode === "macd") return a.total;
  if (mode === "inst") return Math.max(a.fStreak, 0) + Math.max(a.tStreak, 0) + (a.f5 > 0 ? 1 : 0) + (a.t5 > 0 ? 1 : 0);
  if (mode === "oversold") return (-a.drawdown) + (a.rsi !== null && a.rsi < 35 ? 10 : 0) + (a.f5 > 0 || a.t5 > 0 ? 5 : 0);
  // bottom
  let s = 0;
  if (a.drawdown <= -12) s += 2; else if (a.drawdown <= -7) s += 1;
  if (a.rsi !== null && a.rsi < 40) s += 1.5; else if (a.rsi !== null && a.rsi < 50) s += 0.5;
  if (a.f5 > 0 || a.t5 > 0) s += 1.5;
  if (a.hist > 0) s += 1;
  if (a.last.close > a.ma20) s += 0.5;
  return s;
}
function passMode(a, mode) {
  if (mode === "macd") return a.total >= 4;
  if (mode === "inst") return a.fStreak >= 3 || a.tStreak >= 3;
  if (mode === "oversold") return a.drawdown <= -10 && a.rsi !== null && a.rsi < 45;
  return a.drawdown <= -7 && (a.f5 > 0 || a.t5 > 0 || a.hist > 0);
}
async function doScan() {
  if (scanning) return;
  const poolSel = $("pool").value;
  const mode = $("mode").value;
  const pool = poolSel === "watch" ? getWatch().map((x) => x.code) : TOP50.slice();
  if (!pool.length) { $("scan-status").textContent = "追蹤清單是空的，先到個股診斷加入。"; return; }
  scanning = true;
  $("btn-scan").disabled = true;
  $("scan-result").innerHTML = "";
  const done = [];
  let ok = 0, fail = 0;
  for (let idx = 0; idx < pool.length; idx++) {
    const code = pool[idx];
    $("scan-status").textContent = "掃描中 " + (idx + 1) + " / " + pool.length + "（成功 " + ok + "，失敗 " + fail + "）";
    $("scan-bar").style.width = Math.round(((idx) / pool.length) * 100) + "%";
    try {
      const a = await analyze(code);
      ok++;
      a._scanScore = scoreByMode(a, mode);
      a._pass = passMode(a, mode);
      done.push(a);
      renderScan(done, mode);
    } catch (e) {
      fail++;
    }
    await sleep(350); // 節流，保護免費額度
  }
  $("scan-bar").style.width = "100%";
  $("scan-status").textContent = "完成：共 " + pool.length + " 檔，成功 " + ok + "，失敗 " + fail + "，通過條件 " + done.filter((a) => a._pass).length + " 檔。";
  scanning = false;
  $("btn-scan").disabled = false;
}
function renderScan(list, mode) {
  const sort = $("sort").value;
  const arr = list.slice().sort((x, y) => {
    if (sort === "code") return x.code < y.code ? -1 : 1;
    if (sort === "inst") return (y.fStreak + y.tStreak) - (x.fStreak + x.tStreak);
    return y._scanScore - x._scanScore;
  });
  $("scan-result").innerHTML = arr.map((a, idx) => {
    const dir = a.chg > 0 ? "up" : a.chg < 0 ? "down" : "";
    return '<div class="stock-card" data-code="' + esc(a.code) + '" style="cursor:pointer' + (a._pass ? ";border-width:2px" : ";opacity:.82") + '">' +
      '<div class="row" style="justify-content:space-between"><b>' + esc(a.name) + ' <span class="muted num">' + esc(a.code) + '</span></b>' +
      '<span class="score ' + dir + '">' + fmtNum(a._pass ? a.total : a._scanScore, 1) + '</span></div>' +
      '<div class="num ' + dir + '" style="font-size:20px;font-weight:700">' + fmtNum(a.last.close) + ' <span style="font-size:12px">' + (a.pct > 0 ? "+" : "") + fmtNum(a.pct) + '%</span></div>' +
      '<div style="margin:6px 0">' + verdictPill(a) + ' ' + (a._pass ? '<span class="pill good">通過</span>' : '<span class="pill">未通過</span>') + '</div>' +
      '<div class="muted" style="font-size:12px">外資連 ' + a.fStreak + ' 日 · 投信連 ' + a.tStreak + ' 日 · RSI ' + fmtNum(a.rsi, 0) + ' · 距60日高 ' + fmtNum(a.drawdown, 1) + '%</div>' +
      '<div class="muted" style="font-size:12px">第 ' + (idx + 1) + ' 名 · 點卡片看完整診斷</div></div>';
  }).join("");
  document.querySelectorAll("#scan-result .stock-card").forEach((el) => {
    el.addEventListener("click", () => doAnalyze(el.getAttribute("data-code")));
  });
}

/* ---------- 比較 ---------- */
async function doCompare() {
  const raw = $("cmp").value.split(/[,\s、;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (raw.length < 2) { $("compare-result").innerHTML = '<p class="muted">請輸入 2–3 個代號。</p>'; return; }
  $("compare-result").innerHTML = '<p class="muted">抓取中…</p>';
  const out = [];
  for (const c of raw) {
    try { out.push(await analyze(c)); await sleep(300); }
    catch (e) { out.push({ code: c, error: e instanceof Error ? e.message : String(e) }); }
  }
  const good = out.filter((a) => !a.error);
  if (!good.length) { $("compare-result").innerHTML = '<p class="muted">全部查詢失敗。</p>'; return; }
  const row = (label, fn) => "<tr><td>" + label + "</td>" + good.map((a) => "<td class='num'>" + fn(a) + "</td>").join("") + "</tr>";
  $("compare-result").innerHTML = '<div class="table-wrap"><table><thead><tr><th>項目</th>' +
    good.map((a) => "<th>" + esc(a.name) + " " + esc(a.code) + "</th>").join("") + '</tr></thead><tbody>' +
    row("綜合評分 / 判讀", (a) => fmtNum(a.total, 1) + " · " + esc(a.verdict)) +
    row("現價 / 漲跌", (a) => fmtNum(a.last.close) + " / " + (a.pct > 0 ? "+" : "") + fmtNum(a.pct) + "%") +
    row("外資連買賣", (a) => a.fStreak + " 日") +
    row("投信連買賣", (a) => a.tStreak + " 日") +
    row("RSI(14)", (a) => fmtNum(a.rsi, 1)) +
    row("KD", (a) => a.k === null ? "—" : "K " + fmtNum(a.k, 1) + " / D " + fmtNum(a.d, 1)) +
    row("MACD 柱狀", (a) => fmtNum(a.hist)) +
    row("MA 結構", (a) => (a.ma5 > a.ma10 && a.ma10 > a.ma20) ? "多頭排列" : "非多排") +
    row("60 日位置", (a) => fmtNum(a.pos60, 0) + "%") +
    "</tbody></table></div>" +
    out.filter((a) => a.error).map((a) => '<p class="muted">' + esc(a.code) + "：" + esc(a.error) + "</p>").join("");
}

/* ---------- 追蹤 / 最近 ---------- */
function getWatch() {
  try { return JSON.parse(localStorage.getItem(LS_WATCH) || "[]"); } catch (e) { return []; }
}
function setWatch(v) { localStorage.setItem(LS_WATCH, JSON.stringify(v)); }
function toggleWatch(code, name) {
  const w = getWatch();
  const idx = w.findIndex((x) => x.code === code);
  if (idx >= 0) w.splice(idx, 1); else w.unshift({ code, name, at: Date.now() });
  setWatch(w.slice(0, 100));
}
function getRecent() {
  try { return JSON.parse(localStorage.getItem("twscan.recent") || "[]"); } catch (e) { return []; }
}
function pushRecent(code, name) {
  let r = getRecent().filter((x) => x.code !== code);
  r.unshift({ code, name });
  localStorage.setItem("twscan.recent", JSON.stringify(r.slice(0, 8)));
  renderHotRecent();
}
function renderHotRecent() {
  $("hot").innerHTML = HOT.map(([c, n]) => '<button type="button" data-c="' + c + '">' + esc(n) + " " + c + "</button>").join(" ");
  const r = getRecent();
  $("recent").innerHTML = r.length ? r.map((x) => '<button type="button" data-c="' + esc(x.code) + '">' + esc(x.name) + " " + esc(x.code) + "</button>").join(" ") : '<span class="muted" style="font-size:12px">尚無</span>';
  document.querySelectorAll("#hot button, #recent button").forEach((b) => b.addEventListener("click", () => { $("q").value = b.getAttribute("data-c"); doAnalyze(b.getAttribute("data-c")); }));
}
function renderWatch() {
  const w = getWatch();
  $("watch-list").innerHTML = w.length ? w.map((x) =>
    '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0">' +
    "<span><b>" + esc(x.name || x.code) + '</b> <span class="muted num">' + esc(x.code) + "</span></span>" +
    '<span class="row"><button type="button" data-a="open" data-c="' + esc(x.code) + '">開啟診斷</button>' +
    '<button type="button" class="ghost" data-a="del" data-c="' + esc(x.code) + '">移除</button></span></div>'
  ).join("") : '<p class="muted">還沒有追蹤。到個股診斷按「加入追蹤清單」。</p>';
  document.querySelectorAll("#watch-list button").forEach((b) => b.addEventListener("click", () => {
    const c = b.getAttribute("data-c");
    if (b.getAttribute("data-a") === "del") { setWatch(getWatch().filter((x) => x.code !== c)); renderWatch(); }
    else doAnalyze(c);
  }));
  $("quota-note").textContent = getToken() ? "已設定個人 Token" : "未設定 Token（匿名額度）";
}

/* ---------- 頁籤 / 主題 / 對話框 ---------- */
function switchTab(name) {
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === name));
  $("tab-stock").hidden = name !== "stock";
  $("tab-scan").hidden = name !== "scan";
  $("tab-compare").hidden = name !== "compare";
  $("tab-watch").hidden = name !== "watch";
  if (name === "watch") renderWatch();
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(LS_THEME, t);
  $("btn-theme").textContent = t === "dark" ? "淺色" : "深色";
  if (current) drawChart($("chart"), current);
}
function methodHtml() {
  return "<div class='kv'>" +
    "<span class='muted'>RSI(14)</span><span>Wilder 平滑，70 以上過熱、30 以下超賣。</span>" +
    "<span class='muted'>KD(9,3,3)</span><span>K 上穿 D 為金叉、跌破為死叉；高檔鈍化與低檔鈍化都可能延續。</span>" +
    "<span class='muted'>MACD</span><span>EMA12–EMA26 為 DIF，DIF 的 9 日 EMA 為 DEA，柱狀 = 2×(DIF–DEA)。</span>" +
    "<span class='muted'>均線</span><span>MA5/10/20/60；乖離 = (收盤–MA20)/MA20。</span>" +
    "<span class='muted'>法人</span><span>FinMind 三大法人買賣超，彙總外資、投信、自營；連買賣日為同方向連續交易日。</span>" +
    "<span class='muted'>位置</span><span>收盤在近 60 日與近一年高低區間的百分位，愈高愈接近壓力。</span>" +
    "<span class='muted'>六維度</span><span>MACD 柱狀、DIF/DEA、零軸、法人、均線、KD，各 0–1 分；法人雙買超最多 1.5 分，合計 6 分。</span>" +
    "<span class='muted'>海選</span><span>底部探測看跌深＋法人回補＋動能；MACD 結構看六維度 ≥4；碎骨看超跌；法人連買看法人連續性。掃描有節流，大池請耐心等。</span>" +
    "</div><div class='alert' style='margin-top:10px'>免費額度有限（匿名＋個人 Token 每日約數百次）。掃描 50 檔會消耗約 100 次查詢，建議先設 Token、必要時再掃。</div>";
}

/* ---------- 啟動 ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem(LS_THEME) || "light");
  renderHotRecent();
  renderWatch();
  $("method-body").innerHTML = methodHtml();
  document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.getAttribute("data-tab"))));
  $("btn-analyze").addEventListener("click", () => doAnalyze($("q").value));
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") doAnalyze($("q").value); });
  $("btn-refresh").addEventListener("click", () => { memCache.clear(); if ($("q").value.trim()) doAnalyze($("q").value, { force: true }); });
  $("btn-scan").addEventListener("click", doScan);
  $("sort").addEventListener("change", () => { /* 下次渲染生效 */ });
  $("btn-compare").addEventListener("click", doCompare);
  $("btn-theme").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  $("btn-token").addEventListener("click", () => { $("token-input").value = getToken(); $("dlg-token").showModal(); });
  $("token-cancel").addEventListener("click", () => $("dlg-token").close());
  $("token-save").addEventListener("click", () => {
    const v = $("token-input").value.trim();
    if (v) localStorage.setItem(LS_TOKEN, v); else localStorage.removeItem(LS_TOKEN);
    memCache.clear();
    renderWatch();
    $("dlg-token").close();
  });
  $("btn-method").addEventListener("click", () => $("dlg-method").showModal());
  $("method-close").addEventListener("click", () => $("dlg-method").close());
  const m = String(new URLSearchParams(location.search).get("code") || "").trim();
  if (m) { $("q").value = m; doAnalyze(m); }
});
