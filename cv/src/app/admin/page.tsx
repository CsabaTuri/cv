import type {Metadata} from 'next';
import AdminChat from '@/components/AdminChat';

export const metadata: Metadata = {
  title: 'Üzenetek — Túri Csaba',
  robots: {index: false, follow: false},
};

export default function AdminPage() {
  return <AdminChat />;
}
