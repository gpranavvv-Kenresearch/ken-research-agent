import SubmitForm from '@/components/SubmitForm';

export const metadata = { title: 'Submit URL — Ken Research Distribution' };

export default function SubmitPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Submit a Report URL</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Fill in the details below. The system will generate a blog post and distribute it across the selected platforms.
        </p>
      </div>
      <SubmitForm />
    </div>
  );
}
