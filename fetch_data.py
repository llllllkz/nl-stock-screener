# -*- coding: utf-8 -*-
"""Batch-fetch real A-share data via iFinD plugin script and merge into CSVs.

前置：本机已安装 Kimi Work 的 iFinD 插件（agent-gw）。
也可用环境变量 IFIND_TOOL 显式指定 ifind_tool.py 的路径。
"""
import subprocess, sys, os, time, csv, glob

def _find_tool() -> str:
    if os.environ.get("IFIND_TOOL"):
        return os.environ["IFIND_TOOL"]
    home = os.path.expanduser("~")
    cands = glob.glob(os.path.join(
        home, "AppData", "Roaming", "kimi-desktop", "daimon-share", "daimon",
        "runtime", "kimi-code", "home", "plugins", "managed", "ifind",
        "scripts", "ifind_tool.py"))
    if not cands:
        sys.exit("未找到 ifind_tool.py，请设置环境变量 IFIND_TOOL 指向它。")
    return cands[0]

TOOL = _find_tool()
OUT = "data_raw"

UNIVERSE = [
    "600519.SH","000858.SZ","600887.SH","603288.SH","000568.SZ",
    "601398.SH","601288.SH","600036.SH","000001.SZ","601988.SH","601166.SH",
    "601318.SH","600030.SH","601601.SH",
    "600276.SH","000538.SZ","603259.SH","300760.SZ",
    "002415.SZ","000725.SZ","002230.SZ","603501.SH","002049.SZ","300750.SZ","002594.SZ",
    "000333.SZ","600690.SH","000651.SZ",
    "601088.SH","600028.SH","601899.SH","600019.SH","601857.SH",
    "600031.SH","601766.SH","002475.SZ",
    "000002.SZ","601668.SH",
    "601111.SH","600009.SH","601006.SH",
    "600900.SH","601985.SH",
    "600941.SH","601728.SH",
    "002027.SZ","601888.SH","600104.SH","600585.SH",
]

def batches(lst, n=3):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def call(api, params, tag, idx):
    fp = os.path.join(OUT, f"{tag}_{idx:02d}.csv")
    p = dict(params); p["file_path"] = fp
    cmd = [sys.executable, TOOL, "call", "--api-name", api,
           "--params-json", __import__("json").dumps(p, ensure_ascii=False)]
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                           encoding="utf-8", errors="replace")
        out = (r.stdout or "") + (r.stderr or "")
        # The tool writes the CSV file on success; file existence is the marker.
        if os.path.exists(fp) and os.path.getsize(fp) > 50:
            return True
        time.sleep(2 + attempt * 3)
    print(f"FAILED {tag}_{idx}: {out[-300:]}")
    return False

JOBS = [
    ("ifind_get_price",
     {"start_date": "2025-10-09", "end_date": "2026-09-30"}, "price"),
    ("ifind_get_stock_financial_index",
     {"financial_parameter": "20260630", "category": "profitability"}, "prof_h1"),
    ("ifind_get_stock_financial_index",
     {"financial_parameter": "20260630", "category": "growth"}, "grow_h1"),
    ("ifind_get_stock_financial_index",
     {"financial_parameter": "20251231", "category": "profitability"}, "prof_fy25"),
    ("ifind_get_stock_financial_index",
     {"financial_parameter": "20251231", "category": "growth"}, "grow_fy25"),
]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    total_fail = 0
    for api, params, tag in JOBS:
        if only and tag != only:
            continue
        for idx, b in enumerate(batches(UNIVERSE)):
            fp = os.path.join(OUT, f"{tag}_{idx:02d}.csv")
            if os.path.exists(fp) and os.path.getsize(fp) > 50:
                continue
            ok = call(api, dict(params, ticker=",".join(b)), tag, idx)
            print(f"{tag}_{idx:02d} {'ok' if ok else 'FAIL'} ({','.join(b)})", flush=True)
            if not ok:
                total_fail += 1
            time.sleep(0.8)
    print("DONE, failures:", total_fail)
