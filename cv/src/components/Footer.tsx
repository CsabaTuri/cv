'use client';

import { useText } from './ContentProvider';

export default function Footer() {
  const siteName = useText('site.name');
  const rights = useText('footer.rights');

  return (
    <footer className="border-t border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
      <p>
        © {new Date().getFullYear()} {siteName}. {rights}
      </p>
    </footer>
  );
}
