'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useJsonList, useText } from './ContentProvider';
import { ArrowDown } from './icons';
import CvDownload from './CvDownload';

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function Hero() {
  const name = useText('hero.name');
  const roles = useJsonList<string>('hero.roles');
  const subtitle = useText('hero.subtitle');
  const ctaPrimary = useText('hero.ctaPrimary');
  const ctaSecondary = useText('hero.ctaSecondary');
  const scrollLabel = useText('hero.scroll');

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (roles.length < 2) return;

    const id = setInterval(() => setIndex((i) => (i + 1) % roles.length), 3200);
    return () => clearInterval(id);
  }, [roles.length]);

  return (
    <section
      id="home"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6"
    >
      {/* Subtle background accents */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[320px] w-[320px] rounded-full bg-cyan-500/10 blur-3xl" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mx-auto max-w-4xl text-center"
      >
        <motion.h1
          variants={item}
          className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl"
        >
          {name}
        </motion.h1>

        <motion.div
          variants={item}
          className="mt-5 flex h-8 items-center justify-center text-xl text-gray-600 sm:text-2xl"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              {roles[index] ?? ''}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        <motion.p
          variants={item}
          className="mx-auto mt-4 max-w-2xl text-base italic text-gray-500 sm:text-lg"
        >
          {subtitle}
        </motion.p>

        <motion.div
          variants={item}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="#contact"
            className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:-translate-y-0.5"
          >
            {ctaPrimary}
          </a>
          <a
            href="#skills"
            className="rounded-full border border-gray-300 bg-white/60 px-7 py-3 text-sm font-semibold text-gray-700 backdrop-blur transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            {ctaSecondary}
          </a>
          <CvDownload />
        </motion.div>
      </motion.div>

      <motion.a
        href="#about"
        aria-label={scrollLabel}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-400 transition-colors hover:text-gray-600"
      >
        <ArrowDown className="h-5 w-5 animate-bounce" />
      </motion.a>
    </section>
  );
}
