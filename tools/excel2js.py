#!/usr/bin/env python3
"""Excel 题库 → js/data.js 转换工具

使用：
  cd tools && python excel2js.py
  # 或在项目根目录：python tools/excel2js.py

生成：
  ../js/data.js   — SUBJECTS 对象（含所有科目 + 填空题支持）
  ../马克思题库.xlsx — 由原硬编码题库导出，便于扩充
"""
import sys, os, json, re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OS_XLSX   = ROOT / "操作系统题库_含填空题.xlsx"
DB_XLSX   = ROOT / "数据库题库.xlsx"
MARX_XLSX = ROOT / "马克思题库.xlsx"
OUT_JS    = ROOT / "js" / "data.js"

# ---------------------------------------------------------------------------
# Excel 解析
# ---------------------------------------------------------------------------

def parse_xlsx(path: Path) -> list[dict]:
    """解析单列制表格式 Excel，返回题目列表。"""
    df = pd.read_excel(path, header=None)
    questions: list[dict] = []
    i, qid = 0, 1
    col = df.iloc[:, 0]   # 第一列

    def cell(row):
        v = col.iloc[row] if row < len(col) else None
        return str(v).strip() if pd.notna(v) else ""

    while i < len(col):
        marker = cell(i)
        if marker.startswith("题目") or marker.startswith("һ"):  # 防乱码
            q_text = cell(i + 1) if i + 1 < len(col) else ""
            raw_opts = cell(i + 2) if i + 2 < len(col) else ""
            raw_ans  = cell(i + 3) if i + 3 < len(col) else ""

            # 去掉题目标记尾部的数字和标点，用于后续匹配
            # 判断题型：选项行是否以 A 开头
            is_choice = bool(re.match(r"^A[)）、\.·：:]", raw_opts))

            if is_choice:
                q, answer = _parse_choice(q_text, raw_opts, raw_ans)
            else:
                q, answer = _parse_fill(q_text, raw_opts, raw_ans)

            if q:
                q["id"] = qid
                questions.append(q)
                qid += 1

            # 跳过到下一个题目标记
            i += 5 if is_choice else 4
        else:
            i += 1

    return questions


def _parse_choice(q_text: str, opts_row: str, ans_row: str):
    """解析选择题。"""
    options = {}
    for m in re.finditer(r"([A-D])[)）、\.·：:]\s*(.+?)(?=\s+[A-D][)）、\.·：:]|$)", opts_row):
        options[m.group(1)] = m.group(2).strip()

    ans_raw = ans_row.replace("正确答案", "").lstrip("：:").strip()
    # 可能是 "AB"（多选）或 "A"（单选），也可能是 "A B"
    letters = [c for c in ans_raw if c in "ABCD"]
    if not letters:
        # 有时候答案写成选项内容而非字母
        for letter, text in options.items():
            if text in ans_raw:
                letters.append(letter)

    q_type = "single" if len(letters) == 1 else "multiple"
    return {
        "question": q_text,
        "options": options if options else None,
        "answer": sorted(letters),
        "type": q_type,
        "source": ""
    }, letters


def _parse_fill(q_text: str, opts_row: str, ans_row: str):
    """解析填空题。

    opts_row：选择题时是选项行，填空题时可能是空或就是答案的前一行；
    ans_row：始终是答案行（正确答案：...）。
    """
    # 有时填空题的正确答案直接在 opts_row（没有选项行的情况）
    if ans_row.startswith("正确答案"):
        ans_raw = ans_row.replace("正确答案", "").lstrip("：:").strip()
    else:
        # 退而求其次，把 opts_row 当答案行
        ans_raw = opts_row.replace("正确答案", "").lstrip("：:").strip()

    # 多个空：(1)xxx (2)xxx 或 ；分号分隔
    parts = re.findall(r"\(\d+\)\s*(.+?)(?=\s*\(\d+\)|$)", ans_raw)
    if not parts:
        parts = [p.strip() for p in re.split(r"[；;、]", ans_raw) if p.strip()]
    if not parts:
        parts = [ans_raw.strip()]

    return {
        "question": q_text,
        "options": None,
        "answer": parts,
        "type": "fill",
        "source": ""
    }, parts


