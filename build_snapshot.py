# -*- coding: utf-8 -*-
"""Merge raw iFinD CSVs into a single stocks.json snapshot with explicit data semantics.

Data semantics (口径):
- price metrics: daily bars 2025-10-09..2026-09-30, forward-adjusted, source iFinD
- annVol: annualized volatility of daily log returns (x sqrt(244))
- maxDD: max drawdown over the window
- ret60/ret120: trailing 60/120 trading-day simple return
- ROE/netMargin/grossMargin/EPS/BPS: 2026 H1 report (20260630), NOT annualized
- revYoY/profitYoY/profitYoYEx: 2026 H1 YoY growth
- revYoYFY25/profitYoYFY25: FY2025 annual YoY growth (for acceleration check)
- PE/PB: static, close(2026-09-30) / EPS(FY2025) and close / BPS(2026H1)
"""
import csv, glob, json, math, os

RAW = "data_raw"

def read_csvs(pattern):
    rows = {}
    for f in sorted(glob.glob(os.path.join(RAW, pattern))):
        with open(f, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                code = r.get("thscode")
                if code:
                    rows[code] = r
    return rows

def fnum(v):
    try:
        if v is None or v == "" or v.upper() == "NA":
            return None
        return float(v)
    except (ValueError, AttributeError):
        return None

# --- prices ---
prices = {}
names = {}
for f in sorted(glob.glob(os.path.join(RAW, "price_*.csv"))):
    with open(f, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            code = r["thscode"]
            names[code] = r.get("thsname_cn", "")
            prices.setdefault(code, []).append((r["time"], fnum(r["close"])))

prof_h1 = read_csvs("prof_h1_*.csv")
grow_h1 = read_csvs("grow_h1_*.csv")
prof_fy25 = read_csvs("prof_fy25_*.csv")
grow_fy25 = read_csvs("grow_fy25_*.csv")

stocks = []
for code, series in sorted(prices.items()):
    series = [(t, c) for t, c in series if c is not None]
    series.sort()
    if len(series) < 120:
        continue
    closes = [c for _, c in series]
    last_date, close = series[-1]
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
    mean = sum(rets) / len(rets)
    var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
    ann_vol = math.sqrt(var) * math.sqrt(244) * 100
    peak, max_dd = closes[0], 0.0
    for c in closes:
        peak = max(peak, c)
        max_dd = min(max_dd, (c / peak - 1) * 100)
    ret60 = (closes[-1] / closes[-61] - 1) * 100 if len(closes) > 60 else None
    ret120 = (closes[-1] / closes[-121] - 1) * 100 if len(closes) > 120 else None

    p, g, p25, g25 = (prof_h1.get(code, {}), grow_h1.get(code, {}),
                      prof_fy25.get(code, {}), grow_fy25.get(code, {}))
    eps_fy25 = fnum(p25.get("ths_eps_basic_stock"))
    bps = fnum(p.get("ths_nav_ps_stock"))
    pe = round(close / eps_fy25, 2) if eps_fy25 and eps_fy25 > 0 else None
    pb = round(close / bps, 2) if bps and bps > 0 else None

    def rnd(v, n=2):
        return round(v, n) if v is not None else None

    stocks.append({
        "code": code,
        "name": names.get(code, ""),
        "close": rnd(close),
        "lastDate": last_date,
        "annVol": rnd(ann_vol, 1),
        "maxDD": rnd(max_dd, 1),
        "ret60": rnd(ret60, 1),
        "ret120": rnd(ret120, 1),
        "pe": pe,
        "pb": pb,
        "roeH1": rnd(fnum(p.get("ths_roe_stock"))),
        "netMargin": rnd(fnum(p.get("ths_net_sales_rate_stock"))),
        "grossMargin": rnd(fnum(p.get("ths_gross_selling_rate_stock"))),
        "epsFY25": rnd(eps_fy25),
        "revYoY": rnd(fnum(g.get("ths_or_yoy_stock")), 1),
        "profitYoY": rnd(fnum(g.get("ths_np_atsopc_yoy_stock")), 1),
        "profitYoYEx": rnd(fnum(g.get("ths_np_atsopc_dnrgal_yoy_stock")), 1),
        "revYoYFY25": rnd(fnum(g25.get("ths_or_yoy_stock")), 1),
        "profitYoYFY25": rnd(fnum(g25.get("ths_np_atsopc_yoy_stock")), 1),
    })

snapshot = {
    "meta": {
        "source": "iFinD (同花顺) via agent-gw plugin",
        "fetchedAt": "2026-10-02",
        "universeDesc": "49只跨行业A股代表样本（消费/银行/保险/医药/科技/能源/制造/公用等），非全市场",
        "priceWindow": "2025-10-09 至 2026-09-30（前复权日线）",
        "finPeriodH1": "2026年半年报 (20260630)",
        "finPeriodFY25": "2025年年报 (20251231)",
        "semantics": {
            "annVol": "日对数收益率标准差×√244，年化百分比",
            "maxDD": "窗口内最大回撤（%）",
            "ret60/ret120": "近60/120个交易日区间涨跌幅（%）",
            "pe": "静态市盈率 = 2026-09-30收盘价 / 2025年报基本EPS；EPS≤0时不给出",
            "pb": "市净率 = 2026-09-30收盘价 / 2026H1每股净资产",
            "roeH1": "2026H1 ROE（%），未年化",
            "revYoY/profitYoY/profitYoYEx": "2026H1 营收/归母净利/扣非归母净利 同比（%）",
            "revYoYFY25/profitYoYFY25": "2025年报 营收/归母净利 同比（%），用于判断改善加速度",
        },
    },
    "stocks": stocks,
}
os.makedirs("webapp/src/data", exist_ok=True)
with open("webapp/src/data/stocks.json", "w", encoding="utf-8") as fh:
    json.dump(snapshot, fh, ensure_ascii=False, indent=1)
print("stocks:", len(stocks))
missing = [s["code"] for s in stocks if s["pe"] is None or s["revYoY"] is None]
print("missing key fields:", missing)
