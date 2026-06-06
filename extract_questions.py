#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pdfplumber>=0.11",
#   "Pillow>=10",
# ]
# ///
"""Extract motorcycle license question bank (text + embedded images) to JSON.

For each question, the JSON record looks like::

    {"number": N, "question": str, "options": [s, s, s], "correct": 1|2|3,
     "pictures": ["pictures/q123_1.png", ...]}

Pictures are rendered straight from the PDF page (so they keep colors,
transparency, etc.) and saved into ``pictures/``.
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).parent
PDF_PATH = ROOT / "public" / "Written_Test_Question_Bank.pdf"
OUT_PATH = ROOT / "public" / "Written_Test_Question_Bank.json"
PIC_DIR = ROOT / "public" / "pictures"
RENDER_DPI = 220
PIC_PADDING = 2  # pixels of padding around the cropped picture


def clean_text(text: str | None) -> str:
    if text is None:
        return ""
    text = text.replace("\r", "\n")
    text = text.replace("\\ ", " ")
    text = text.replace("\\'", "'").replace("\\$", "$")
    return re.sub(r"\s+", " ", text).strip()


# Manual overrides for questions whose option text is broken in the source PDF.
# `broken_content` must match the cleaned raw content exactly before the override
# is applied — that way running this script against a *different* PDF (with a
# different question bank) won't silently substitute the wrong text.
QUESTION_OVERRIDES: dict[int, dict] = {
    600: {
        "broken_content": (
            "On a road where left turns are prohibited, is it allowed to make "
            "a U-turn? (1) Yes, but you must watch not allowed. Violators will "
            "be fined and given 1 demerit point. (3) Yes, but you must turn on "
            "the left turn signal first."
        ),
        "question": "On a road where left turns are prohibited, is it allowed to make a U-turn?",
        "options": [
            "Yes, but you must watch for oncoming traffic and yield to pedestrians.",
            "No, it is not allowed. Violators will be fined and given 1 demerit point.",
            "Yes, but you must turn on the left turn signal first.",
        ],
        "correct": 2,
    },
}

OPTION_SPLIT = re.compile(r"\s*\(\s*([123])\s*\)\s*")


def split_question(content: str, qno: int) -> tuple[str, list[str]]:
    parts = OPTION_SPLIT.split(content)
    if len(parts) < 7:
        raise ValueError(f"Q{qno}: cannot find three options in: {content!r}")
    prompt = parts[0].strip().rstrip(":：").strip()
    options: list[str] = []
    for idx, marker_idx in enumerate((1, 3, 5), start=1):
        if parts[marker_idx] != str(idx):
            raise ValueError(f"Q{qno}: option markers out of order in: {content!r}")
        options.append(parts[marker_idx + 1].strip())
    if len(parts) > 7:
        tail = "".join(parts[7:]).strip()
        if tail:
            options[-1] = (options[-1] + " " + tail).strip()
    return prompt, [opt.rstrip(".。 ").strip() for opt in options]


def normalize_row(row: list) -> tuple[str, str, str] | None:
    cells = [(c if c is not None else "").strip() for c in row]
    non_empty = [(i, c) for i, c in enumerate(cells) if c]
    if not non_empty:
        return None
    if len(non_empty) == 1:
        return "", "", non_empty[0][1]
    content = non_empty[-1][1]
    head = [c for _, c in non_empty[:-1]]
    if len(head) >= 2 and head[0].isdigit() and head[1] in {"1", "2", "3"}:
        return head[0], head[1], content
    if len(head) == 1:
        return head[0], "", content
    return cells[0], cells[1] if len(cells) > 1 else "", content


def main() -> None:
    PIC_DIR.mkdir(exist_ok=True)
    # Clear any stale pictures from a prior run so file names stay deterministic.
    for old in PIC_DIR.glob("q*.png"):
        old.unlink()

    raw_questions: list[dict] = []
    expected_no = 1
    # Pending images attributed to whatever question continues on the next page.
    pending_images: list[tuple[int, tuple[float, float, float, float]]] = []

    with pdfplumber.open(PDF_PATH) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables()
            # Pre-render the page once if it has any images we might need.
            page_image = None

            def ensure_page_image():
                nonlocal page_image
                if page_image is None:
                    page_image = page.to_image(resolution=RENDER_DPI).original
                return page_image

            scale = RENDER_DPI / 72.0

            # Build a flat list of (row_bbox, content_cell_bbox, row_cells) for
            # every row in every table on this page, in reading order.
            page_rows: list[tuple[tuple, tuple, list]] = []
            for table in tables:
                extracted = table.extract()
                for row_obj, row_cells in zip(table.rows, extracted):
                    # The content column is the widest cell in the row.
                    cells = row_obj.cells
                    widest = max(
                        (c for c in cells if c is not None),
                        key=lambda c: (c[2] - c[0]),
                    )
                    page_rows.append((row_obj.bbox, widest, row_cells))

            # Match images to rows by vertical containment of the image center
            # AND horizontal overlap with the content cell.
            row_images: dict[int, list[tuple]] = {i: [] for i in range(len(page_rows))}
            for img in page.images:
                ix0, iy0, ix1, iy1 = img["x0"], img["top"], img["x1"], img["bottom"]
                center_y = (iy0 + iy1) / 2
                for i, (rbbox, content_bbox, _) in enumerate(page_rows):
                    rx0, ry0, rx1, ry1 = rbbox
                    if not (ry0 <= center_y <= ry1):
                        continue
                    cx0, _, cx1, _ = content_bbox
                    # require horizontal center inside content column
                    if cx0 <= (ix0 + ix1) / 2 <= cx1:
                        row_images[i].append((ix0, iy0, ix1, iy1))
                        break

            # Walk rows in order, gluing continuation rows into the previous
            # question and rendering any images they contain.
            for i, (_, _, row_cells) in enumerate(page_rows):
                norm = normalize_row(row_cells)
                if norm is None:
                    continue
                no_clean = clean_text(norm[0])
                ans_clean = clean_text(norm[1])
                content_clean = clean_text(norm[2])
                imgs = row_images[i]

                if no_clean.isdigit() and ans_clean in {"1", "2", "3"}:
                    number = int(no_clean)
                    if number != expected_no:
                        raise ValueError(
                            f"Page {page_idx}: expected Q{expected_no}, got Q{number}"
                        )
                    raw_questions.append(
                        {
                            "number": number,
                            "correct": int(ans_clean),
                            "content": content_clean,
                            "pictures": [],
                        }
                    )
                    expected_no += 1
                    # Any images carried over from a prior page belong to *this*
                    # question only when the question itself started on the prior
                    # page — i.e. only if the row that triggered the carry was a
                    # continuation row. We never carry images forward to a fresh
                    # question; flush them onto the previous one instead.
                    if pending_images:
                        if raw_questions[:-1]:
                            target = raw_questions[-2]
                            for src_page, bbox in pending_images:
                                target["pictures"].append(
                                    _save_image(pdf.pages[src_page - 1], bbox, target["number"], len(target["pictures"]) + 1)
                                )
                        pending_images.clear()

                    for bbox in imgs:
                        raw_questions[-1]["pictures"].append(
                            _save_image(page, bbox, raw_questions[-1]["number"], len(raw_questions[-1]["pictures"]) + 1)
                        )
                    continue

                if no_clean == "" and ans_clean == "":
                    if content_clean and raw_questions:
                        raw_questions[-1]["content"] += " " + content_clean
                    # Images in this continuation row belong to the previous Q.
                    if raw_questions:
                        target = raw_questions[-1]
                        for bbox in imgs:
                            target["pictures"].append(
                                _save_image(page, bbox, target["number"], len(target["pictures"]) + 1)
                            )
                    else:
                        # Defer until we know which question this becomes.
                        for bbox in imgs:
                            pending_images.append((page_idx, bbox))
                    continue

                # Skip recognizable header / cover rows.
                if (
                    "No" in no_clean
                    or "Category" in content_clean
                    or "Concepts" in content_clean
                    or "Yielding" in content_clean
                    or "Driving Skills" in content_clean
                    or "Question Content" in content_clean
                ):
                    continue
                raise ValueError(
                    f"Page {page_idx}: unrecognized row: {row_cells!r}"
                )

    # Final parse pass.
    questions: list[dict] = []
    malformed: list[dict] = []
    for rq in raw_questions:
        override = QUESTION_OVERRIDES.get(rq["number"])
        if override is not None:
            if rq["content"] != override["broken_content"]:
                raise ValueError(
                    f"Q{rq['number']}: override broken_content does not match "
                    f"this PDF. Override was written for a different question "
                    f"bank — remove it from QUESTION_OVERRIDES or update it.\n"
                    f"  expected: {override['broken_content']!r}\n"
                    f"  actual:   {rq['content']!r}"
                )
            entry = {
                "number": rq["number"],
                "question": override["question"],
                "options": list(override["options"]),
                "correct": override["correct"],
            }
            if rq["pictures"]:
                entry["pictures"] = rq["pictures"]
            questions.append(entry)
            continue
        try:
            prompt, options = split_question(rq["content"], rq["number"])
        except ValueError as exc:
            malformed.append({"number": rq["number"], "error": str(exc)})
            questions.append(
                {
                    "number": rq["number"],
                    "question": rq["content"],
                    "options": [],
                    "correct": rq["correct"],
                    "pictures": rq["pictures"],
                    "_malformed": True,
                }
            )
            continue
        entry = {
            "number": rq["number"],
            "question": prompt,
            "options": options,
            "correct": rq["correct"],
        }
        if rq["pictures"]:
            entry["pictures"] = rq["pictures"]
        questions.append(entry)

    OUT_PATH.write_text(
        json.dumps({"questions": questions}, ensure_ascii=False, indent=2)
    )
    total_pictures = sum(len(q.get("pictures", [])) for q in questions)
    qs_with_pictures = sum(1 for q in questions if q.get("pictures"))
    print(
        f"Wrote {len(questions)} questions ({qs_with_pictures} with pictures, "
        f"{total_pictures} files in {PIC_DIR.name}/) to {OUT_PATH.name}",
        file=sys.stderr,
    )
    if malformed:
        print(f"\n{len(malformed)} malformed (source PDF defects):", file=sys.stderr)
        for m in malformed:
            print(f"  Q{m['number']}: {m['error']}", file=sys.stderr)


def _save_image(page, bbox: tuple[float, float, float, float], qno: int, idx: int) -> str:
    """Render the bbox region of `page` and save as a PNG. Returns relative path."""
    scale = RENDER_DPI / 72.0
    x0, y0, x1, y1 = bbox
    px0 = max(0, int(x0 * scale) - PIC_PADDING)
    py0 = max(0, int(y0 * scale) - PIC_PADDING)
    px1 = int(x1 * scale) + PIC_PADDING
    py1 = int(y1 * scale) + PIC_PADDING
    pil = page.to_image(resolution=RENDER_DPI).original
    crop = pil.crop((px0, py0, px1, py1))
    name = f"q{qno:03d}_{idx}.png"
    crop.save(PIC_DIR / name)
    return f"pictures/{name}"


if __name__ == "__main__":
    main()
