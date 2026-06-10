'use client';

interface Props {
  content: string;
  type: 'html' | 'md';
}

export default function ExampleViewer({ content, type }: Props) {
  if (type === 'html') {
    // Render HTML inside a sandboxed iframe via srcdoc
    return (
      <iframe
        srcDoc={content}
        className="w-full border-0"
        style={{ height: 'calc(100vh - 73px)' }}
        sandbox="allow-same-origin"
        title="Blog sample preview"
      />
    );
  }

  // Render markdown as preformatted text in a clean reader view
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="bg-white rounded-xl p-8 shadow-sm">
        <pre className="whitespace-pre-wrap font-sans text-gray-800 text-sm leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}
