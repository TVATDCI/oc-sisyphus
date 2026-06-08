---
name: document-builder
description: >
  Generates professional PowerPoint (.pptx) presentations programmatically using
  PptxGenJS. Build presentations from structured data with slides, text, charts,
  tables, shapes, and images. NOT for XLSX, DOCX, or PDF — each has diverging
  toolchains and should use dedicated libraries.
compatibility: opencode
triggers:
  - "generate a presentation"
  - "create pptx"
  - "build a PowerPoint"
  - "export slides"
  - "programmatic presentation"
  - "report generation"
mode: automatic
inputs:
  - "Presentation spec (required) — outline, slides, data sources"
  - "Template path (optional) — existing .pptx to use as template"
  - "Data object (optional) — structured data to populate slides"
outputs:
  - "Generated .pptx file at specified output path"
  - "Optional: base64 data for download/API response"
metadata:
  version: 1.0.0
  category: document-generation
  library: PptxGenJS v4.x
  scope: "PPTX only. Not for XLSX, DOCX, PDF."
---

# Document Builder

Generates professional PowerPoint presentations programmatically using PptxGenJS. This skill is strictly scoped to `.pptx` output — spreadsheet, word processing, and PDF generation have diverging toolchains and are out of scope.

## Identity & Scope

**Purpose:** Create .pptx presentations from structured data using PptxGenJS.

**Triggers:** "generate a presentation", "create pptx", "build a PowerPoint", "export slides", "report generation"

**Scope:**
- ✅ PPTX generation via PptxGenJS
- ✅ Slides with text, tables, charts, shapes, images, media
- ✅ Templates and master slides
- ✅ Data-driven presentation generation
- ❌ XLSX/CSV spreadsheets (use a spreadsheet library)
- ❌ DOCX documents (use a word processing library)
- ❌ PDF output (use a PDF library)
- ❌ PDF-to-PPTX conversion

**Entry Criteria:**
- [ ] Presentation structure defined (how many slides, what content)
- [ ] Data sources identified (inline data, JSON, API responses)
- [ ] Output path specified

**Produces:**
- `.pptx` file at the specified output path
- Optional base64 data for web download/API integration

## Library Overview

**PptxGenJS v4.x** is a JavaScript/TypeScript library for creating PowerPoint presentations. It runs in Node.js, the browser, and React/Next.js.

```bash
npm install pptxgenjs
```

**Key capabilities:**
- Create presentations with custom layouts and dimensions
- Add slides with backgrounds, notes, and slide numbers
- Insert text boxes with rich formatting (fonts, colors, bullets, hyperlinks)
- Add tables with styled cells, merged cells, and auto-sizing
- Insert charts (bar, line, pie, doughnut, radar, scatter, combo)
- Add shapes (rectangles, ellipses, lines, arrows, freeform)
- Embed images (local files, URLs, base64)
- Apply master slide templates
- Export to file, base64, or blob

## Core Patterns

### Pattern 1: Basic Presentation

```typescript
import PptxGenJS from "pptxgenjs";

async function generateReport(outputPath: string): Promise<void> {
  const pres = new PptxGenJS();

  // Metadata
  pres.author = "Report Generator";
  pres.title = "Quarterly Report";
  pres.subject = "Q4 2024";
  pres.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"

  // Slide 1: Title
  const titleSlide = pres.addSlide();
  titleSlide.addText("Q4 2024 Report", {
    x: 1, y: 2, w: 11, h: 1.5,
    fontSize: 44, color: "1A1A1A", bold: true, align: "center",
  });
  titleSlide.addText("Prepared by Analytics Team", {
    x: 1, y: 3.5, w: 11, h: 0.8,
    fontSize: 20, color: "666666", align: "center",
  });

  // Slide 2: Content
  const contentSlide = pres.addSlide();
  contentSlide.addText("Key Metrics", {
    x: 0.5, y: 0.3, w: 8, h: 0.8,
    fontSize: 28, bold: true, color: "0088CC",
  });
  contentSlide.addText([
    { text: "Revenue grew 23% year-over-year", options: { bullet: true, fontSize: 16 } },
    { text: "Customer acquisition cost reduced by 15%", options: { bullet: true, fontSize: 16 } },
    { text: "New enterprise deals: 47", options: { bullet: true, fontSize: 16 } },
  ], { x: 0.5, y: 1.3, w: 8, h: 3 });

  await pres.writeFile({ fileName: outputPath });
}
```

### Pattern 2: Data-Driven Slides

