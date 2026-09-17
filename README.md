# 台股結構掃描（靜態網站）

純前端、無建置步驟：把這個資料夾丟上任何靜態主機（GitHub Pages / Netlify / Cloudflare Pages）即可用。

## 檔案

- `index.html` — 版面與九個頁籤（個股診斷 / 海選掃描 / 多股比較 / 回測統計 / 除息雷達 / 板塊氣泡 / 追蹤清單 / 研究筆記 / 警示日報）
- `app.js` — FinMind 查詢、指標計算、評分與渲染（無依賴；MA/RSI/KD/MACD/布林/OBV/動能 MD14/籌碼流體/大盤連動皆前端計算）
- `assets/style.css` — 淺色 / 深色專業版樣式

## 功能對照原體驗版

| 原站功能 | 本站做法 |
|---|---|
| 搜尋代號＋分析 | 個股診斷頁籤，支援代號與常用名稱 |
| 法人籌碼卡（外資投信自營＋連買賣） | 有，近 5 日合計＋12 日明細表 |
| MACD / KD / 均線乖離 | 有，全部前端即時計算 |
| 高點底部評分 | 以 60 日＋年區間百分位＋距高點呈現 |
| AI 建言 | 改為規則判讀（趨勢 / 動能 / 籌碼 / 位置），無黑箱 |
| 海選掃描（底部 / MACD 矩陣 / 碎骨 / 法人） | 有，市值前 50 或追蹤清單，節流掃描 |
| 多股比較 | 有，2–3 檔六維度表格 |
| 追蹤清單 | 有，localStorage 本機保存 |
| 知識站 / 方法說明 | 有，方法說明對話框＋本 README |
| 主題切換 | 有，淺色 / 深色 |
| Token 設定 | 有，只存本機 localStorage |

原站全部白盒可復刻功能：個股診斷六維度＋訊號矩陣八格（AI 綜合/MACD/位置/KD/均線/法人/OBV/流體）＋動能掃描 MD14＋布林位置＋OBV 方向＋籌碼流體四象限＋外資投信背離＋大盤連動（TAIEX 相關係數/Beta）＋基本面（營收 YoY/PER/PBR/新聞標題連結）＋海選 8 模式（底部/MACD/碎骨/法人連買/資減近似/突破/外盤強勢近似/籌碼週期）＋回測統計＋除息雷達＋板塊氣泡＋研究筆記＋警示日報（本機定時檢查）。

刻意不做的：VIP / 授權碼 / 大富翁遊戲 / 早安推播（需後端）/ OBI 逐筆內外盤 / 融資券明細 / 券商分點（資料集名稱已失效）/ 千張大戶集保（付費牆）/ 美股期貨領先外部源 / 市值熱力圖（需市值源）。「資減人走」「外盤強勢」為結構近似值，方法說明與頁尾已揭露。

## 資料來源

- `TaiwanStockPrice`（日線 OHLC＋量）
- `TaiwanStockInstitutionalInvestorsBuySell`（三大法人買賣超）
- `TaiwanStockInfo`（名稱對照；內建常用 20 檔加速）
- `TaiwanStockDividend`（除息雷達：已公告現金股利合計 / 現價）
- `TaiwanStockPER`（本益比 / 股價淨值比 / 殖利率；基本面按鈕載入）
- `TaiwanStockMonthRevenue`（近 12 個月營收 YoY；基本面按鈕載入）
- `TaiwanStockNews`（當日相關新聞標題；僅單日查詢有效）

未設定 Token 時走匿名額度；右上「API Token」可貼個人 Token（只存本機）。

## 部署到 GitHub Pages（5 分鐘）

1. 在 GitHub 建一個新的 public repo（例如 `tw-stock-scan`）。
2. 把 `index.html`、`app.js`、`assets/style.css`、`README.md` 推到 `main` 分支根目錄。
3. repo → Settings → Pages → Source 選「Deploy from a branch」，Branch 選 `main` / `/ (root)` → Save。
4. 等 1–2 分鐘，開啟 `https://你的帳號.github.io/tw-stock-scan/` 即可。

可用深色模式測試一次、掃一次小池（追蹤清單先加 2 檔）確認 FinMind 連線正常。

## 本機預覽

```bash
python3 -m http.server 8000
# 開 http://localhost:8000/index.html 所在目錄
```

注意：直接用 `file://` 開會被瀏覽器擋 fetch，請用上面的 http server 方式預覽。

## 免責

內容僅供研究參考，不構成投資建議。
