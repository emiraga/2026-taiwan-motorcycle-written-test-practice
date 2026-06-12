"""Shared helpers for the motorcycle question-bank extractors.

The four ``extract_*.py`` scripts (Written_Test, Signs, Regulations and
Hazard_Perception) all pull a question bank out of a PDF table, split each
``"prompt (1) a (2) b (3) c"`` cell into a prompt plus three options, and undo
the PDF's stray escapes. Those parsing/cleaning helpers (and the picture
rendering in :func:`render_bbox`) live here so the extractors stay small and
consistent. :class:`DuplicateIndex` additionally lets ``extract_Regulations.py``
drop any question already present in the master
``public/Written_Test_Question_Bank.json``.

This module is plain stdlib (``re``/``json``/``difflib``); the optional picture
rendering in :func:`render_bbox` imports Pillow lazily so a text-only extractor
never needs that dependency.
"""

from __future__ import annotations

import difflib
import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).parent
WRITTEN_BANK = ROOT / "public" / "Written_Test_Question_Bank.json"

# Words too common to carry meaning; dropped before token-overlap comparison so
# that a reworded question still matches on its distinctive content words.
_STOPWORDS = frozenset(
    "the a an of to is are be in on at for and or it you your they their we i as "
    "with that this an its will should must can may a an be been has have do does "
    "if when what which who how".split()
)


def clean_text(text: str | None) -> str:
    """Collapse whitespace and undo the PDF's stray backslash escapes."""
    if text is None:
        return ""
    text = text.replace("\r", "\n")
    text = text.replace("\\ ", " ")
    text = text.replace("\\'", "'").replace("\\$", "$")
    return re.sub(r"\s+", " ", text).strip()


def normalize(s: str) -> str:
    """Lowercase and strip everything but ``[a-z0-9]`` for char-level compares."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def content_tokens(text: str) -> frozenset[str]:
    """Distinctive lowercase word tokens of ``text`` (stopwords removed)."""
    return frozenset(
        w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOPWORDS
    )


def ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def option_key(options: list[str]) -> str:
    """Order-independent normalized signature of a 3-option set."""
    return "|".join(sorted(normalize(o) for o in options))


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


OPTION_SPLIT = re.compile(r"\s*\(\s*([123])\s*\)\s*")


def split_question(content: str, qno: int) -> tuple[str, list[str]]:
    """Split ``"prompt (1) a (2) b (3) c"`` into ``(prompt, [a, b, c])``."""
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


class DuplicateIndex:
    """Detects questions already present in the master written-test bank.

    IMPORTANT — the Regulations bank is a *different English translation of the
    same source* as the master bank, so duplicates are largely semantic, not
    lexical (e.g. "field of view remains the same / narrower / wider" vs the
    master's "unchanged / narrower / wider"). A spot-check showed that even at
    very low text similarity nearly every match is a genuine duplicate, and real
    *different* questions (same topic, different specifics) only start appearing
    around combined score ~0.30. Pure text matching therefore cannot perfectly
    separate the two. By explicit choice the thresholds here are tuned
    **aggressively** and biased toward *removing* ambiguous matches, accepting a
    minority of false positives in exchange for catching the heavily-reworded
    duplicates. :meth:`text_duplicate` returns the best match and its score so
    callers can log low-confidence removals for review.

    :meth:`text_duplicate` blends full-text token overlap with option-string
    similarity, plus escape hatches for one-sided rewrites where only the prompt
    OR only the options were re-translated.
    """

    # Aggressive + remove-biased text thresholds (see class doc).
    TEXT_SCORE_THRESHOLD = 0.32  # combined 0.6*tokens + 0.4*options
    TEXT_OPT_ESCAPE = 0.85       # options near-identical -> duplicate
    TEXT_TOKEN_ESCAPE = 0.50     # content near-identical -> duplicate

    def __init__(self, bank_path: Path = WRITTEN_BANK):
        data = json.loads(Path(bank_path).read_text())
        # (full-text tokens, option_key, question) for text matching.
        self._text: list[tuple[frozenset[str], str, dict]] = []
        for q in data["questions"]:
            opts = q.get("options") or []
            if len(opts) != 3:
                continue
            ok = option_key(opts)
            self._text.append(
                (content_tokens(q.get("question", "") + " " + " ".join(opts)), ok, q)
            )

    def text_duplicate(self, prompt: str, options: list[str]):
        """Return ``(written_q, score)`` for the best text match, or ``None``.

        A master question counts as a duplicate when the blended score clears
        :attr:`TEXT_SCORE_THRESHOLD`, or when one side alone is near-identical
        (options via :attr:`TEXT_OPT_ESCAPE`, content tokens via
        :attr:`TEXT_TOKEN_ESCAPE`) -- the latter catches duplicates where only
        the prompt or only the options were re-translated.
        """
        tokens = content_tokens(prompt + " " + " ".join(options))
        ok = option_key(options)
        best_score = -1.0
        best_q = None
        for wtokens, wok, q in self._text:
            j = _jaccard(tokens, wtokens)
            os = ratio(ok, wok)
            score = 0.6 * j + 0.4 * os
            if not (
                score >= self.TEXT_SCORE_THRESHOLD
                or os >= self.TEXT_OPT_ESCAPE
                or j >= self.TEXT_TOKEN_ESCAPE
            ):
                continue
            if score > best_score:
                best_score, best_q = score, q
        if best_q is not None:
            return best_q, best_score
        return None


@lru_cache(maxsize=4)
def _render_page(page, dpi: int):
    """Rasterize a whole pdfplumber ``page`` to a PIL image (cached per page+dpi).

    pdfplumber re-renders the entire page on every ``to_image`` call, and a
    single question often has several pictures on the same page, so cropping each
    one from a freshly rendered page would rasterize that page many times over.
    Memoizing keeps each page's bitmap around for its remaining crops. The
    extractors walk pages in order (touching at most the current page plus, during
    cross-page picture spillover, the previous one), so a tiny ``maxsize`` hits on
    every crop while bounding memory -- a 220-DPI page bitmap is ~13 MB.
    """
    return page.to_image(resolution=dpi).original


def render_bbox(
    page,
    bbox: tuple[float, float, float, float],
    out_path: Path,
    *,
    dpi: int = 220,
    padding: int = 2,
    quality: int = 65,
) -> None:
    """Render the ``bbox`` region of a pdfplumber ``page`` to a JPEG file."""
    from PIL import Image  # local import: only the picture extractor needs Pillow

    scale = dpi / 72.0
    x0, y0, x1, y1 = bbox
    px0 = max(0, int(x0 * scale) - padding)
    py0 = max(0, int(y0 * scale) - padding)
    px1 = int(x1 * scale) + padding
    py1 = int(y1 * scale) + padding
    crop = _render_page(page, dpi).crop((px0, py0, px1, py1))
    # JPEG has no alpha; flatten transparency onto white so it doesn't go black.
    if crop.mode in ("RGBA", "LA", "P"):
        crop = crop.convert("RGBA")
        background = Image.new("RGB", crop.size, (255, 255, 255))
        background.paste(crop, mask=crop.split()[-1])
        crop = background
    elif crop.mode != "RGB":
        crop = crop.convert("RGB")
    crop.save(out_path, quality=quality, optimize=True)
