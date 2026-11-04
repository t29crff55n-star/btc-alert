#!/usr/bin/env python3
"""把 engine.js 内联进 index.src.html，生成单文件 index.html。"""
from pathlib import Path

here = Path(__file__).parent
src = (here / "index.src.html").read_text(encoding="utf-8")
eng = (here / "engine.js").read_text(encoding="utf-8")
(here / "index.html").write_text(src.replace("<!--ENGINE-->", "<script>\n" + eng + "</script>"), encoding="utf-8")
