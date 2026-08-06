'use client';
import { useEffect, useState } from 'react';

// Bump this if the notice text changes and it should be shown again to
// everyone who already dismissed the previous version.
const DISMISS_KEY = 'kr_automation_notice_dismissed_v1';

export function AutomationNoticeContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-white mb-4">Hi Team,</h2>
        <p className="text-sm text-slate-300 mb-4">We have updated the blog generation and posting flow.</p>
        <p className="text-sm text-slate-300 mb-2">From now onward:</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-slate-300 mb-4">
          <li>The <span className="text-white font-medium">Generate Blog</span> option on each member&apos;s dashboard will be disabled and non-clickable.</li>
          <li>Blogs will now be generated and posted automatically.</li>
          <li>To check the posting status, please visit the <span className="text-white font-medium">Track</span> section.</li>
          <li>If any post fails, you can retry it directly from the <span className="text-white font-medium">Track</span> section.</li>
        </ul>
        <p className="text-sm text-slate-300 mb-6">Please use the Track section for all posting updates, status checks, and failed-post retries.</p>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shows once ever per browser (localStorage-gated) — mounted globally in ClientShell. */
export default function AutomationNoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(DISMISS_KEY)) setOpen(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setOpen(false);
  }

  if (!open) return null;
  return <AutomationNoticeContent onClose={dismiss} />;
}
