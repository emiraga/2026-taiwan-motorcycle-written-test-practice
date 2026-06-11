#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pdfplumber>=0.11",
# ]
# ///
"""Extract the motorcycle "Regulations" question bank (text only) to JSON.

Layout (see the second sample image in the task): a three-column table of
``Question number | Answer | Question`` where the Question cell holds the prompt
and its three ``(1)/(2)/(3)`` options inline. The first PDF page is a
category-code legend (two columns) and is skipped.

Questions that already appear in ``public/Written_Test_Question_Bank.json`` are
dropped via :class:`extract_common.DuplicateIndex` so the merged study app never
shows the same regulation twice. See that class for the matching strategy.

Each surviving record::

    {"number": N, "question": str, "options": [s, s, s], "correct": 1|2|3}
"""

import json
import sys
from pathlib import Path

import pdfplumber

from extract_common import (
    DuplicateIndex,
    clean_text,
    normalize,
    option_key,
    split_question,
)

ROOT = Path(__file__).parent
PDF_PATH = ROOT.parent / "Regulations_Multiple.pdf"
OUT_PATH = ROOT / "public" / "Regulations_Multiple.json"


def parse_raw(pdf) -> list[dict]:
    """Return ``[{number, correct, content}]`` rows, gluing wrapped lines."""
    raw: list[dict] = []
    for page_idx, page in enumerate(pdf.pages, start=1):
        for table in page.find_tables():
            for row in table.extract():
                cells = [clean_text(c) for c in row]
                # The category-code legend on page 1 is a two-column table.
                if len(cells) < 3:
                    continue
                number, answer, content = cells[0], cells[1], cells[2]

                # Some numbers are retired in the source ("This question is deleted").
                if number.isdigit() and "deleted" in content.lower():
                    continue

                if number.isdigit() and answer in {"1", "2", "3"}:
                    raw.append(
                        {"number": int(number), "correct": int(answer), "content": content}
                    )
                    continue

                # Continuation row: the prompt/options wrapped onto a new line.
                if number == "" and answer == "" and content and raw:
                    raw[-1]["content"] += " " + content
                    continue

                # Recognizable header / legend rows we deliberately ignore.
                if (
                    "Question" in content
                    or "Category" in number
                    or "Classification" in content
                    or number == "Category code"
                ):
                    continue
                raise ValueError(f"Page {page_idx}: unrecognized row: {row!r}")
    return raw


def main() -> None:
    index = DuplicateIndex()

    with pdfplumber.open(PDF_PATH) as pdf:
        raw = parse_raw(pdf)

    questions: list[dict] = []
    malformed: list[dict] = []
    removed: list[tuple] = []
    seen_internal: set[str] = set()
    out_number = 0

    for rq in raw:
        try:
            prompt, options = split_question(rq["content"], rq["number"])
        except ValueError as exc:
            malformed.append({"number": rq["number"], "error": str(exc)})
            out_number += 1
            questions.append(
                {
                    "number": out_number,
                    "question": rq["content"],
                    "options": [],
                    "correct": rq["correct"],
                    "_malformed": True,
                }
            )
            continue

        # Skip questions that already live in the master written-test bank.
        match = index.text_duplicate(prompt, options)
        if match is not None:
            removed.append((rq["number"], match[1], prompt, match[0]["number"]))
            continue

        # Skip exact repeats within this same bank.
        internal_key = normalize(prompt) + "##" + option_key(options)
        if internal_key in seen_internal:
            removed.append((rq["number"], 1.0, prompt, "self"))
            continue
        seen_internal.add(internal_key)

        out_number += 1
        questions.append(
            {
                "number": out_number,
                "question": prompt,
                "options": options,
                "correct": rq["correct"],
            }
        )

    OUT_PATH.write_text(
        json.dumps({"questions": questions}, ensure_ascii=False, separators=(",", ":"))
    )
    print(
        f"Regulations: parsed {len(raw)} questions, removed {len(removed)} duplicates, "
        f"wrote {len(questions)} to {OUT_PATH.name}",
        file=sys.stderr,
    )
    # Surface the least-confident removals so they can be eyeballed. With the
    # aggressive threshold these are the ones most likely to be false positives.
    borderline = sorted(r for r in removed if r[3] != "self" and r[1] < 0.34)
    if borderline:
        print(f"  {len(borderline)} lower-confidence removals (review):", file=sys.stderr)
        for src_no, score, prompt, wb_no in borderline:
            print(f"    Q{src_no} (score {score:.2f} ~ written #{wb_no}): {prompt[:70]}", file=sys.stderr)
    if malformed:
        print(f"  {len(malformed)} malformed (source PDF defects):", file=sys.stderr)
        for m in malformed:
            print(f"    Q{m['number']}: {m['error']}", file=sys.stderr)


if __name__ == "__main__":
    main()
