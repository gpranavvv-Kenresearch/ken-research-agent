import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

// Sample file paths relative to project root (one level up from dashboard/)
const SAMPLES: Record<string, { file: string; type: 'html' | 'md' }> = {
  'format-1': {
    file: '../outputs/linkedin_articles/agriculture/li-africa-agricultural-machinery-market.md',
    type: 'md',
  },
  'format-2': {
    file: '../testing-demo/sample-global-aerospace-manufacturing.html',
    type: 'html',
  },
  'format-3': {
    file: '../testing-demo/sample-vietnam-sugar.html',
    type: 'html',
  },
};

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') ?? '';
  const sample = SAMPLES[format];
  if (!sample) {
    return NextResponse.json({ error: `No sample for format: ${format}` }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), sample.file);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: `Sample file not found: ${sample.file}` }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return NextResponse.json({ content, type: sample.type, format });
}
