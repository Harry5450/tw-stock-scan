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

/* localStorage 持久快取：FinMind 日線與法人資料當日有效，減少重複查詢 */
const LS_PFX = "twscan.cache.v1.";
function lsGet(k) {
  try {
    const raw = localStorage.getItem(LS_PFX + k);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.data)) return null;
    if (o.day !== fmtDate(new Date())) return null; // 跨日失效
    return o.data;
  } catch (e) { return null; }
}
function lsSet(k, data) {
  try { localStorage.setItem(LS_PFX + k, JSON.stringify({ day: fmtDate(new Date()), data })); } catch (e) { /* 配額滿就放棄持久化 */ }
}
const INFO_MAP = new Map(); // stock_id -> { industry_category, stock_name }
let infoLoaded = false;
async function loadInfoMap(force) {
  if (infoLoaded && !force) return INFO_MAP;
  try {
    const rows = await finmind("TaiwanStockInfo", "", "2025-01-01", fmtDate(new Date()), { force });
    INFO_MAP.clear();
    for (const r of rows || []) {
      if (r && r.stock_id) INFO_MAP.set(String(r.stock_id), { industry_category: r.industry_category || "未分類", stock_name: r.stock_name || "" });
    }
    infoLoaded = true;
  } catch (e) { /* 失敗就沿用舊對照 */ }
  return INFO_MAP;
}
function infoOf(code) {
  const hit = INFO_MAP.get(String(code));
  if (hit) return hit;
  const fb = NAME_FALLBACK[code];
  return { industry_category: "未分類", stock_name: fb || "" };
}

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
  if (!force && (dataset === "TaiwanStockPrice" || dataset === "TaiwanStockInstitutionalInvestorsBuySell" || dataset === "TaiwanStockDividend")) {
    const ls = lsGet(key);
    if (ls) { memCache.set(key, ls); return ls; }
  }
  const params = new URLSearchParams({ dataset, data_id: dataId, start_date: startDate, end_date: endDate });
  if (token) params.set("token", token);
  const res = await fetch(FINMIND + "?" + params.toString());
  if (!res.ok) throw new Error("FinMind HTTP " + res.status + "（" + dataset + "）");
  const j = await res.json();
  if (j.status !== 200) throw new Error("FinMind 回傳異常：" + esc(j.msg || j.status));
  const data = j.data || [];
  memCache.set(key, data);
  if (dataset === "TaiwanStockPrice" || dataset === "TaiwanStockInstitutionalInvestorsBuySell" || dataset === "TaiwanStockDividend") lsSet(key, data);
  return data;
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
function boll(closes, n = 20, k = 2) {
  const mid = ma(closes, n);
  const up = new Array(closes.length).fill(null);
  const dn = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) continue;
    const win = closes.slice(i - n + 1, i + 1);
    const m = win.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(win.reduce((s, v) => s + (v - m) * (v - m), 0) / n);
    up[i] = m + k * sd; dn[i] = m - k * sd;
  }
  return { mid, up, dn };
}
function obv(closes, vols) {
  const out = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    out[i] = out[i - 1] + (d > 0 ? vols[i] : d < 0 ? -vols[i] : 0);
  }
  return out;
}

