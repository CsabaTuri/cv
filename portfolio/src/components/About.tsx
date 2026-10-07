import {useTranslations} from 'next-intl';
import Reveal from './Reveal';

export default function About() {
  const t = useTranslations('about');

  const bold = (chunks: React.ReactNode) => (
    <strong className="font-semibold text-gray-900 dark:text-gray-100">
      {chunks}
    </strong>
  );

  return (
    <section id="about" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            {t('subtitle')}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-8 space-y-4 text-lg leading-relaxed text-gray-600 dark:text-gray-300">
            <p>{t.rich('p1', {strong: bold})}</p>
            <p>{t.rich('p2', {strong: bold})}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
