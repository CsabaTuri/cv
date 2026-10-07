import {useTranslations} from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-gray-200 px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
      <p>
        © {new Date().getFullYear()} Túri Csaba. {t('rights')}
      </p>
    </footer>
  );
}