Build slides from structured arrays:

```typescript
interface SlideDef {
  title: string;
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
  chart?: ChartDef;
}

async function buildFromData(
  pres: PptxGenJS,
  slides: SlideDef[]
): Promise<void> {
  for (const def of slides) {
    const slide = pres.addSlide();
    slide.addText(def.title, {
      x: 0.5, y: 0.3, w: 10, h: 0.8,
      fontSize: 26, bold: true, color: "333333",
    });

    if (def.bullets) {
      slide.addText(
        def.bullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 14 } })),
        { x: 0.5, y: 1.3, w: 9, h: 4 }
      );
    }

    if (def.table) {
      addTable(slide, def.table.headers, def.table.rows, 0.5, 1.3);
    }
  }
}
```

### Pattern 3: Template-Based Generation

Use a master slide for consistent branding:

```typescript
function createBrandedSlide(
  pres: PptxGenJS,
  title: string,
  accentColor: string = "0088CC"
) {
  const slide = pres.addSlide();
  // Header bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.08,
    fill: { color: accentColor },
  });
  // Title
  slide.addText(title, {
    x: 0.6, y: 0.3, w: 10, h: 0.7,
    fontSize: 24, bold: true, color: "333333",
  });
  // Footer
  slide.addText("Confidential", {
    x: 0.6, y: 7.0, w: 4, h: 0.4,
    fontSize: 9, color: "999999",
  });
  return slide;
}
```

## Text & Formatting

### Rich Text with Word-Level Formatting

Mix styles within a single text box using an array of text segments:

```typescript
slide.addText([
  { text: "Bold header ", options: { bold: true, fontSize: 18 } },
  { text: "normal text ", options: { fontSize: 14 } },
  { text: "linked", options: { hyperlink: { url: "https://example.com" }, color: "0088CC" } },
], { x: 0.5, y: 1, w: 8, h: 1 });
```

### Bulleted and Numbered Lists

```typescript
// Bullets
slide.addText([
  { text: "Level 1", options: { bullet: true, indentLevel: 0 } },
  { text: "Level 2", options: { bullet: true, indentLevel: 1 } },
], { x: 0.5, y: 2, w: 5, h: 2, fontSize: 14 });

// Numbered list starting at 5
slide.addText("Item A\nItem B\nItem C", {
  x: 6, y: 2, w: 5, h: 2,
  bullet: { type: "number", style: "arabicPeriod", numberStartAt: 5 },
});
```

### Text Effects

```typescript
// Shadow
slide.addText("Shadow Text", {
  shadow: { type: "outer", color: "696969", blur: 3, offset: 10, angle: 45, opacity: 0.6 },
});

// Superscript / Subscript
slide.addText([
  { text: "E=mc" }, { text: "2", options: { superscript: true } },
  { text: " and H" }, { text: "2", options: { subscript: true } }, { text: "O" },
]);
```

## Tables

### Styled Table with Header Row

```typescript
function addTable(
  slide: PptxGenJS.I slide,
  headers: string[],
  rows: string[][],
  x: number,
  y: number
) {
  const headerCells = headers.map((h) => ({
    text: h,
    options: { bold: true, color: "FFFFFF", fill: { color: "0088CC" }, align: "center" as const, fontSize: 12 },
  }));

  const dataRows = rows.map((row) =>
    row.map((cell) => ({
      text: cell,
      options: { fontSize: 11, color: "333333", border: { type: "solid", color: "CCCCCC", pt: 0.5 } },
    }))
  );

  slide.addTable(
    [headerCells, ...dataRows],
    { x, y, w: 8, colW: [2, 2, 2, 2], rowH: [0.4, 0.35, 0.35, 0.35], autoPage: true }
  );
}
```

### Table Features

- **Merged cells**: use `colSpan` / `rowSpan` in cell options
- **Alternating row colors**: apply `fill` to alternate rows for readability
- **Auto-page**: set `autoPage: true` to continue large tables across slides
- **Column sizing**: use `colW` array or `w` with `colW[]` for proportional widths

## Charts

### Bar Chart

```typescript
slide.addChart(pres.charts.BAR, [
  { name: "Product A", labels: ["Q1", "Q2", "Q3", "Q4"], values: [150, 200, 180, 220] },
  { name: "Product B", labels: ["Q1", "Q2", "Q3", "Q4"], values: [120, 160, 190, 170] },
], {
  x: 0.5, y: 0.5, w: 6, h: 4,
  barDir: "bar", // "bar" (horizontal) or "col" (vertical)
  showTitle: true, title: "Quarterly Sales",
  showLegend: true, legendPos: "b",
  showValue: true, dataLabelPosition: "outEnd",
});
```

