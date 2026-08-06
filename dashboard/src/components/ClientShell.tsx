'use client';
import { useUser } from '@/context/UserContext';
import UserSelector from './UserSelector';
import AutomationNoticeModal from './AutomationNoticeModal';

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  if (!user) return <UserSelector />;
  return (
    <>
      <AutomationNoticeModal />
      {children}
    </>
  );
}