/* ---------- 分析 ---------- */
async function resolveName(code, force) {
  if (NAME_FALLBACK[code]) return NAME_FALLBACK[code];
  await loadInfoMap(force);
  const hit = infoOf(code);
  if (hit.stock_name) return hit.stock_name;
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

  // 布林通道位置
  const { mid: bbMid, up: bbUp, dn: bbDn } = boll(closes, 20, 2);
  const bbPos = (bbUp[i] !== null && bbDn[i] !== null && bbUp[i] !== bbDn[i])
    ? ((closes[i] - bbDn[i]) / (bbUp[i] - bbDn[i])) * 100 : 50;
  const bbState = bbUp[i] === null ? "資料不足" : closes[i] > bbUp[i] ? "站上上軌（強勢延伸或短線過熱）" : closes[i] < bbDn[i] ? "跌破下軌（弱勢延伸或短線超賣）" : "軌道內運行";
  // OBV 方向：近 5 日斜率
  const obvLine = obv(closes, vols);
  const obv5 = obvLine[i] - obvLine[Math.max(0, i - 5)];
  const obvState = obv5 > 0 ? "近 5 日資金淨流入（OBV 上行）" : obv5 < 0 ? "近 5 日資金淨流出（OBV 下行）" : "OBV 持平";
  // 動能條：沿用原站口徑摘要
  const md14 = closes[i] && closes[Math.max(0, i - 14)] ? (closes[i] - closes[Math.max(0, i - 14)]) / closes[Math.max(0, i - 14)] * 100 : 0;
  // 籌碼流體四象限：法人 5 日合計 vs 20 日漲跌
  const base20 = closes[Math.max(0, i - 20)] || closes[0];
  const ret20 = base20 ? (closes[i] - base20) / base20 * 100 : 0;
  const instFlow = (sum5("foreign") + sum5("trust") + sum5("dealer")) / 1000;
  const flowQuad = instFlow >= 0 && ret20 >= 0 ? "吸籌拉升區（價漲＋法人買）" : instFlow >= 0 && ret20 < 0 ? "逢低吸籌區（價跌＋法人買）" : instFlow < 0 && ret20 >= 0 ? "拉高出貨區（價漲＋法人賣）" : "殺跌出貨區（價跌＋法人賣）";
  // 外資投信背離
  const diverge = (fStreak > 0 && tStreak < 0) ? "外資買、投信賣（短線分歧，看外資續航）" : (fStreak < 0 && tStreak > 0) ? "外資賣、投信買（短線分歧，看投信續航）" : Math.abs(fStreak) >= 3 && Math.abs(tStreak) >= 3 && ((fStreak > 0) !== (tStreak > 0)) ? "雙方連續反向， Tomas 以日明細確認誰先轉向" : "雙方無明顯連續背離";
  // 訊號矩陣八格：沿用原站口徑（多/空/觀）
  const sig = {
    ai: total >= 4 ? "多" : total < 2.5 ? "空" : "觀",
    macd: hist[i] > 0 ? "多" : "空",
    pos: pos60 >= 80 ? "空" : pos60 <= 20 ? "多" : "觀",
    kd: (K[i] !== null && D[i] !== null && K[i] > D[i]) ? "多" : "空",
    ma: bull ? "多" : "觀",
    chip: (fStreak >= 3 || tStreak >= 3) ? "多" : (fStreak <= -3 ? "空" : "觀"),
    obv: obv5 > 0 ? "多" : obv5 < 0 ? "空" : "觀",
    flow: instFlow >= 0 && ret20 >= 0 ? "多" : instFlow < 0 && ret20 < 0 ? "空" : "觀",
  };
  const sigVotes = Object.values(sig).filter((v) => v === "多").length - Object.values(sig).filter((v) => v === "空").length;
  const sigAll = sigVotes >= 3 ? "偏多共振" : sigVotes <= -3 ? "偏空共振" : "多空均勢";
  // 大盤連動：TAIEX 近 20 日相關係數（需額外查詢，失敗則 null）
  let beta20 = null, corr20 = null;
  try {
    const mkt = await finmind("TaiwanStockPrice", "TAIEX", fmtDate(addDays(new Date(), -60)), end, { force });
    if (mkt && mkt.length > 25) {
      mkt.sort((a, b) => a.date < b.date ? -1 : 1);
      const byD = {};
      for (const r of mkt) byD[r.date] = r.close;
      const pairs = [];
      for (let j = Math.max(0, price.length - 21); j < price.length; j++) {
        const mc = byD[price[j].date];
        if (mc) pairs.push([price[j].close, mc]);
      }
      if (pairs.length > 10) {
        const n = pairs.length;
        const mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
        let sxy = 0, sxx = 0, syy = 0;
        for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); syy += (y - my) * (y - my); }
        corr20 = (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : null;
        beta20 = syy ? sxy / syy : null;
      }
    }
  } catch (e) { /* 大盤抓不到就留空 */ }
  return {
    code, name, last, prev, chg, pct,
    ma5: ma5[i], ma10: ma10[i], ma20: ma20[i], ma60: ma60[i],
    rsi: rsiArr[i], k: K[i], d: D[i], dif: dif[i], dea: dea[i], hist: hist[i],
    bias20, pos60, posY, drawdown,
    fStreak, tStreak, f5: sum5("foreign"), t5: sum5("trust"), d5: sum5("dealer"),
    lastDays, dims, total, verdict, tone,
    closes: closes.slice(-120), ma20line: ma20.slice(-120), dates: price.slice(-120).map((r) => r.date),
    volume: vols[i],
    bbPos, bbState, bbUp: bbUp[i], bbDn: bbDn[i], bbMid: bbMid[i],
    obv5, obvState, md14, ret20, instFlow, flowQuad, diverge, sig, sigAll,
    beta20, corr20,
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

  const sigCell = (label, v) => '<div class="cell"><b>' + esc(label) + '</b><span class="num" style="font-size:18px">' + esc(v) + '</span></div>';
  const sigOrder = [["AI 綜合", a.sig.ai], ["MACD", a.sig.macd], ["位置", a.sig.pos], ["KD", a.sig.kd], ["均線", a.sig.ma], ["法人", a.sig.chip], ["OBV", a.sig.obv], ["流體", a.sig.flow]];
  $("stock-body").innerHTML =
    '<h3>六維度結構評分</h3><div class="matrix">' + a.dims.map(dimRow).join("") + '</div>' +
    '<div class="grid-3" style="margin-top:12px">' +
    '<div class="cell"><b>RSI(14)</b><span class="num" style="font-size:20px">' + fmtNum(a.rsi, 1) + '</span><br><span class="muted">' + (a.rsi === null ? "資料不足" : a.rsi >= 70 ? "過熱區" : a.rsi <= 30 ? "超賣區" : "中性區") + '</span></div>' +
    '<div class="cell"><b>乖離 MA20</b><span class="num" style="font-size:20px">' + (a.bias20 === null ? "—" : (a.bias20 > 0 ? "+" : "") + fmtNum(a.bias20) + "%") + '</span><br><span class="muted">MA20 ' + fmtNum(a.ma20) + '</span></div>' +
    '<div class="cell"><b>位置（60 日 / 年）</b><span class="num" style="font-size:20px">' + fmtNum(a.pos60, 0) + ' / ' + fmtNum(a.posY, 0) + '</span><br><span class="muted">距 60 日高點 ' + fmtNum(a.drawdown, 1) + '%</span></div></div>' +
    '<h3>動能掃描</h3><div class="kv">' +
    '<span class="muted">MD14</span><span class="num">' + (a.md14 >= 0 ? "+" : "") + fmtNum(a.md14) + '%（14 日漲跌，站穩為正）</span>' +
    '<span class="muted">布林位置</span><span>' + fmtNum(a.bbPos, 0) + ' / 100 · ' + esc(a.bbState) + '（上軌 ' + fmtNum(a.bbUp) + ' / 下軌 ' + fmtNum(a.bbDn) + '）</span>' +
    '<span class="muted">OBV</span><span>' + esc(a.obvState) + '</span></div>' +
    '<h3>訊號矩陣（多 / 空 / 觀）</h3><div class="matrix">' + sigOrder.map(([k, v]) => sigCell(k, v)).join("") + '</div>' +
    '<p class="sub" style="margin-top:6px">綜合：' + esc(a.sigAll) + '。沿用原站八格口徑，僅為方向投票，不是買賣建議。</p>' +
    '<h3>近 120 日走勢（收盤線＋MA20）</h3><canvas class="chart" id="chart"></canvas>' +
    '<h3>法人籌碼</h3>' +
    '<p class="sub">近 5 日合計（張）：外資 <b class="num">' + fmtInt(a.f5 / 1000) + '</b> · 投信 <b class="num">' + fmtInt(a.t5 / 1000) + '</b> · 自營 <b class="num">' + fmtInt(a.d5 / 1000) + '</b>。連買賣：外資 ' + a.fStreak + ' 日、投信 ' + a.tStreak + ' 日（正數連買、負數連賣）。</p>' +
    '<div class="table-wrap"><table><thead><tr><th>日期</th><th>外資（張）</th><th>投信（張）</th><th>自營（張）</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<h3>籌碼流體</h3><div class="kv">' +
    '<span class="muted">四象限</span><span>' + esc(a.flowQuad) + '（20 日漲跌 ' + (a.ret20 >= 0 ? "+" : "") + fmtNum(a.ret20) + '%，法人 5 日合計 ' + fmtInt(a.instFlow) + ' 張）</span>' +
    '<span class="muted">外資投信背離</span><span>' + esc(a.diverge) + '</span></div>' +
    '<h3>大盤連動（TAIEX 近 20 日）</h3><div class="kv">' +
    '<span class="muted">相關係數</span><span class="num">' + (a.corr20 === null ? "—（大盤資料不足）" : fmtNum(a.corr20, 2)) + '</span>' +
    '<span class="muted">Beta</span><span class="num">' + (a.beta20 === null ? "—" : fmtNum(a.beta20, 2)) + '</span></div>' +
    '<div class="row" style="margin-top:10px"><button type="button" id="btn-funda">載入獲利品質 / 本益比（基本面）</button><span class="muted" id="funda-msg" style="font-size:12.5px"></span></div>' +
    '<div id="funda-body"></div>' +
    '<h3>判讀</h3><div class="kv">' +
    '<span class="muted">趨勢</span><span>' + esc(trendText(a)) + '</span>' +
    '<span class="muted">動能</span><span>' + esc(momentumText(a)) + '</span>' +
    '<span class="muted">籌碼</span><span>' + esc(chipText(a)) + '</span>' +
    '<span class="muted">位置</span><span>' + esc(posText(a)) + '</span></div>' +
    '<div class="alert" style="margin-top:10px">僅為量化結構描述，不是買賣建議。短線訊號雜訊大，法人與均線需互相確認；槓桿型 ETF 另有耗損與價差問題，不適用同一套解讀。</div>';
  drawChart($("chart"), a);
  $("btn-funda").addEventListener("click", () => loadFunda(a));
  pushRecent(a.code, a.name);
}
async function loadFunda(a) {
  $("btn-funda").disabled = true;
  $("funda-msg").textContent = "抓取營收、財報、PER 中…";
  try {
    const end = fmtDate(new Date());
    const [rev, per, news] = await Promise.all([
      finmind("TaiwanStockMonthRevenue", a.code, "2022-01-01", end, {}),
      finmind("TaiwanStockPER", a.code, fmtDate(addDays(new Date(), -400)), end, {}),
      finmind("TaiwanStockNews", a.code, fmtDate(new Date()), {}).catch(() => []),
    ]);
    rev.sort((x, y) => x.date < y.date ? -1 : 1);
    const last12 = rev.slice(0, 12);
    const yoy = (last12.length >= 12 && rev.length >= 24)
      ? ((rev.slice(0, 12).reduce((s, r) => s + (r.revenue || 0), 0) - rev.slice(12, 24).reduce((s, r) => s + (r.revenue || 0), 0)) / Math.max(1, rev.slice(12, 24).reduce((s, r) => s + (r.revenue || 0), 0)) * 100)
      : null;
    const revRows = last12.slice(0, 6).map((r) => "<tr><td class='num'>" + esc(r.date) + "</td><td class='num'>" + fmtInt((r.revenue || 0) / 1e8) + "</td></tr>").join("");
    const lastPer = per.length ? per[per.length - 1] : null;
    const newsList = (news || []).slice(0, 5).map((n) => "<div>· <a href='" + esc(n.link) + "' target='_blank' rel='noopener'>" + esc(n.title) + "</a> <span class='muted'>" + esc(n.source) + " " + esc(n.date) + "</span></div>").join("") || "<p class='muted'>今日尚無相關新聞。</p>";
    $("funda-body").innerHTML =
      '<h3>獲利品質（月營收）</h3>' +
      '<p class="sub">近 12 個月合計年增 ' + (yoy === null ? "—（資料不足）" : (yoy >= 0 ? "+" : "") + fmtNum(yoy) + "%") + '。財報地雷的早期徵兆是「帳上賺錢但收不到現金」，此處以營收連續性作為第一層體檢，完整財報解讀仍需看季報現金流。</p>' +
      '<div class="table-wrap"><table><thead><tr><th>月份</th><th>營收（億元）</th></tr></thead><tbody>' + (revRows || "<tr><td colspan='2'>無營收資料</td></tr>") + '</tbody></table></div>' +
      '<h3>本益比 / 淨值比</h3><div class="kv">' +
      '<span class="muted">PER</span><span class="num">' + (lastPer ? fmtNum(lastPer.PER) + "（" + esc(lastPer.date) + "）" : "—") + '</span>' +
      '<span class="muted">PBR</span><span class="num">' + (lastPer ? fmtNum(lastPer.PBR) : "—") + '</span>' +
      '<span class="muted">殖利率</span><span class="num">' + (lastPer ? fmtNum(lastPer.dividend_yield) + "%" : "—") + '</span></div>' +
      '<p class="sub">貴不貴看跟自己過去一年比，跨產業直接比 PER 沒有意義，僅供參考。</p>' +
      '<h3>相關新聞（今日）</h3>' + newsList;
    $("funda-msg").textContent = "完成。基本面為慢變數，盤中不需要重複載入。";
  } catch (e) {
    $("funda-msg").textContent = "載入失敗：" + (e instanceof Error ? e.message : e);
  } finally {
    $("btn-funda").disabled = false;
  }
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
  if (mode === "marginWash") {
    // 資減人走：近似以「法人賣超＋量縮＋站不回 MA20」為淨化候選
    let s = 0;
    if (a.f5 < 0 && a.t5 <= 0) s += 2;
    if (a.last.close < a.ma20) s += 1;
    if (a.rsi !== null && a.rsi < 40) s += 1;
    if (a.drawdown <= -7) s += 1;
    return s;
  }
  if (mode === "breakout") {
    // 突破結構：站上 MA20＋MACD 翻紅＋法人回補＋位置初升
    let s = 0;
    if (a.last.close > a.ma20) s += 2;
    if (a.hist > 0) s += 1.5;
    if (a.f5 > 0 || a.t5 > 0) s += 1.5;
    if (a.pos60 >= 30 && a.pos60 <= 80) s += 1;
    return s;
  }
  if (mode === "foreignStrong") {
    // 外盤強勢近似：連漲＋量能＋法人同買（無逐筆內外盤，方法說明已揭露近似）
    let s = 0;
    if (a.md14 > 0) s += 1.5;
    if (a.obv5 > 0) s += 1.5;
    if (a.f5 > 0) s += 1.5;
    if (a.rsi !== null && a.rsi >= 55) s += 1;
    return s;
  }
  if (mode === "chipCycle") {
    // 籌碼週期階段分：吸籌/拉升/出貨/洗盤（以流體四象限＋連續性近似）
    const buy = a.instFlow >= 0;
    const up = a.ret20 >= 0;
    if (!up && buy) return 4; // 吸籌
    if (up && buy) return 3; // 拉升
    if (up && !buy) return 2; // 出貨
    return 1; // 洗盤/殺跌
  }
  // bottom
  let s = 0;
  if (a.drawdown <= -12) s += 2; else if (a.drawdown <= -7) s += 1;
  if (a.rsi !== null && a.rsi < 40) s += 1.5; else if (a.rsi !== null && a.rsi < 50) s += 0.5;
  if (a.f5 > 0 || a.t5 > 0) s += 1.5;
  if (a.hist > 0) s += 1;
  if (a.last.close > a.ma20) s += 0.5;
  return s;
}
const CHIP_CYCLE_NAME = { 4: "吸籌期", 3: "拉升期", 2: "出貨期", 1: "洗盤期" };
function passMode(a, mode) {
  if (mode === "macd") return a.total >= 4;
  if (mode === "inst") return a.fStreak >= 3 || a.tStreak >= 3;
  if (mode === "oversold") return a.drawdown <= -10 && a.rsi !== null && a.rsi < 45;
  if (mode === "marginWash") return a.f5 < 0 && a.last.close < a.ma20 && a.drawdown <= -5;
  if (mode === "breakout") return a.last.close > a.ma20 && a.hist > 0 && (a.f5 > 0 || a.t5 > 0);
  if (mode === "foreignStrong") return a.md14 > 3 && a.obv5 > 0 && a.f5 > 0;
  if (mode === "chipCycle") return true; // 全部顯示階段，依排序看
  return a.drawdown <= -7 && (a.f5 > 0 || a.t5 > 0 || a.hist > 0);
}
async function doScan() {
  if (scanning) return;
  const poolSel = $("pool").value;
  const mode = $("mode").value;
  const pool = poolCodes(poolSel);
  if (!pool.length) { $("scan-status").textContent = poolSel === "custom" ? "自訂池是空的，請在下方輸入代號後儲存。" : "追蹤清單是空的，先到個股診斷加入。"; return; }
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
  const modeNow = $("mode").value;
  $("scan-result").innerHTML = arr.map((a, idx) => {
    const dir = a.chg > 0 ? "up" : a.chg < 0 ? "down" : "";
    const extra = modeNow === "chipCycle"
      ? '<div class="muted" style="font-size:12px">籌碼階段：' + esc(CHIP_CYCLE_NAME[a._scanScore] || "—") + ' · ' + esc(a.flowQuad) + '</div>'
      : "";
    return '<div class="stock-card" data-code="' + esc(a.code) + '" style="cursor:pointer' + (a._pass ? ";border-width:2px" : ";opacity:.82") + '">' +
      '<div class="row" style="justify-content:space-between"><b>' + esc(a.name) + ' <span class="muted num">' + esc(a.code) + '</span></b>' +
      '<span class="score ' + dir + '">' + fmtNum(a._pass ? a.total : a._scanScore, 1) + '</span></div>' +
      '<div class="num ' + dir + '" style="font-size:20px;font-weight:700">' + fmtNum(a.last.close) + ' <span style="font-size:12px">' + (a.pct > 0 ? "+" : "") + fmtNum(a.pct) + '%</span></div>' +
      '<div style="margin:6px 0">' + verdictPill(a) + ' ' + (a._pass ? '<span class="pill good">通過</span>' : '<span class="pill">未通過</span>') + '</div>' +
      '<div class="muted" style="font-size:12px">外資連 ' + a.fStreak + ' 日 · 投信連 ' + a.tStreak + ' 日 · RSI ' + fmtNum(a.rsi, 0) + ' · 距60日高 ' + fmtNum(a.drawdown, 1) + '%</div>' + extra +
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
    row("布林位置", (a) => fmtNum(a.bbPos, 0) + " / 100") +
    row("OBV 方向", (a) => a.obv5 > 0 ? "流入" : a.obv5 < 0 ? "流出" : "持平") +
    row("法人 5 日合計（張）", (a) => fmtInt(a.instFlow)) +
    row("大盤相關係數", (a) => a.corr20 === null ? "—" : fmtNum(a.corr20, 2)) +
    "</tbody></table></div>" +
    out.filter((a) => a.error).map((a) => '<p class="muted">' + esc(a.code) + "：" + esc(a.error) + "</p>").join("");
}

/* ---------- 回測統計（MACD 金叉死叉） ---------- */
async function doBacktest() {
  const raw = $("bt-code").value.trim() || ($("q").value.trim() || "2330");
  let code = raw;
  if (!/^\d/.test(code)) {
    const hit = Object.entries(NAME_FALLBACK).find(([, n]) => n === code || code.includes(n));
    if (hit) code = hit[0];
  }
  if (!/^\d{4}[A-Z]?$/.test(code)) { $("bt-status").textContent = "代號格式不正確：" + raw; return; }
  $("bt-status").textContent = "抓取 " + code + " 近一年半日線、計算訊號中…";
  $("backtest-result").innerHTML = "";
  try {
    const end = fmtDate(new Date());
    const start = fmtDate(addDays(new Date(), -560));
    const price = await finmind("TaiwanStockPrice", code, start, end, {});
    if (!price.length) throw new Error(code + " 查無股價資料");
    price.sort((a, b) => a.date < b.date ? -1 : 1);
    const closes = price.map((r) => r.close);
    const opens = price.map((r) => r.open);
    const { dif, dea } = macd(closes);
    // 訊號：DIF 上穿 DEA 買、下穿賣，隔日開盤價執行
    const trades = [];
    let pos = null;
    for (let i = 1; i < price.length - 1; i++) {
      if (dif[i - 1] === null || dea[i - 1] === null) continue;
      const gold = dif[i - 1] <= dea[i - 1] && dif[i] > dea[i];
      const dead = dif[i - 1] >= dea[i - 1] && dif[i] < dea[i];
      const execPrice = opens[i + 1];
      if (!execPrice) continue;
      if (gold && !pos) pos = { buyDate: price[i + 1].date, buyPrice: execPrice };
      else if (dead && pos) {
        trades.push({ ...pos, sellDate: price[i + 1].date, sellPrice: execPrice });
        pos = null;
      }
    }
    if (pos) trades.push({ ...pos, sellDate: price[price.length - 1].date + "（持有中）", sellPrice: closes[closes.length - 1], open: true });
    const rets = trades.map((t) => (t.sellPrice - t.buyPrice) / t.buyPrice * 100);
    const wins = rets.filter((r) => r > 0).length;
    const avg = rets.length ? rets.reduce((s, r) => s + r, 0) / rets.length : 0;
    const cum = rets.reduce((eq, r) => eq * (1 + r / 100), 1);
    const cumPct = (cum - 1) * 100;
    // Buy & Hold：第一次買訊號日的隔日開盤 → 最後收盤
    let bhPct = null;
    if (trades.length) {
      bhPct = (closes[closes.length - 1] - trades[0].buyPrice) / trades[0].buyPrice * 100;
    }
    // 最大回檔（權益曲線）
    let peak = 1, maxDD = 0, eq = 1;
    const eqCurve = [1];
    for (const r of rets) {
      eq *= (1 + r / 100);
      eqCurve.push(eq);
      if (eq > peak) peak = eq;
      const dd = (eq - peak) / peak * 100;
      if (dd < maxDD) maxDD = dd;
    }
    const name = await resolveName(code, false);
    $("bt-status").textContent = "完成：共 " + trades.length + " 筆已完成/持有中交易（近 " + price.length + " 個交易日）。";
    const rows = trades.slice(-20).reverse().map((t) =>
      "<tr><td class='num'>" + esc(t.buyDate) + "</td><td class='num'>" + fmtNum(t.buyPrice) + "</td>" +
      "<td class='num'>" + esc(t.sellDate) + "</td><td class='num'>" + fmtNum(t.sellPrice) + "</td>" +
      "<td class='num " + (((t.sellPrice - t.buyPrice) >= 0) ? "up" : "down") + "'>" +
      (((t.sellPrice - t.buyPrice) / t.buyPrice * 100) > 0 ? "+" : "") + fmtNum((t.sellPrice - t.buyPrice) / t.buyPrice * 100) + "%</td></tr>"
    ).join("");
    $("backtest-result").innerHTML =
      '<div class="grid-4">' +
      '<div class="cell"><b>交易次數</b><span class="num" style="font-size:20px">' + trades.length + '</span><br><span class="muted">' + esc(name) + " " + esc(code) + '</span></div>' +
      '<div class="cell"><b>勝率</b><span class="num" style="font-size:20px">' + (rets.length ? fmtNum(wins / rets.length * 100, 1) + "%" : "—") + '</span><br><span class="muted">獲利 ' + wins + ' / 虧損 ' + (rets.length - wins) + '</span></div>' +
      '<div class="cell"><b>平均單筆報酬</b><span class="num" style="font-size:20px">' + (avg >= 0 ? "+" : "") + fmtNum(avg) + '%</span><br><span class="muted">累積 ' + (cumPct >= 0 ? "+" : "") + fmtNum(cumPct) + '%</span></div>' +
      '<div class="cell"><b>最大回檔 / Buy&Hold</b><span class="num" style="font-size:20px">' + fmtNum(maxDD, 1) + '%</span><br><span class="muted">同期持有 ' + (bhPct === null ? "—" : (bhPct >= 0 ? "+" : "") + fmtNum(bhPct) + "%") + '</span></div></div>' +
      '<h3>權益曲線（複利，起始 = 1）</h3><canvas class="chart" id="bt-chart"></canvas>' +
      '<h3>最近交易（最多 20 筆）</h3><div class="table-wrap"><table><thead><tr><th>買入日</th><th>買價</th><th>賣出日</th><th>賣價</th><th>報酬</th></tr></thead><tbody>' + (rows || "<tr><td colspan='5'>無交易訊號</td></tr>") + '</tbody></table></div>' +
      '<div class="alert" style="margin-top:10px">規則固定、未計手續費稅費與滑價；訊號多空皆可能連續虧損，僅供檢驗「MACD 交叉」在該股近期的方向性，不代表未來績效。</div>';
    drawEquity($("bt-chart"), eqCurve);
  } catch (e) {
    $("bt-status").textContent = "回測失敗：" + (e instanceof Error ? e.message : e);
  }
}
function drawEquity(canvas, curve) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600, h = 250;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!curve.length) return;
  const lo = Math.min(...curve, 1), hi = Math.max(...curve, 1);
  const pad = (hi - lo) * 0.15 || 0.01;
  const X = (i) => 8 + (i / Math.max(1, curve.length - 1)) * (w - 16);
  const Y = (v) => 10 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (h - 20);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--border") || "#ddd";
  for (let g = 0; g < 4; g++) {
    const y = 10 + (g / 3) * (h - 20);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // 起始線
  ctx.strokeStyle = "#8a94a6"; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, Y(1)); ctx.lineTo(w, Y(1)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = curve[curve.length - 1] >= 1 ? "#c81e1e" : "#15803d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  curve.forEach((v, i) => { if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v)); });
  ctx.stroke();
}

/* ---------- 除息雷達 ---------- */
let divScanning = false;
async function doDividend() {
  if (divScanning) return;
  const poolSel = $("div-pool").value;
  const pool = poolCodes(poolSel);
  if (!pool.length) { $("div-status").textContent = poolSel === "custom" ? "自訂池是空的，請先在海選頁籤設定。" : "追蹤清單是空的，先到個股診斷加入。"; return; }
  divScanning = true;
  $("btn-dividend").disabled = true;
  $("dividend-result").innerHTML = "";
  const end = fmtDate(new Date());
  const yearAgo = fmtDate(addDays(new Date(), -365));
  const out = [];
  let ok = 0, fail = 0;
  for (let idx = 0; idx < pool.length; idx++) {
    const code = pool[idx];
    $("div-status").textContent = "掃描中 " + (idx + 1) + " / " + pool.length + "（成功 " + ok + "，失敗 " + fail + "）";
    $("div-bar").style.width = Math.round((idx / pool.length) * 100) + "%";
    try {
      const [divs, price] = await Promise.all([
        finmind("TaiwanStockDividend", code, yearAgo, end, {}),
        finmind("TaiwanStockPrice", code, fmtDate(addDays(new Date(), -10)), end, {}),
      ]);
      ok++;
      const seen = {};
      for (const d of divs) {
        const ex = d.CashExDividendTradingDate || "";
        if (!ex || ex < yearAgo) continue;
        const amt = Number(d.CashEarningsDistribution || 0) + Number(d.CashStatutorySurplus || 0);
        if (!seen[ex] || amt > seen[ex]) seen[ex] = amt;
      }
      const exDates = Object.keys(seen).sort();
      const sum = exDates.reduce((s, k) => s + seen[k], 0);
      const last = price.length ? price[price.length - 1] : null;
      const yld = (last && sum > 0) ? sum / last.close * 100 : 0;
      out.push({ code, name: await resolveName(code, false), sum, yld, count: exDates.length, lastEx: exDates.length ? exDates[exDates.length - 1] : "—", close: last ? last.close : null });
      renderDividend(out);
    } catch (e) { fail++; }
    await sleep(350);
  }
  $("div-bar").style.width = "100%";
  $("div-status").textContent = "完成：共 " + pool.length + " 檔，成功 " + ok + "，失敗 " + fail + "。殖利率 = 近一年已公告現金股利合計 / 現價。";
  divScanning = false;
  $("btn-dividend").disabled = false;
}
function renderDividend(list) {
  const sort = $("div-sort").value;
  const arr = list.slice().sort((a, b) => {
    if (sort === "amount") return b.sum - a.sum;
    if (sort === "code") return a.code < b.code ? -1 : 1;
    return b.yld - a.yld;
  });
  $("dividend-result").innerHTML = '<div class="table-wrap"><table><thead><tr><th>個股</th><th>現價</th><th>近一年現金股利</th><th>殖利率</th><th>除息次數</th><th>最近除息日</th></tr></thead><tbody>' +
    arr.map((r) => "<tr><td><b>" + esc(r.name) + '</b> <span class="muted num">' + esc(r.code) + "</span></td>" +
      "<td class='num'>" + (r.close === null ? "—" : fmtNum(r.close)) + "</td>" +
      "<td class='num'>" + fmtNum(r.sum) + "</td>" +
      "<td class='num " + (r.yld >= 5 ? "up" : "") + "'>" + fmtNum(r.yld) + "%</td>" +
      "<td class='num'>" + r.count + "</td><td class='num'>" + esc(r.lastEx) + "</td></tr>").join("") +
    '</tbody></table></div><div class="alert" style="margin-top:10px">殖利率用「已公告」合計計算；尚未公告最新一期的個股會被低估。高殖利率常伴隨除息前後的大幅波動與貼息風險，僅供篩選起點。</div>';
}

/* ---------- 板塊氣泡圖 ---------- */
let secScanning = false;
async function doSector() {
  if (secScanning) return;
  const poolSel = $("sec-pool").value;
  const pool = poolCodes(poolSel);
  if (!pool.length) { $("sec-status").textContent = poolSel === "custom" ? "自訂池是空的，請先在海選頁籤設定。" : "追蹤清單是空的，先到個股診斷加入。"; return; }
  secScanning = true;
  $("btn-sector").disabled = true;
  $("sector-result").innerHTML = "";
  const groups = {};
  let ok = 0, fail = 0;
  for (let idx = 0; idx < pool.length; idx++) {
    const code = pool[idx];
    $("sec-status").textContent = "掃描中 " + (idx + 1) + " / " + pool.length + "（成功 " + ok + "，失敗 " + fail + "）";
    $("sec-bar").style.width = Math.round((idx / pool.length) * 100) + "%";
    try {
      const a = await analyze(code);
      ok++;
      await loadInfoMap(false);
      const cat = infoOf(code).industry_category || "未分類";
      const closes = a.closes;
      const base = closes[Math.max(0, closes.length - 21)] || closes[0];
      const ret20 = base ? (closes[closes.length - 1] - base) / base * 100 : 0;
      const inst5 = (a.f5 + a.t5 + a.d5) / 1000; // 張
      groups[cat] = groups[cat] || { cat, ret: [], inst: [], vol: [], members: [] };
      groups[cat].ret.push(ret20);
      groups[cat].inst.push(inst5);
      groups[cat].vol.push(a.volume);
      groups[cat].members.push({ code, name: a.name, ret20, inst5 });
      renderSector(groups);
    } catch (e) { fail++; }
    await sleep(350);
  }
  $("sec-bar").style.width = "100%";
  $("sec-status").textContent = "完成：共 " + pool.length + " 檔，成功 " + ok + "，失敗 " + fail + "，涵蓋 " + Object.keys(groups).length + " 個板塊。點下方表格代號可載入個股診斷。";
  secScanning = false;
  $("btn-sector").disabled = false;
}
function renderSector(groups) {
  const rows = Object.values(groups).map((g) => ({
    cat: g.cat,
    n: g.members.length,
    ret: g.ret.reduce((s, v) => s + v, 0) / Math.max(1, g.ret.length),
    inst: g.inst.reduce((s, v) => s + v, 0),
    vol: g.vol.reduce((s, v) => s + v, 0) / Math.max(1, g.vol.length),
    members: g.members.slice().sort((a, b) => b.inst5 - a.inst5).slice(0, 3),
  })).sort((a, b) => b.inst - a.inst);
  drawSector($("sector-chart"), rows);
  $("sector-result").innerHTML = '<div class="table-wrap"><table><thead><tr><th>板塊</th><th>檔數</th><th>平均 20 日漲跌</th><th>法人 5 日合計（張）</th><th>均量（張）</th><th>代表個股</th></tr></thead><tbody>' +
    rows.map((r) => "<tr><td>" + esc(r.cat) + "</td><td class='num'>" + r.n + "</td>" +
      "<td class='num " + (r.ret >= 0 ? "up" : "down") + "'>" + (r.ret >= 0 ? "+" : "") + fmtNum(r.ret) + "%</td>" +
      "<td class='num " + (r.inst >= 0 ? "up" : "down") + "'>" + fmtInt(r.inst) + "</td>" +
      "<td class='num'>" + fmtInt(r.vol / 1000) + "</td>" +
      "<td>" + r.members.map((m) => "<a href='#' data-c='" + esc(m.code) + "'>" + esc(m.name) + " " + esc(m.code) + "</a>").join(" · ") + "</td></tr>").join("") +
    "</tbody></table></div>";
  document.querySelectorAll("#sector-result a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); doAnalyze(a.getAttribute("data-c")); switchTab("stock"); }));
}
function drawSector(canvas, rows) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600, h = 320;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!rows.length) return;
  const xs = rows.map((r) => r.ret), ys = rows.map((r) => r.inst);
  let x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 0);
  let y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 0);
  if (x1 === x0) { x1 += 1; x0 -= 1; }
  if (y1 === y0) { y1 += 1; y0 -= 1; }
  const padL = 56, padR = 12, padT = 12, padB = 30;
  const X = (v) => padL + (v - x0) / (x1 - x0) * (w - padL - padR);
  const Y = (v) => padT + (1 - (v - y0) / (y1 - y0)) * (h - padT - padB);
  const css = getComputedStyle(document.documentElement);
  ctx.strokeStyle = css.getPropertyValue("--border") || "#ddd";
  ctx.fillStyle = css.getPropertyValue("--muted") || "#888";
  ctx.font = "11px sans-serif";
  for (let g = 0; g <= 4; g++) {
    const xv = x0 + (x1 - x0) * g / 4;
    ctx.beginPath(); ctx.moveTo(X(xv), padT); ctx.lineTo(X(xv), h - padB); ctx.stroke();
    ctx.fillText(fmtNum(xv, 1) + "%", X(xv) - 14, h - 12);
  }
  // 零軸
  ctx.strokeStyle = "#8a94a6";
  ctx.beginPath(); ctx.moveTo(X(0), padT); ctx.lineTo(X(0), h - padB); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
  const vols = rows.map((r) => r.vol);
  const vMax = Math.max(...vols);
  const palette = ["#2563eb", "#c81e1e", "#15803d", "#b45309", "#7c3aed", "#0e7490", "#be185d", "#4d7c0f"];
  rows.forEach((r, i) => {
    const rad = 6 + 22 * Math.sqrt(r.vol / Math.max(1, vMax));
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = palette[i % palette.length];
    ctx.beginPath(); ctx.arc(X(r.ret), Y(r.inst), rad, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = css.getPropertyValue("--text") || "#000";
    ctx.fillText(r.cat.slice(0, 6), X(r.ret) + rad + 3, Y(r.inst) + 4);
  });
}