### Line Chart

```typescript
slide.addChart(pres.charts.LINE, [
  { name: "Revenue", labels: ["Jan", "Feb", "Mar", "Apr", "May"], values: [100, 120, 115, 140, 160] },
], {
  x: 7, y: 0.5, w: 5.5, h: 4,
  showTitle: true, title: "Monthly Trend",
  lineSmooth: true,
  lineDataSymbol: "circle",
  lineDataSymbolSize: 8,
});
```

### Pie Chart

```typescript
slide.addChart(pres.charts.PIE, [
  { name: "Share", labels: ["Segment A", "Segment B", "Others"], values: [45, 30, 25] },
], {
  x: 0.5, y: 5, w: 4, h: 3,
  showTitle: true, title: "Market Distribution",
  showPercent: true, showLegend: true,
});
```

### Combo Chart (Bar + Line)

```typescript
slide.addChart([
  { type: pres.charts.BAR, data: barData, options: { barDir: "col" } },
  { type: pres.charts.LINE, data: lineData, options: { secondaryValAxis: true } },
], { x: 0.5, y: 0.5, w: 12, h: 5 });
```

## Shapes & Images

### Shapes

```typescript
// Rectangle (full-width accent bar)
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 13.33, h: 0.08,
  fill: { color: "0088CC" },
});

// Rounded rectangle for callout
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 0.5, y: 5, w: 4, h: 1.5,
  fill: { color: "F0F8FF" },
  rectRadius: 0.1,
  line: { color: "0088CC", width: 1.5 },
});

// Oval
slide.addShape(pres.shapes.OVAL, {
  x: 9, y: 0.5, w: 2, h: 2,
  fill: { color: "E8F4FD" },
});
```

### Images

```typescript
// Local file
slide.addImage({ path: "./assets/logo.png", x: 0.5, y: 0.3, w: 2, h: 0.8 });

// URL (PptxGenJS fetches it)
slide.addImage({ path: "https://example.com/chart.png", x: 1, y: 1, w: 6, h: 4 });

// Base64
slide.addImage({ data: "data:image/png;base64,...", x: 1, y: 1, w: 4, h: 3 });

// SVG (as inline XML string)
slide.addImage({ svg: "<svg>...</svg>", x: 1, y: 1, w: 3, h: 3 });
```

## Slide Configuration

### Slide Backgrounds

```typescript
slide.bkgd = "FFFFFF";                             // Hex color
slide.bkgd = { color: "F5F5F5" };                  // Color object
slide.bkgd = { type: "gradient", color1: "FFFFFF", color2: "E8F4FD" }; // Gradient
```

### Slide Notes

```typescript
slide.addNotes("These notes appear in presenter view");
```

### Master Slides (Templates)

Define reusable masters for consistent branding:

```typescript
// Define a master slide
pres.defineSlideMaster({
  name: "BRANDED",
  background: { color: "FFFFFF" },
  objects: [
    { rect: { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: "0088CC" } } },
    { text: { text: "Confidential", options: { x: 0.5, y: 7.1, w: 3, h: 0.3, fontSize: 8, color: "AAAAAA" } } },
  ],
});

// Apply master to a slide
const slide = pres.addSlide({ masterName: "BRANDED" });
slide.addText("Slide Title", {
  x: 0.6, y: 0.3, w: 10, h: 0.7,
  fontSize: 24, bold: true,
});
```

## Export Options

### File

```typescript
await pres.writeFile({ fileName: "./output/report.pptx" });
```

### Base64 (for REST APIs, download links)

```typescript
const b64 = await pres.write({ outputType: "base64" });
// Send as API response, create download link, etc.
```

### Blob (for browser downloads)

```typescript
const blob = await pres.write({ outputType: "blob" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "presentation.pptx";
a.click();
```

### Node.js Buffer

```typescript
const nodeBuf = await pres.write({ outputType: "nodebuffer" });
// Use with fs.writeFile, email attachment, etc.
```

## Workflow: Full Report Generation

### Recommended Project Structure

```
reports/
  templates/         # Reusable PptxGenJS master definitions
  generators/        # Individual report generators
  data/              # Data sources (JSON, API clients)
  output/            # Generated .pptx files (gitignored)
```

### Generator Pattern

