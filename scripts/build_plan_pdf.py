from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


INK = colors.HexColor("#1B2927")
INK_SOFT = colors.HexColor("#596966")
PAPER = colors.HexColor("#F7F9F7")
PANEL = colors.white
LINE = colors.HexColor("#D9E2DC")
ACCENT = colors.HexColor("#17695E")
ACCENT_SOFT = colors.HexColor("#DFEEE9")
NAV = colors.HexColor("#153A35")
WARNING = colors.HexColor("#A76524")
WARNING_SOFT = colors.HexColor("#FFF2DF")


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    _, raw, body = text.split("---", 2)
    metadata: dict[str, str] = {}
    for line in raw.strip().splitlines():
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip()
    return metadata, body.strip()


def inline_markup(text: str) -> str:
    escaped = html.escape(text, quote=False)
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        r'<link href="\2" color="#17695E"><u>\1</u></link>',
        escaped,
    )
    return escaped


class PlanDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, title: str):
        super().__init__(
            filename,
            pagesize=letter,
            leftMargin=0.72 * inch,
            rightMargin=0.72 * inch,
            topMargin=0.66 * inch,
            bottomMargin=0.62 * inch,
            title=title,
            author="Homework Helper",
            subject="Phase A website delivery and mobile handoff plan",
        )
        self.plan_title = title
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
            id="normal",
        )
        self.addPageTemplates(PageTemplate(id="plan", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        page_number = canvas.getPageNumber()
        canvas.saveState()
        if page_number > 1:
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.6)
            canvas.line(self.leftMargin, letter[1] - 0.42 * inch, letter[0] - self.rightMargin, letter[1] - 0.42 * inch)
            canvas.setFont("Helvetica", 7.2)
            canvas.setFillColor(INK_SOFT)
            canvas.drawString(self.leftMargin, letter[1] - 0.31 * inch, "HOMEWORK HELPER - PHASE A UPDATE")
        canvas.setStrokeColor(LINE)
        canvas.line(self.leftMargin, 0.42 * inch, letter[0] - self.rightMargin, 0.42 * inch)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(INK_SOFT)
        canvas.drawString(self.leftMargin, 0.25 * inch, self.plan_title)
        canvas.drawRightString(letter[0] - self.rightMargin, 0.25 * inch, str(page_number))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        style_name = flowable.style.name
        if style_name not in {"Heading1", "Heading2", "Heading3"}:
            return
        level = {"Heading1": 0, "Heading2": 0, "Heading3": 1}[style_name]
        text = flowable.getPlainText()
        key = f"heading-{self.seq.nextf('heading')}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


def make_styles():
    sample = getSampleStyleSheet()
    styles = {
        "body": ParagraphStyle(
            "Body",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=9.25,
            leading=13.4,
            textColor=INK,
            spaceAfter=7,
            allowWidows=0,
            allowOrphans=0,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=9.05,
            leading=13.1,
            textColor=INK,
            leftIndent=15,
            firstLineIndent=-8,
            bulletIndent=0,
            spaceAfter=4.5,
        ),
        "number": ParagraphStyle(
            "Number",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=9.05,
            leading=13.1,
            textColor=INK,
            leftIndent=18,
            firstLineIndent=-13,
            bulletIndent=0,
            spaceAfter=5,
        ),
        "h1": ParagraphStyle("Heading1", parent=sample["Heading1"], fontName="Helvetica-Bold", fontSize=23, leading=26, textColor=NAV, spaceBefore=8, spaceAfter=13, keepWithNext=True),
        "h2": ParagraphStyle("Heading2", parent=sample["Heading2"], fontName="Helvetica-Bold", fontSize=18, leading=21, textColor=ACCENT, spaceBefore=16, spaceAfter=9, keepWithNext=True),
        "h3": ParagraphStyle("Heading3", parent=sample["Heading3"], fontName="Helvetica-Bold", fontSize=12.3, leading=15, textColor=colors.HexColor("#315F80"), spaceBefore=11, spaceAfter=6, keepWithNext=True),
        "h4": ParagraphStyle("Heading4", parent=sample["Heading4"], fontName="Helvetica-Bold", fontSize=9.7, leading=12, textColor=INK, spaceBefore=8, spaceAfter=4, keepWithNext=True),
        "table": ParagraphStyle("TableText", parent=sample["BodyText"], fontName="Helvetica", fontSize=7.6, leading=10.2, textColor=INK),
        "table_header": ParagraphStyle("TableHeader", parent=sample["BodyText"], fontName="Helvetica-Bold", fontSize=7.5, leading=9.5, textColor=colors.white),
        "callout": ParagraphStyle("Callout", parent=sample["BodyText"], fontName="Helvetica", fontSize=9, leading=13, textColor=NAV),
        "toc_title": ParagraphStyle("TOCTitle", parent=sample["Heading1"], fontName="Helvetica-Bold", fontSize=24, leading=28, textColor=ACCENT, spaceAfter=16),
    }
    return styles


def cover(metadata: dict[str, str]):
    story = [Spacer(1, 0.72 * inch)]
    story.append(Table([[""]], colWidths=[1.45 * inch], rowHeights=[0.08 * inch], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT), ("BOX", (0, 0), (-1, -1), 0, ACCENT)])))
    story.append(Spacer(1, 0.85 * inch))
    story.append(Paragraph("PRODUCT &amp; IMPLEMENTATION PLAN", ParagraphStyle("CoverKicker", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=ACCENT, tracking=2.2)))
    story.append(Spacer(1, 0.18 * inch))
    story.append(Paragraph(metadata.get("title", "Homework Helper"), ParagraphStyle("CoverTitle", fontName="Helvetica-Bold", fontSize=35, leading=37, textColor=NAV, spaceAfter=7)))
    story.append(Paragraph(metadata.get("subtitle", "Product and Implementation Plan"), ParagraphStyle("CoverSubtitle", fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=NAV, spaceAfter=18)))
    story.append(Paragraph(metadata.get("edition", "Phase A Update"), ParagraphStyle("CoverEdition", fontName="Helvetica", fontSize=14, leading=18, textColor=INK_SOFT, spaceAfter=24)))
    story.append(Table([[Paragraph("WEBSITE STATUS", ParagraphStyle("CoverBoxLabel", fontName="Helvetica-Bold", fontSize=7, textColor=colors.white)), Paragraph(metadata.get("status", "Delivered"), ParagraphStyle("CoverBoxText", fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=colors.white))]], colWidths=[1.2 * inch, 4.5 * inch], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAV), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10), ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor("#64857E"))])))
    story.append(Spacer(1, 1.72 * inch))
    story.append(Paragraph("Homework Helper", ParagraphStyle("CoverFooter", fontName="Helvetica-Bold", fontSize=9, textColor=INK_SOFT)))
    story.append(Paragraph(f"Updated plan - {metadata.get('date', '')}", ParagraphStyle("CoverFooter2", fontName="Helvetica", fontSize=8.5, textColor=INK_SOFT)))
    story.append(PageBreak())
    return story


