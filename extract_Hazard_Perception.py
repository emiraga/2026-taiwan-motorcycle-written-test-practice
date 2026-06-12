#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pdfplumber>=0.11",
# ]
# ///
"""Extract the motorcycle hazard-perception question bank (text only) to JSON.

Unlike ``extract_Written_Test.py`` this bank has no embedded pictures, but each
question references a hazard-perception video. The source table has four
columns: question number, answer, question content (prompt + three options),
and a video number whose cell is a hyperlink to the video download URL.

For each question, the JSON record looks like::

    {"number": N, "question": str, "options": [s, s, s], "correct": 1|2|3,
     "video_number": 4142, "video_file": "videos/4142.mp4",
     "video_url": "https://space2.thb.gov.tw/..."}

``video_file`` points at the locally downloaded copy in ``public/videos/`` and
is only included when that file actually exists. ``video_url`` is only included
when the video-number cell carries a hyperlink in the PDF.
"""

import json
import sys
from pathlib import Path

import pdfplumber

from extract_common import clean_text, split_question

ROOT = Path(__file__).parent
# Source PDF lives outside the repo (in a sibling temp dir) so the large
# binary isn't checked in; only the extracted JSON is.
PDF_SRC = ROOT.parent
PDF_PATH = PDF_SRC / "Hazard_Perception_Multiple.pdf"
OUT_PATH = ROOT / "public" / "Hazard_Perception_Multiple.json"
VIDEO_DIR = ROOT / "public" / "videos"
INCLUDE_NON_EXISTING_VIDEOS = True


def main() -> None:
    raw_questions: list[dict] = []
    expected_no = 1

    with pdfplumber.open(PDF_PATH) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            # Hyperlinks that point at an actual video download. The instruction
            # banner on page 1 also carries a reurl.cc link, which we ignore.
            video_links = [
                h for h in page.hyperlinks if "thb.gov.tw" in (h.get("uri") or "")
            ]

            for table in page.find_tables():
                # Pair each extracted row with its geometry so we can attribute
                # a video-number hyperlink to the row it sits in.
                for row_obj, row_cells in zip(table.rows, table.extract()):
                    cells = [(c if c is not None else "").strip() for c in row_cells]
                    if len(cells) < 4:
                        continue
                    no_clean = clean_text(cells[0])
                    ans_clean = clean_text(cells[1])
                    content_clean = clean_text(cells[2])
                    vid_clean = clean_text(cells[-1])

                    if no_clean.isdigit() and ans_clean in {"1", "2", "3"}:
                        number = int(no_clean)
                        if number != expected_no:
                            raise ValueError(
                                f"Page {page_idx}: expected Q{expected_no}, got Q{number}"
                            )
                        if not vid_clean.isdigit():
                            raise ValueError(
                                f"Q{number}: missing/invalid video number: {vid_clean!r}"
                            )
                        raw_questions.append(
                            {
                                "number": number,
                                "correct": int(ans_clean),
                                "content": content_clean,
                                "video_number": int(vid_clean),
                                "video_url": _row_video_url(row_obj.bbox, video_links),
                            }
                        )
                        expected_no += 1
                        continue

                    # Continuation row: glue the wrapped content onto the prior Q.
                    if no_clean == "" and ans_clean == "":
                        if content_clean and raw_questions:
                            raw_questions[-1]["content"] += " " + content_clean
                        continue

                    # Skip the repeated header row on each page.
                    if "No" in no_clean or "Question" in content_clean:
                        continue
                    raise ValueError(f"Page {page_idx}: unrecognized row: {row_cells!r}")

    questions: list[dict] = []
    malformed: list[dict] = []
    for rq in raw_questions:
        entry: dict = {"number": rq["number"]}
        try:
            prompt, options = split_question(rq["content"], rq["number"])
            entry["question"] = prompt
            entry["options"] = options
            entry["correct"] = rq["correct"]
        except ValueError as exc:
            malformed.append({"number": rq["number"], "error": str(exc)})
            entry["question"] = rq["content"]
            entry["options"] = []
            entry["correct"] = rq["correct"]
            entry["_malformed"] = True

        entry["video_number"] = rq["video_number"]
        video_path = VIDEO_DIR / f"{rq['video_number']}.mp4"
        if video_path.exists() or INCLUDE_NON_EXISTING_VIDEOS:
            entry["video_file"] = f"videos/{rq['video_number']}.mp4"
        if rq["video_url"]:
            entry["video_url"] = rq["video_url"]
        questions.append(entry)

    OUT_PATH.write_text(
        json.dumps(
            {"questions": questions}, ensure_ascii=False, separators=(",", ":")
        )
    )
    with_files = sum(1 for q in questions if q.get("video_file"))
    with_urls = sum(1 for q in questions if q.get("video_url"))
    print(
        f"Wrote {len(questions)} questions ({with_files} with local video files, "
        f"{with_urls} with video URLs) to {OUT_PATH.name}",
        file=sys.stderr,
    )
    if malformed:
        print(f"\n{len(malformed)} malformed (source PDF defects):", file=sys.stderr)
        for m in malformed:
            print(f"  Q{m['number']}: {m['error']}", file=sys.stderr)


def _row_video_url(row_bbox, video_links: list[dict]) -> str | None:
    """Return the video hyperlink whose vertical center sits inside this row."""
    _, ry0, _, ry1 = row_bbox
    for h in video_links:
        center_y = (h["top"] + h["bottom"]) / 2
        if ry0 <= center_y <= ry1:
            return h["uri"]
    return None


if __name__ == "__main__":
    main()