/* ---------- 追蹤 / 最近 ---------- */
const LS_POOL = "twscan.custompool";
function poolCodes(sel) {
  if (sel === "watch") return getWatch().map((x) => x.code);
  if (sel === "custom") {
    try {
      const raw = localStorage.getItem(LS_POOL) || "";
      return raw.split(/[,\s、;]+/).map((s) => s.trim()).filter((s) => /^\d{4}[A-Z]?$/.test(s)).slice(0, 100);
    } catch (e) { return []; }
  }
  return TOP50.slice();
}
/* ---------- 研究筆記（localStorage） ---------- */
const LS_NOTES = "twscan.notes.v1";
function getNotes() {
  try { return JSON.parse(localStorage.getItem(LS_NOTES) || "{}"); } catch (e) { return {}; }
}
function setNotes(o) { try { localStorage.setItem(LS_NOTES, JSON.stringify(o)); } catch (e) { /* 忽略 */ } }
function renderNoteHint() {
  if (current && !$("note-code").value.trim()) $("note-code").value = current.code;
}
function noteLoad(codeRaw) {
  const code = (codeRaw || $("note-code").value || (current && current.code) || "").trim();
  if (!code) { $("note-msg").textContent = "請先輸入代號。"; return; }
  $("note-code").value = code;
  const n = getNotes()[code];
  $("note-text").value = n ? (n.text || "") : "";
  $("note-msg").textContent = n ? ("已載入（上次更新 " + (n.updated || "—") + "）") : "尚無筆記，可直接撰寫後儲存。";
  $("note-result").innerHTML = "";
}
function noteSave() {
  const code = ($("note-code").value || (current && current.code) || "").trim();
  if (!code) { $("note-msg").textContent = "請先輸入代號。"; return; }
  const all = getNotes();
  all[code] = { text: $("note-text").value, updated: fmtDate(new Date()) };
  setNotes(all);
  $("note-msg").textContent = "已儲存 " + code + " 的筆記（僅存本機）。";
}
function noteSearch() {
  const kw = $("note-search").value.trim();
  const all = getNotes();
  const keys = Object.keys(all).filter((c) => !kw || c.includes(kw) || (all[c].text || "").includes(kw));
  $("note-result").innerHTML = keys.length ? keys.map((c) =>
    '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0">' +
    "<span><b class='num'>" + esc(c) + "</b> <span class='muted' style='font-size:12px'>" + esc(all[c].updated || "") + " · " + esc((all[c].text || "").slice(0, 40)) + (String(all[c].text || "").length > 40 ? "…" : "") + "</span></span>" +
    '<button type="button" data-c="' + esc(c) + '">載入</button></div>'
  ).join("") : '<p class="muted">沒有符合的筆記。</p>';
  document.querySelectorAll("#note-result button").forEach((b) => b.addEventListener("click", () => noteLoad(b.getAttribute("data-c"))));
}

