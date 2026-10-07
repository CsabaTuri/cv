'use client';

import {useText} from './ContentProvider';
import Reveal from './Reveal';
import {Mail} from './icons';

export default function Contact() {
  const subtitle = useText('contact.subtitle');
  const title = useText('contact.title');
  const email = useText('contact.emailValue');

  return (
    <section id="contact" className="scroll-mt-24 bg-gray-50 px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            {subtitle}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <a
            href={`mailto:${email}`}
            className="mx-auto mt-10 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-5 text-base font-semibold text-gray-800 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            <Mail className="h-5 w-5 shrink-0" />
            {email}
          </a>
        </Reveal>
      </div>
    </section>
  );
}
