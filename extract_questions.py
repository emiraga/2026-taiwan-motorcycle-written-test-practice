#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pdfplumber>=0.11",
# ]
# ///
"""Extract motorcycle license question bank from PDF to JSON."""

import json
import re
import sys
from pathlib import Path

import pdfplumber

PDF_PATH = Path(__file__).parent / "Written_Test_Question_Bank.pdf"
OUT_PATH = Path(__file__).parent / "questions.json"


def clean_text(text: str | None) -> str:
    if text is None:
        return ""
    text = text.replace("\r", "\n")
    # `\` followed by space is used as a soft line break inside option lists.
    text = text.replace("\\ ", " ")
    # Escaped apostrophes / dollar signs.
    text = text.replace("\\'", "'").replace("\\$", "$")
    text = re.sub(r"\s+", " ", text).strip()
    return text


OPTION_SPLIT = re.compile(r"\s*\(\s*([123])\s*\)\s*")


def split_question(content: str, qno: int) -> tuple[str, list[str]]:
    parts = OPTION_SPLIT.split(content)
    if len(parts) < 7:
        raise ValueError(f"Q{qno}: cannot find three options in: {content!r}")
    prompt = parts[0].strip().rstrip(":：").strip()
    options: list[str] = []
    for idx, marker_idx in enumerate((1, 3, 5), start=1):
        if parts[marker_idx] != str(idx):
            raise ValueError(
                f"Q{qno}: option markers out of order in: {content!r}"
            )
        options.append(parts[marker_idx + 1].strip())
    # Anything after the third marker belongs to option 3.
    if len(parts) > 7:
        tail = "".join(parts[7:]).strip()
        if tail:
            options[-1] = (options[-1] + " " + tail).strip()
    options = [opt.rstrip(".。 ").strip() for opt in options]
    return prompt, options


def normalize_row(row: list) -> tuple[str, str, str] | None:
    """Return (number, answer, content) strings from a raw table row.

    The wide layout on some pages splits the answer column with extra empty
    cells, so collapse empty cells between the number and the content rather
    than relying on fixed positions.
    """
    cells = [(c if c is not None else "").strip() for c in row]
    if not cells:
        return None
    # The content cell is always the longest one (and always last among
    # non-empty cells).
    non_empty = [(i, c) for i, c in enumerate(cells) if c]
    if not non_empty:
        return None
    if len(non_empty) == 1:
        # Continuation row: the only filled cell is the content.
        return "", "", non_empty[0][1]
    content_idx, content = non_empty[-1]
    head = [c for i, c in non_empty[:-1]]
    # Expect head to be [number, answer] (both short numeric strings) or
    # just [answer] / [number] / [content-header].
    if len(head) >= 2 and head[0].isdigit() and head[1] in {"1", "2", "3"}:
        return head[0], head[1], content
    if len(head) == 1:
        # Header row like ["No.", ..., "Question Content"] or stray label.
        return head[0], "", content
    # Shouldn't happen for well-formed question rows.
    return cells[0], cells[1] if len(cells) > 1 else "", content


def main() -> None:
    # First pass: collect raw {number, correct, content} tuples, gluing
    # together continuation rows (questions that span page breaks).
    raw_questions: list[dict] = []
    expected_no = 1
    saw_header = False

    with pdfplumber.open(PDF_PATH) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            for table in page.extract_tables():
                for row in table:
                    norm = normalize_row(row)
                    if norm is None:
                        continue
                    no_raw, ans_raw, content_raw = norm
                    no_clean = clean_text(no_raw)
                    ans_clean = clean_text(ans_raw)
                    content_clean = clean_text(content_raw)

                    if no_clean.isdigit() and ans_clean in {"1", "2", "3"}:
                        number = int(no_clean)
                        if number != expected_no:
                            raise ValueError(
                                f"Page {page_idx}: expected Q{expected_no}, "
                                f"got Q{number}. Row: {row!r}"
                            )
                        raw_questions.append(
                            {
                                "number": number,
                                "correct": int(ans_clean),
                                "content": content_clean,
                            }
                        )
                        expected_no += 1
                        continue

                    if no_clean == "" and ans_clean == "":
                        if content_clean and raw_questions:
                            raw_questions[-1]["content"] += " " + content_clean
                        continue

                    # The first table on page 1 is the index (single col),
                    # and its header row is ["No.", "", "An", "", "..."].
                    if (
                        not saw_header
                        and "No" in no_clean
                        or "Category" in content_clean
                        or "Concepts" in content_clean
                        or "Yielding" in content_clean
                        or "Driving Skills" in content_clean
                    ):
                        saw_header = True
                        continue

                    raise ValueError(
                        f"Page {page_idx}: unrecognized row: {row!r}"
                    )

    questions: list[dict] = []
    malformed: list[dict] = []
    for rq in raw_questions:
        try:
            prompt, options = split_question(rq["content"], rq["number"])
        except ValueError as exc:
            malformed.append({"number": rq["number"], "error": str(exc), "content": rq["content"]})
            questions.append(
                {
                    "number": rq["number"],
                    "question": rq["content"],
                    "options": [],
                    "correct": rq["correct"],
                    "_malformed": True,
                }
            )
            continue
        questions.append(
            {
                "number": rq["number"],
                "question": prompt,
                "options": options,
                "correct": rq["correct"],
            }
        )

    OUT_PATH.write_text(
        json.dumps({"questions": questions}, ensure_ascii=False, indent=2)
    )
    print(f"Wrote {len(questions)} questions to {OUT_PATH}", file=sys.stderr)
    if malformed:
        print(
            f"\n{len(malformed)} malformed question(s) — the source PDF itself "
            f"is missing option markers; entries kept with `_malformed: true`:",
            file=sys.stderr,
        )
        for m in malformed:
            print(f"  Q{m['number']}: {m['error']}", file=sys.stderr)


if __name__ == "__main__":
    main()