```typescript
// reports/generators/sales-report.ts
import PptxGenJS from "pptxgenjs";
import { SalesData } from "../data/types";

export async function generateSalesReport(data: SalesData, outputPath: string) {
  const pres = new PptxGenJS();
  pres.author = "Sales Intelligence";
  pres.title = `Sales Report: ${data.period}`;
  pres.layout = "LAYOUT_WIDE";

  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.bkgd = "1A365D";
  titleSlide.addText(data.period, {
    x: 1, y: 2, w: 11, h: 1, fontSize: 44, color: "FFFFFF", bold: true, align: "center",
  });
  titleSlide.addText(`Generated ${new Date().toLocaleDateString()}`, {
    x: 1, y: 3.2, w: 11, h: 0.6, fontSize: 16, color: "A0AEC0", align: "center",
  });

  // Summary slide with KPI table
  const summarySlide = pres.addSlide();
  summarySlide.addText("Key Metrics", {
    x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 24, bold: true, color: "1A365D",
  });
  addTable(summarySlide,
    ["Metric", "Value", "vs Last Period", "Trend"],
    data.kpis.map((kpi) => [kpi.name, kpi.value, kpi.change, kpi.trend]),
    0.5, 1.3
  );

  // Chart slide
  const chartSlide = pres.addSlide();
  chartSlide.addText("Revenue Trend", {
    x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 24, bold: true, color: "1A365D",
  });
  chartSlide.addChart(pres.charts.BAR, data.revenueSeries, {
    x: 0.5, y: 1.2, w: 8, h: 4.5,
    showTitle: true, title: "Monthly Revenue",
    showLegend: true,
  });

  await pres.writeFile({ fileName: outputPath });
}
```

## Boundaries

### Hard NOs
- **No XLSX/ODS spreadsheets** — use a spreadsheet library (`exceljs`, `xlsx`)
- **No DOCX documents** — use a word processing library (`docx`)
- **No PDF output** — use a PDF library (`pdfkit`, `jspdf`)
- **No PDF-to-PPTX conversion** — not a format conversion tool
- **No HTML-to-PPTX** — HTML rendering in PowerPoint is unreliable; build slides programmatically
- **No real-time collaboration** — PptxGenJS generates files, it does not edit existing presentations live

### Slide Count Limits
- **Small** (<20 slides): Single-pass generation
- **Medium** (20-100 slides): Use `autoPage: true` for large tables; consider async batch generation
- **Large** (>100 slides): Split into multiple files; PptxGenJS memory usage grows with slide count

## Error Handling

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `ENOENT` on write | Output directory doesn't exist | Create directory first with `mkdir -p` |
| Image not rendering | Invalid path or unsupported format | Use PNG, JPEG, or SVG; verify path exists |
| Font not applied | Font not available on system | Use standard web-safe fonts or embed |
| Chart data empty | No data rows | Validate data before chart creation; skip empty charts |
| Memory error | Too many slides/images | Split into multiple presentations; reduce image resolution |

## Anti-Patterns

- **❌ Building all slides in one giant function** — separate slide generation into focused functions per slide type
- **❌ Hardcoding positions everywhere** — define layout constants (margin, header height, footer position) once
- **❌ Skipping error handling on `writeFile`** — always wrap in try/catch; disk full or permission errors happen
- **❌ Generating pixel-perfect layouts** — PowerPoint rendering differs across versions; use generous padding
- **❌ Mixing PptxGenJS versions** — v3 and v4 have different APIs; pin version in package.json
- **❌ Missing data validation** — always validate data arrays and object shapes before passing to PptxGenJS

## Example Interactions

**User:** "Generate a sales report PPTX from this JSON data"

**Assistant:**
```typescript
import { generateSalesReport } from "./generators/sales-report";
import salesData from "./data/q4-2024.json";
await generateSalesReport(salesData, "./output/q4-2024-report.pptx");
```

**User:** "Create a 3-slide pitch deck with title, problem, and solution"

**Assistant:**
```typescript
const pres = new PptxGenJS();
// Slide 1: Title
pres.addSlide().addText("Our Product", { x: 1, y: 2, w: 11, h: 1.5, fontSize: 40, bold: true, align: "center" });
// Slide 2: Problem
pres.addSlide().addText("The Problem", { x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 28, bold: true });
// Slide 3: Solution
pres.addSlide().addText("Our Solution", { x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 28, bold: true });
await pres.writeFile({ fileName: "pitch-deck.pptx" });
```