# ---------------------------------------------------------------------------
# 马克思原题：从旧 data.js 读取
# ---------------------------------------------------------------------------

def load_marx_data_js(path: Path) -> list[dict]:
    """从旧 data.js 的 QUESTION_BANK 变量中提取题目列表。

    旧 data.js 的值本身是合法 JSON 数组（键带双引号），直接截取方括号部分解析。"""
    text = path.read_text(encoding="utf-8")
    # 定位第一个 [ 到最后一个 ] 之间的内容
    start = text.index("[")
    end   = text.rindex("]") + 1
    return json.loads(text[start:end])


def export_marx_xlsx(questions: list[dict], path: Path):
    """将马克思题目列表导出为 Excel（与操作系统题库格式一致）。"""
    rows = []
    for q in questions:
        rows.append([f"题目{q['id']}"])
        rows.append([q["question"]])
        if q.get("options"):
            opts = "  ".join(f"{k}){v}" for k, v in q["options"].items())
            rows.append([opts])
        else:
            rows.append([""])
        ans = q["answer"]
        if len(ans) == 1 and len(ans[0]) == 1 and ans[0] in "ABCD":
            rows.append([f"正确答案：{ans[0]}"])
        else:
            rows.append([f"正确答案：{'；'.join(ans)}"])
        rows.append([None])  # 空行分隔

    pd.DataFrame(rows).to_excel(path, index=False, header=False, engine="openpyxl")


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def write_data_js(subjects: dict, out: Path):
    lines = ["/** 题库数据 — 由 tools/excel2js.py 自动生成 */"]
    lines.append("const SUBJECTS = {")
    for key, info in subjects.items():
        lines.append(f"  {key}: {{")
        lines.append(f'    name: {json.dumps(info["name"], ensure_ascii=False)},')
        lines.append(f"    questions: {json.dumps(info['questions'], ensure_ascii=False, indent=4)}")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("let currentSubject = 'marx';")
    lines.append("let QUESTION_BANK = SUBJECTS[currentSubject].questions;")
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"[OK] 写入 {out}（{sum(len(s['questions']) for s in subjects.values())} 题）")


def main():
    subjects: dict[str, dict] = {}

    # —— 马克思（从备份的旧 data.js 读取，避免被本次脚本覆盖）——
    old_data = ROOT / "js" / "data_old.js"
    if old_data.exists():
        try:
            marx_qs = load_marx_data_js(old_data)
            # 确保 id 顺序
            for idx, q in enumerate(marx_qs, 1):
                q["id"] = idx
            subjects["marx"] = {"name": "马克思主义原理", "questions": marx_qs}
            print(f"[OK] 马克思 {len(marx_qs)} 题")
            # 导出 Excel（便于后续扩充）
            if not MARX_XLSX.exists():
                export_marx_xlsx(marx_qs, MARX_XLSX)
                print(f"[OK] 已导出 {MARX_XLSX}")
        except Exception as e:
            print(f"[WARN] 读取旧 data.js 失败：{e}")

    # —— 操作系统 ——
    if OS_XLSX.exists():
        os_qs = parse_xlsx(OS_XLSX)
        subjects["os"] = {"name": "操作系统", "questions": os_qs}
        print(f"[OK] 操作系统 {len(os_qs)} 题")

    # —— 数据库 ——
    if DB_XLSX.exists():
        db_qs = parse_xlsx(DB_XLSX)
        subjects["db"] = {"name": "数据库", "questions": db_qs}
        print(f"[OK] 数据库 {len(db_qs)} 题")

    if not subjects:
        print("[ERROR] 未找到任何题库数据", file=sys.stderr)
        sys.exit(1)

    write_data_js(subjects, OUT_JS)
    print("完成！刷新浏览器即可使用新题库。")


if __name__ == "__main__":
    main()