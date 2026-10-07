'use client';

import {motion, type Variants} from 'framer-motion';
import {useTranslations} from 'next-intl';

interface ExperienceItem {
  title: string;
  points: string[];
  tags: string[];
}

const container: Variants = {
  hidden: {},
  show: {transition: {staggerChildren: 0.12}},
};

const card: Variants = {
  hidden: {opacity: 0, y: 24},
  show: {opacity: 1, y: 0, transition: {duration: 0.5, ease: 'easeOut'}},
};

export default function Experience() {
  const t = useTranslations('experience');
  const items = t.raw('items') as unknown as ExperienceItem[];

  return (
    <section id="experience" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            {t('subtitle')}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{once: true, margin: '-60px'}}
          className="mt-14 grid gap-6 lg:grid-cols-3"
        >
          {items.map((item, index) => (
            <motion.article
              key={item.title}
              variants={card}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-xl dark:border-gray-800 dark:bg-gray-900"
            >
              <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
              <ul className="mt-4 space-y-3 text-gray-600 dark:text-gray-300">
                {item.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                    <span className="text-sm leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
