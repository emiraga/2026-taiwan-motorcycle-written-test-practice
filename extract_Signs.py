#!/usr/bin/env -S uv run --
"""Extract the motorcycle "Signs" question bank (text + sign pictures) to JSON.

Layout (see the first sample image in the task): a four-column table of
``Question number | Answer | Question Illustrations | Question``. The road-sign
picture in column three is the visual prompt; the Question column holds the
three ``(1)/(2)/(3)`` options plus, sometimes, a lead-in prompt (e.g. "The
broken white line is a:") that we keep in ``question``.

Every sign question is kept -- no de-duplication is applied here, because the
sign picture is the real prompt and the option text alone is too ambiguous to
match reliably against the (text-only) master written-test bank.

Each record::

    {"number": N, "question": prompt, "options": [s, s, s], "correct": 1|2|3,
     "pictures": ["pictures/sign_NNN_1.jpg", ...]}
"""

import json
import sys
from pathlib import Path

import pdfplumber

from extract_common import clean_text, render_bbox, split_question

ROOT = Path(__file__).parent
PDF_PATH = ROOT.parent / "Signs_Multiple.pdf"
OUT_PATH = ROOT / "public" / "Signs_Multiple.json"
PIC_DIR = ROOT / "public" / "pictures"
RENDER_DPI = 220

# The illustration sits in the third column; an image belongs to a row when its
# centre falls inside that row vertically and inside the illustration column
# horizontally.
ILLUSTRATION_COL = 2


def parse_raw(pdf) -> list[dict]:
    """Return ``[{number, correct, content, images:[(page_idx, bbox)]}]`` rows."""
    raw: list[dict] = []
    source_index = 0
    for page_idx, page in enumerate(pdf.pages, start=1):
        for table in page.find_tables():
            extracted = table.extract()
            for row_obj, row_cells in zip(table.rows, extracted, strict=True):
                cells = [clean_text(c) for c in row_cells]
                if len(cells) < 4:
                    continue
                number, answer, content = cells[0], cells[1], cells[-1]

                # Some numbers are retired in the source ("This question is deleted").
                if number.isdigit() and "deleted" in content.lower():
                    continue

                # Images whose centre lands in this row's illustration column.
                illus = row_obj.cells[ILLUSTRATION_COL]
                imgs: list[tuple[int, tuple]] = []
                if illus is not None:
                    cx0, _, cx1, _ = illus
                    ry0, ry1 = row_obj.bbox[1], row_obj.bbox[3]
                    for img in page.images:
                        center_x = (img["x0"] + img["x1"]) / 2
                        center_y = (img["top"] + img["bottom"]) / 2
                        if ry0 <= center_y <= ry1 and cx0 <= center_x <= cx1:
                            imgs.append(
                                (page_idx, (img["x0"], img["top"], img["x1"], img["bottom"]))
                            )

                if number.isdigit() and answer in {"1", "2", "3"}:
                    source_index += 1
                    raw.append(
                        {
                            "number": source_index,
                            "correct": int(answer),
                            "content": content,
                            "images": imgs,
                        }
                    )
                    continue

                # Continuation row: wrapped text (and any spilled image) belongs
                # to the previous question.
                if number == "" and answer == "" and raw:
                    if content:
                        raw[-1]["content"] += " " + content
                    raw[-1]["images"].extend(imgs)
                    continue

                # The repeated column header on each page.
                if "Question" in content or "Question" in number or "number" in number:
                    continue
                raise ValueError(f"Page {page_idx}: unrecognized row: {row_cells!r}")
    return raw


def main() -> None:
    PIC_DIR.mkdir(parents=True, exist_ok=True)
    # Clear stale sign pictures so filenames stay deterministic; leave the
    # written-test bank's ``q*.jpg`` pictures untouched.
    for old in PIC_DIR.glob("sign_*.jpg"):
        old.unlink()

    with pdfplumber.open(PDF_PATH) as pdf:
        raw = parse_raw(pdf)

        questions: list[dict] = []
        malformed: list[dict] = []
        out_number = 0

        for rq in raw:
            out_number += 1
            pictures = _render(pdf, rq, out_number)
            try:
                prompt, options = split_question(rq["content"], rq["number"])
            except ValueError as exc:
                malformed.append({"number": rq["number"], "error": str(exc)})
                entry = {
                    "number": out_number,
                    "question": rq["content"],
                    "options": [],
                    "correct": rq["correct"],
                    "_malformed": True,
                }
                if pictures:
                    entry["pictures"] = pictures
                questions.append(entry)
                continue

            entry = {
                "number": out_number,
                "question": prompt,
                "options": options,
                "correct": rq["correct"],
            }
            if pictures:
                entry["pictures"] = pictures
            questions.append(entry)

    OUT_PATH.write_text(
        json.dumps({"questions": questions}, ensure_ascii=False, separators=(",", ":"))
    )
    with_pics = sum(1 for q in questions if q.get("pictures"))
    print(
        f"Signs: wrote {len(questions)} questions ({with_pics} with pictures) to {OUT_PATH.name}",
        file=sys.stderr,
    )
    if malformed:
        print(f"  {len(malformed)} malformed (source PDF defects):", file=sys.stderr)
        for m in malformed:
            print(f"    Q{m['number']}: {m['error']}", file=sys.stderr)


def _render(pdf, rq: dict, out_number: int) -> list[str]:
    """Render this question's sign pictures and return their relative paths."""
    paths: list[str] = []
    for page_idx, bbox in rq["images"]:
        name = f"sign_{out_number:03d}_{len(paths) + 1}.jpg"
        render_bbox(pdf.pages[page_idx - 1], bbox, PIC_DIR / name, dpi=RENDER_DPI)
        paths.append(f"pictures/{name}")
    return paths


if __name__ == "__main__":
    main()
