/**
 * pptGenerator.ts — Generates .pptx files from Ken Research report data
 * Uses pptxgenjs to build structured slide decks for SlideShare upload
 */

import PptxGenJS from 'pptxgenjs';
import fs from 'fs';
import path from 'path';

const TEMP_DIR = path.resolve('.sessions/ppt-temp');

export interface SlideContent {
  title: string;
  subtitle?: string;
  marketSize?: string;
  cagr?: string;
  keyPoints: string[];       // 6–10 bullet points from the report
  tags?: string[];
  ctaUrl: string;            // Ken Research URL with UTM
  description: string;       // SlideShare description (plain text)
}

// Ken Research brand colours
const KEN_RED    = 'CC2936';
const KEN_DARK   = '1A1A2E';
const KEN_GRAY   = 'F4F4F4';
const WHITE      = 'FFFFFF';
const TEXT_DARK  = '222222';
const TEXT_MID   = '555555';

export async function generatePptx(content: SlideContent): Promise<string> {
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches (16:9)

  // ── Slide 1: Title ─────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: KEN_DARK };

    // Red accent bar left
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: KEN_RED } });

    // Ken Research logo text
    slide.addText('KEN RESEARCH', {
      x: 0.4, y: 0.3, w: 5, h: 0.5,
      fontSize: 13, bold: true, color: KEN_RED,
      fontFace: 'Calibri',
    });

    // Main title
    slide.addText(content.title, {
      x: 0.4, y: 1.1, w: 12.5, h: 2.8,
      fontSize: 32, bold: true, color: WHITE,
      fontFace: 'Calibri',
      wrap: true, valign: 'top',
    });

    // Subtitle / report type
    if (content.subtitle) {
      slide.addText(content.subtitle, {
        x: 0.4, y: 4.0, w: 12.5, h: 0.6,
        fontSize: 16, color: 'AAAAAA', fontFace: 'Calibri', italic: true,
      });
    }

    // Market size + CAGR pill
    const stats = [content.marketSize && `Market Size: ${content.marketSize}`, content.cagr && `CAGR: ${content.cagr}`]
      .filter(Boolean).join('   |   ');
    if (stats) {
      slide.addText(stats, {
        x: 0.4, y: 4.7, w: 9, h: 0.55,
        fontSize: 14, bold: true, color: KEN_RED, fontFace: 'Calibri',
      });
    }

    // Bottom URL
    slide.addText(content.ctaUrl, {
      x: 0.4, y: 6.9, w: 12.5, h: 0.4,
      fontSize: 10, color: '888888', fontFace: 'Calibri',
      hyperlink: { url: content.ctaUrl },
    });
  }

  // ── Slides 2–4: Key Findings (3 points per slide) ─────────────────────────
  const chunks = chunkArray(content.keyPoints, 3);
  chunks.forEach((chunk, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };

    // Top accent bar
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: KEN_RED } });

    // Slide header
    slide.addText(idx === 0 ? 'Key Findings' : `Key Findings (cont.)`, {
      x: 0.5, y: 0.25, w: 12, h: 0.65,
      fontSize: 22, bold: true, color: KEN_DARK, fontFace: 'Calibri',
    });

    // Thin divider
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.95, w: 12.3, h: 0.03, fill: { color: 'DDDDDD' } });

    // Bullet items
    chunk.forEach((point, i) => {
      const y = 1.15 + i * 1.8;
      // Red bullet circle
      slide.addShape(pptx.ShapeType.ellipse, { x: 0.5, y: y + 0.18, w: 0.28, h: 0.28, fill: { color: KEN_RED } });
      slide.addText(point, {
        x: 0.95, y, w: 11.9, h: 1.6,
        fontSize: 15, color: TEXT_DARK, fontFace: 'Calibri',
        wrap: true, valign: 'top',
      });
    });

    // Footer
    slide.addText('Ken Research  |  kenresearch.com', {
      x: 0.5, y: 7.1, w: 12, h: 0.3,
      fontSize: 9, color: 'AAAAAA', fontFace: 'Calibri',
    });
  });

  // ── Last slide: CTA ────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    slide.background = { color: KEN_RED };

    slide.addText('Download the Full Report', {
      x: 0.5, y: 1.8, w: 12.3, h: 1.2,
      fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center',
    });

    slide.addText('Get comprehensive market analysis, forecasts,\nand competitive intelligence from Ken Research.', {
      x: 0.5, y: 3.1, w: 12.3, h: 1.0,
      fontSize: 16, color: WHITE, fontFace: 'Calibri', align: 'center',
    });

    // White CTA box
    slide.addShape(pptx.ShapeType.rect, { x: 3.7, y: 4.3, w: 5.9, h: 0.75, fill: { color: WHITE }, line: { color: WHITE } });
    slide.addText(content.ctaUrl, {
      x: 3.7, y: 4.3, w: 5.9, h: 0.75,
      fontSize: 12, bold: true, color: KEN_RED, fontFace: 'Calibri',
      align: 'center', valign: 'middle',
      hyperlink: { url: content.ctaUrl },
    });

    slide.addText('www.kenresearch.com', {
      x: 0.5, y: 6.9, w: 12.3, h: 0.4,
      fontSize: 10, color: 'FFAAAA', fontFace: 'Calibri', align: 'center',
    });
  }

  // ── Write file ─────────────────────────────────────────────────────────────
  const safeName = content.title.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
  const filePath = path.join(TEMP_DIR, `${safeName}_${Date.now()}.pptx`);
  await pptx.writeFile({ fileName: filePath });
  return filePath;
}

export function cleanupPptx(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}
