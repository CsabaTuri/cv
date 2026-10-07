import {useTranslations} from 'next-intl';
import Reveal from './Reveal';
import {Mail} from './icons';

export default function Contact() {
  const t = useTranslations('contact');

  return (
    <section
      id="contact"
      className="scroll-mt-24 bg-gray-50 px-6 py-24 dark:bg-gray-900/40"
    >
      <div className="mx-auto max-w-4xl">
        <Reveal className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            {t('subtitle')}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <a
            href={`mailto:${t('emailValue')}`}
            className="mx-auto mt-10 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-5 text-base font-semibold text-gray-800 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-indigo-500/50 dark:hover:text-indigo-400"
          >
            <Mail className="h-5 w-5 shrink-0" />
            {t('emailValue')}
          </a>
        </Reveal>
      </div>
    </section>
  );
}
