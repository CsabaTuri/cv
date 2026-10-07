'use client';

import type { ComponentType, SVGProps } from 'react';
import { motion, type Variants } from 'framer-motion';
import { skillCategories, type SkillIcon, type SkillCategoryKey } from '@/data/skills';
import { useText } from './ContentProvider';
import {
  Server,
  Container,
  Terminal,
  Code,
  Database,
  Shield,
  Wrench,
  Bug,
  Sparkles,
} from './icons';

const iconMap: Record<SkillIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  server: Server,
  container: Container,
  terminal: Terminal,
  code: Code,
  database: Database,
  shield: Shield,
  wrench: Wrench,
  bug: Bug,
  sparkles: Sparkles,
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export default function Skills() {
  const subtitle = useText('skills.subtitle');
  const title = useText('skills.title');

  const titles: Record<SkillCategoryKey, string> = {
    testing: useText('skills.testing'),
    containers: useText('skills.containers'),
    virtualization: useText('skills.virtualization'),
    ai: useText('skills.ai'),
    os: useText('skills.os'),
    programming: useText('skills.programming'),
    databases: useText('skills.databases'),
    infrastructure: useText('skills.infrastructure'),
    tools: useText('skills.tools'),
  };

  return (
    <section id="skills" className="scroll-mt-24 bg-gray-50 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            {subtitle}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {skillCategories.map((category) => {
            const Icon = iconMap[category.icon];
            return (
              <motion.div
                key={category.key}
                variants={card}
                className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-transform group-hover:scale-110">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-lg font-semibold">{titles[category.key]}</h3>
                </div>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {category.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
