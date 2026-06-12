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
     "pictures": ["pictures/q123_1.jpg", ...]}

Pictures are rendered straight from the PDF page (so they keep colors) and
saved as JPEGs into ``pictures/`` to keep their on-disk size small.
"""

import json
import sys
from pathlib import Path

import pdfplumber

from extract_common import clean_text, render_bbox, split_question

ROOT = Path(__file__).parent
# Source PDFs live outside the repo (in a sibling temp dir) so the large
# binaries aren't checked in; only the extracted JSON + JPEGs are.
PDF_SRC = ROOT.parent
PDF_PATH = PDF_SRC / "Written_Test_Question_Bank.pdf"
OUT_PATH = ROOT / "public" / "Written_Test_Question_Bank.json"
PIC_DIR = ROOT / "public" / "pictures"
RENDER_DPI = 220


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
    # Includes legacy ``.png`` files from before we switched to JPEG output.
    for pattern in ("q*.jpg", "q*.png"):
        for old in PIC_DIR.glob(pattern):
            old.unlink()

    raw_questions: list[dict] = []
    expected_no = 1
    # Pending images attributed to whatever question continues on the next page.
    pending_images: list[tuple[int, tuple[float, float, float, float]]] = []

    def attach_continuation_images(imgs, page, page_idx) -> None:
        """Attach continuation-row images to the previous question.

        A question whose row sits at the bottom of a page can spill its
        picture onto the top of the next page, landing in a continuation
        row that belongs to the previous question. If no question exists
        yet, defer the images until we know which question they belong to.
        """
        if not imgs:
            return
        if raw_questions:
            target = raw_questions[-1]
            for bbox in imgs:
                target["pictures"].append(
                    _save_image(page, bbox, target["number"], len(target["pictures"]) + 1)
                )
        else:
            for bbox in imgs:
                pending_images.append((page_idx, bbox))

    with pdfplumber.open(PDF_PATH) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables()

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
                imgs = row_images[i]
                norm = normalize_row(row_cells)
                if norm is None:
                    # An entirely empty row still carries a continuation image
                    # when a question's row sits at the bottom of the previous
                    # page and its picture spills onto the top of this one.
                    attach_continuation_images(imgs, page, page_idx)
                    continue
                no_clean = clean_text(norm[0])
                ans_clean = clean_text(norm[1])
                content_clean = clean_text(norm[2])

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
                    attach_continuation_images(imgs, page, page_idx)
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
        json.dumps(
            {"questions": questions}, ensure_ascii=False, separators=(",", ":")
        )
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
    """Render the bbox region of `page` and save as a JPEG. Returns relative path."""
    name = f"q{qno:03d}_{idx}.jpg"
    render_bbox(page, bbox, PIC_DIR / name, dpi=RENDER_DPI)
    return f"pictures/{name}"


if __name__ == "__main__":
    main()
