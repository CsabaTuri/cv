'use client';

import {renderBold, useText} from './ContentProvider';
import Reveal from './Reveal';

export default function About() {
  const subtitle = useText('about.subtitle');
  const title = useText('about.title');
  const p1 = useText('about.p1');
  const p2 = useText('about.p2');

  return (
    <section id="about" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            {subtitle}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-8 space-y-4 text-lg leading-relaxed text-gray-600">
            <p>{renderBold(p1)}</p>
            <p>{renderBold(p2)}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