def build_table(rows: list[list[str]], styles):
    widths = [1.62 * inch] + [(6.94 * inch - 1.62 * inch) / max(1, len(rows[0]) - 1)] * (len(rows[0]) - 1)
    data = []
    for row_index, row in enumerate(rows):
        style = styles["table_header"] if row_index == 0 else styles["table"]
        data.append([Paragraph(inline_markup(cell.strip()), style) for cell in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAV),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("BACKGROUND", (0, 1), (-1, -1), PANEL),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PANEL, PAPER]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def markdown_story(body: str, styles):
    lines = body.splitlines()
    story = []
    paragraph_lines: list[str] = []
    index = 0

    def flush_paragraph():
        if paragraph_lines:
            story.append(Paragraph(inline_markup(" ".join(line.strip() for line in paragraph_lines)), styles["body"]))
            paragraph_lines.clear()

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if stripped == "<!-- toc -->":
            flush_paragraph()
            story.append(Paragraph("Contents", styles["toc_title"]))
            toc = TableOfContents()
            toc.levelStyles = [
                ParagraphStyle("TOC0", fontName="Helvetica-Bold", fontSize=9.5, leading=14, leftIndent=0, firstLineIndent=0, textColor=INK, spaceBefore=2),
                ParagraphStyle("TOC1", fontName="Helvetica", fontSize=8.4, leading=12.5, leftIndent=14, firstLineIndent=0, textColor=INK_SOFT),
            ]
            story.append(toc)
            story.append(PageBreak())
            index += 1
            continue
        if stripped == "<!-- pagebreak -->":
            flush_paragraph()
            story.append(PageBreak())
            index += 1
            continue
        if stripped.startswith("```"):
            flush_paragraph()
            code_lines = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            story.append(Table([[Preformatted("\n".join(code_lines), ParagraphStyle("Code", fontName="Courier", fontSize=7.2, leading=9.5, textColor=INK))]], colWidths=[6.94 * inch], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EDF3F6")), ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])))
            index += 1
            continue
        if stripped.startswith("|") and index + 1 < len(lines) and re.match(r"^\|?\s*:?-+", lines[index + 1].strip()):
            flush_paragraph()
            rows = []
            rows.append([cell.strip() for cell in stripped.strip("|").split("|")])
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
                index += 1
            story.append(build_table(rows, styles))
            story.append(Spacer(1, 9))
            continue
        if stripped.startswith(">"):
            flush_paragraph()
            quote = stripped.lstrip("> ")
            story.append(Table([[Paragraph(inline_markup(quote), styles["callout"])]], colWidths=[6.94 * inch], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT), ("BOX", (0, 0), (-1, -1), 0.7, ACCENT), ("LINEBEFORE", (0, 0), (0, -1), 5, ACCENT), ("LEFTPADDING", (0, 0), (-1, -1), 13), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11)])))
            story.append(Spacer(1, 9))
            index += 1
            continue
        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            text = inline_markup(heading.group(2))
            story.append(Paragraph(text, styles[{1: "h1", 2: "h2", 3: "h3", 4: "h4"}[level]]))
            index += 1
            continue
        bullet = re.match(r"^-\s+(.+)$", stripped)
        if bullet:
            flush_paragraph()
            story.append(Paragraph("- " + inline_markup(bullet.group(1)), styles["bullet"]))
            index += 1
            continue
        numbered = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if numbered:
            flush_paragraph()
            story.append(Paragraph(f"{numbered.group(1)}. " + inline_markup(numbered.group(2)), styles["number"]))
            index += 1
            continue
        if not stripped:
            flush_paragraph()
            index += 1
            continue
        paragraph_lines.append(stripped)
        index += 1

    flush_paragraph()
    return story


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_plan_pdf.py INPUT.md OUTPUT.pdf")
    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata, body = parse_front_matter(source.read_text(encoding="utf-8"))
    styles = make_styles()
    title = f"{metadata.get('title', 'Homework Helper')}: {metadata.get('subtitle', 'Product and Implementation Plan')}"
    doc = PlanDocTemplate(str(output), title)
    story = cover(metadata) + markdown_story(body, styles)
    doc.multiBuild(story)


if __name__ == "__main__":
    main()
