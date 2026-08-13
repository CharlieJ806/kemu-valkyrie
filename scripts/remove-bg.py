# -*- coding: utf-8 -*-
"""批量去除 resource/ 立绘背景 → resource_nobg/(透明 PNG)。
运行: python scripts/remove-bg.py
依赖: pip install rembg(首次运行会下载 isnet-general-use 模型)
"""
import sys
from pathlib import Path

from rembg import remove, new_session
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "resource"
OUT = ROOT / "resource_nobg"


def main():
    files = sorted(SRC.rglob("*.png"))
    if not files:
        print("resource/ 下没有 png 文件")
        return
    session = new_session("isnet-general-use")
    for i, f in enumerate(files):
        rel = f.relative_to(SRC)
        out = OUT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            print(f"[{i + 1}/{len(files)}] skip {rel}", flush=True)
            continue
        img = Image.open(f).convert("RGBA")
        result = remove(img, session=session)
        result.save(out)
        print(f"[{i + 1}/{len(files)}] ok {rel}", flush=True)
    print("done")


if __name__ == "__main__":
    sys.exit(main())