/* ---------- 警示與日報（追蹤清單 × 本機定時檢查） ---------- */
const LS_ALERT_LAST = "twscan.alert_last.v1";
function alertSettings() {
  return {
    macdUp: $("al-macd-up").checked, macdDn: $("al-macd-dn").checked,
    kdGold: $("al-kd-gold").checked, kdDead: $("al-kd-dead").checked,
    above20: $("al-above20").checked, below20: $("al-below20").checked,
    inst: $("al-inst").checked,
  };
}
function alertCheckOne(a, s) {
  const hits = [];
  const prevClose = a.prev ? a.prev.close : null;
  if (s.macdUp && a.hist > 0) hits.push("MACD 翻紅（柱狀 " + fmtNum(a.hist) + "）");
  if (s.macdDn && a.hist < 0 && a.hist > -0.001) hits.push("MACD 剛翻空"); // 寬鬆：柱狀轉負初期
  if (s.macdDn && a.hist < 0) hits.push("MACD 翻空（柱狀 " + fmtNum(a.hist) + "）");
  if (s.kdGold && a.k !== null && a.k > a.d) hits.push("KD：K 在 D 之上（K " + fmtNum(a.k, 1) + " / D " + fmtNum(a.d, 1) + "）");
  if (s.kdDead && a.k !== null && a.k < a.d) hits.push("KD：K 跌破 D（K " + fmtNum(a.k, 1) + " / D " + fmtNum(a.d, 1) + "）");
  if (s.above20 && prevClose !== null && prevClose <= a.ma20 && a.last.close > a.ma20) hits.push("站上 MA20（" + fmtNum(a.ma20) + "）");
  if (s.below20 && prevClose !== null && prevClose >= a.ma20 && a.last.close < a.ma20) hits.push("跌破 MA20（" + fmtNum(a.ma20) + "）");
  if (s.inst && (a.fStreak >= 3 || a.tStreak >= 3)) hits.push("法人連買（外資連 " + a.fStreak + " 日、投信連 " + a.tStreak + " 日）");
  if (s.inst && (a.fStreak <= -3 || a.tStreak <= -3)) hits.push("法人連賣（外資連 " + a.fStreak + " 日、投信連 " + a.tStreak + " 日）");
  return hits;
}
async function doAlertCheck() {
  const w = getWatch();
  if (!w.length) { $("alert-result").innerHTML = '<p class="muted">追蹤清單是空的，先到個股診斷加入。</p>'; return; }
  const s = alertSettings();
  $("alert-msg").textContent = "檢查中（" + w.length + " 檔）…";
  $("alert-result").innerHTML = "";
  const rows = [];
  for (const x of w.slice(0, 30)) {
    try {
      const a = await analyze(x.code);
      const hits = alertCheckOne(a, s);
      // 去重：同一代號同一條件當日只提示一次
      let last = {};
      try { last = JSON.parse(localStorage.getItem(LS_ALERT_LAST) || "{}"); } catch (e) { last = {}; }
      const day = fmtDate(new Date());
      const key = x.code + "|" + day;
      const seen = new Set(last[key] || []);
      const fresh = hits.filter((h) => !seen.has(h.split("（")[0]));
      if (fresh.length) {
        last[key] = (last[key] || []).concat(fresh.map((h) => h.split("（")[0]));
        try { localStorage.setItem(LS_ALERT_LAST, JSON.stringify(last)); } catch (e) { /* 忽略 */ }
      }
      rows.push({ a, hits, fresh });
      await sleep(350);
    } catch (e) { rows.push({ code: x.code, error: e instanceof Error ? e.message : String(e) }); }
  }
  const anyFresh = rows.some((r) => r.fresh && r.fresh.length);
  $("alert-msg").textContent = "檢查完成" + (anyFresh ? "：有新觸發（標示 NEW）" : "：本次無新觸發（均為今日已提示或未達條件）");
  $("alert-result").innerHTML = rows.map((r) => {
    if (r.error) return '<p class="muted">' + esc(r.code) + "：" + esc(r.error) + "</p>";
    const tag = r.fresh && r.fresh.length ? ' <span class="pill good">NEW</span>' : "";
    return '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0">' +
      "<span><b>" + esc(r.a.name) + '</b> <span class="muted num">' + esc(r.a.code) + "</span> — " + (r.hits.length ? esc(r.hits.join("；")) : '<span class="muted">未達勾選條件</span>') + tag + "</span>" +
      '<button type="button" data-c="' + esc(r.a.code) + '">開啟診斷</button></div>';
  }).join("");
  document.querySelectorAll("#alert-result button").forEach((b) => b.addEventListener("click", () => doAnalyze(b.getAttribute("data-c"))));
}
async function doDaily() {
  const w = getWatch();
  if (!w.length) { $("daily-result").innerHTML = '<p class="muted">追蹤清單是空的，先到個股診斷加入。</p>'; return; }
  $("alert-msg").textContent = "產出日報中（" + w.length + " 檔）…";
  $("daily-result").innerHTML = "";
  const rows = [];
  for (const x of w.slice(0, 30)) {
    try { rows.push(await analyze(x.code)); await sleep(350); }
    catch (e) { rows.push({ code: x.code, error: e instanceof Error ? e.message : String(e) }); }
  }
  const good = rows.filter((r) => !r.error);
  const up = good.filter((r) => r.pct > 0).length, dn = good.filter((r) => r.pct < 0).length;
  const strong = good.filter((r) => r.total >= 4).map((r) => r.name + r.code).join("、") || "無";
  const weak = good.filter((r) => r.total < 2.5).map((r) => r.name + r.code).join("、") || "無";
  const row = (label, fn) => "<tr><td>" + label + "</td>" + good.map((a) => "<td class='num'>" + fn(a) + "</td>").join("") + "</tr>";
  $("alert-msg").textContent = "";
  $("daily-result").innerHTML = '<h3 style="margin:4px 0">今日日報（' + fmtDate(new Date()) + '）</h3>' +
    '<div class="kv"><span class="muted">追蹤</span><span>' + good.length + " 檔成功 · 上漲 " + up + " 檔 · 下跌 " + dn + " 檔</span>" +
    '<span class="muted">結構強勢（≥4 分）</span><span>' + esc(strong) + '</span>' +
    '<span class="muted">結構偏弱（<2.5 分）</span><span>' + esc(weak) + "</span></div>" +
    '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>項目</th>' +
    good.map((a) => "<th>" + esc(a.name) + " " + esc(a.code) + "</th>").join("") + "</tr></thead><tbody>" +
    row("現價 / 漲跌", (a) => fmtNum(a.last.close) + " / " + (a.pct > 0 ? "+" : "") + fmtNum(a.pct) + "%") +
    row("綜合 / 判讀", (a) => fmtNum(a.total, 1) + " · " + esc(a.verdict)) +
    row("訊號矩陣", (a) => esc(a.sigAll)) +
    row("法人", (a) => "外資連 " + a.fStreak + " 日 / 投信連 " + a.tStreak + " 日") +
    row("位置", (a) => "60日 " + fmtNum(a.pos60, 0) + "% · 距高 " + fmtNum(a.drawdown, 1) + "%") +
    "</tbody></table></div><div class='alert' style='margin-top:10px'>日報為收盤結構摘要，非買賣建議；盤中數值會變動，收盤後為準。</div>";
}

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
  $("tab-backtest").hidden = name !== "backtest";
  $("tab-dividend").hidden = name !== "dividend";
  $("tab-sector").hidden = name !== "sector";
  $("tab-watch").hidden = name !== "watch";
  $("tab-notes").hidden = name !== "notes";
  $("tab-alerts").hidden = name !== "alerts";
  if (name === "watch") renderWatch();
  if (name === "notes") renderNoteHint();
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
    "<span class='muted'>回測</span><span>MACD 金叉買、死叉賣，隔日開盤價執行；勝率、平均報酬、最大回檔與 Buy&Hold 同期比較。未計成本，僅驗方向性。</span>" +
    "<span class='muted'>除息</span><span>近一年已公告現金股利合計 / 現價為殖利率；尚未公告最新一期者會被低估，僅供篩選起點。</span>" +
    "<span class='muted'>板塊</span><span>X 為 20 日漲跌、Y 為 5 日法人合計（張）、氣泡為均量；產業來自 FinMind 分類。</span>" +
    "<span class='muted'>筆記</span><span>研究筆記只存本機 localStorage，跨裝置不會同步；僅供個人研究記錄。</span>" +
    "<span class='muted'>警示日報</span><span>以追蹤清單為對象的收盤條件檢查，需開著本頁才會每 60 分鐘跑一次；重要價位以券商警示為準。</span>" +
    "<span class='muted'>動能 MD14</span><span>14 日漲跌幅，站穩為正；沿用原站口徑摘要。</span>" +
    "<span class='muted'>訊號矩陣</span><span>AI 綜合/MACD/位置/KD/均線/法人/OBV/流體八格，多空觀投票；≥3 票差為共振，僅為方向投票。</span>" +
    "<span class='muted'>籌碼流體</span><span>法人 5 日合計（張）× 20 日漲跌的四象限：吸籌拉升 / 逢低吸籌 / 拉高出貨 / 殺跌出貨。</span>" +
    "<span class='muted'>大盤連動</span><span>個股近 20 日收盤 vs TAIEX 的相關係數與 Beta；大盤資料不足則留空。</span>" +
    "<span class='muted'>基本面</span><span>近 12 個月營收年增率（月營收 YoY 中位數近似）、PER/PBR/殖利率、當日相關新聞標題；僅供交叉確認。</span>" +
    "</div><div class='alert' style='margin-top:10px'>免費額度有限（匿名＋個人 Token 每日約數百次）。掃描 50 檔會消耗約 100 次查詢，建議先設 Token、必要時再掃。OBI 逐筆內外盤、融資券明細、券商分點、千張大戶集保、美股期貨領先、VIP 授權、大富翁遊戲、早安推播非公開免費來源，未納入。</div>";
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
  $("btn-refresh").addEventListener("click", () => {
    memCache.clear();
    try {
      Object.keys(localStorage).filter((k) => k.indexOf(LS_PFX) === 0).forEach((k) => localStorage.removeItem(k));
      infoLoaded = false;
    } catch (e) { /* 忽略 */ }
    if ($("q").value.trim()) doAnalyze($("q").value, { force: true });
  });
  try { $("custom-pool").value = localStorage.getItem(LS_POOL) || ""; } catch (e) { /* 忽略 */ }
  $("btn-pool-save").addEventListener("click", () => {
    const v = $("custom-pool").value.trim();
    try { localStorage.setItem(LS_POOL, v); } catch (e) { /* 忽略 */ }
    const n = poolCodes("custom").length;
    $("pool-msg").textContent = n ? "已儲存 " + n + " 檔" : "已清空（格式：逗號或空白分隔的 4 碼代號）";
  });
  $("btn-scan").addEventListener("click", doScan);
  $("sort").addEventListener("change", () => { /* 下次渲染生效 */ });
  $("btn-compare").addEventListener("click", doCompare);
  $("btn-backtest").addEventListener("click", doBacktest);
  $("bt-code").addEventListener("keydown", (e) => { if (e.key === "Enter") doBacktest(); });
  $("btn-dividend").addEventListener("click", doDividend);
  $("div-sort").addEventListener("change", () => { /* 下次渲染生效 */ });
  $("btn-sector").addEventListener("click", doSector);
  $("btn-note-load").addEventListener("click", () => noteLoad());
  $("note-code").addEventListener("keydown", (e) => { if (e.key === "Enter") noteLoad(); });
  $("btn-note-save").addEventListener("click", noteSave);
  $("btn-note-clear").addEventListener("click", () => { $("note-text").value = ""; $("note-msg").textContent = "已清空輸入框（尚未儲存）。"; });
  $("btn-note-search").addEventListener("click", noteSearch);
  $("note-search").addEventListener("keydown", (e) => { if (e.key === "Enter") noteSearch(); });
  $("btn-alert-check").addEventListener("click", doAlertCheck);
  $("btn-daily").addEventListener("click", doDaily);
  setInterval(() => {
    try {
      if (document.visibilityState === "visible" && getWatch().length) doAlertCheck();
    } catch (e) { /* 定時檢查失敗不打擾 */ }
  }, 60 * 60 * 1000);
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
