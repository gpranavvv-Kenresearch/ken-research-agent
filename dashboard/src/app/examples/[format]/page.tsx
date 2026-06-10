import { notFound } from 'next/navigation';
import path from 'path';
import fs from 'fs';
import ExampleViewer from '@/components/ExampleViewer';

const SAMPLES: Record<string, { file: string; type: 'html' | 'md'; formatLabel: string; subLabel: string }> = {
  'format-1': {
    file: 'public/samples/format-1.html',
    type: 'html',
    formatLabel: 'Format 1',
    subLabel: 'SEO-Li Article',
  },
  'format-2': {
    file: 'public/samples/format-2.html',
    type: 'html',
    formatLabel: 'Format 2',
    subLabel: 'LinkedIn Pulse',
  },
  'format-3': {
    file: 'public/samples/format-3.html',
    type: 'html',
    formatLabel: 'Format 3',
    subLabel: 'Testing Demo',
  },
};

export default function ExamplePage({ params }: { params: { format: string } }) {
  const sample = SAMPLES[params.format];
  if (!sample) notFound();

  const filePath = path.join(process.cwd(), sample.file);
  if (!fs.existsSync(filePath)) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center text-slate-400 p-8 text-center">
        <div>
          <p className="text-4xl mb-4">📄</p>
          <p className="text-lg text-white mb-2">Sample file not found</p>
          <p className="text-sm">Generate a blog with this format first to create a sample.</p>
        </div>
      </div>
    );
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 py-4 flex items-center gap-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider">Sample Blog Post</p>
          <h1 className="text-white font-bold text-lg">
            {sample.formatLabel} <span className="text-slate-400 font-normal">— {sample.subLabel}</span>
          </h1>
        </div>
        <a href="javascript:window.close()"
          className="ml-auto text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
          ✕ Close
        </a>
      </div>

      <ExampleViewer content={content} type={sample.type} />
    </div>
  );
}
