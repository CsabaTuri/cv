'use client';

import {useEffect, useState} from 'react';
import {useText} from './ContentProvider';
import {Menu, X} from './icons';

export default function Navbar() {
  const siteName = useText('site.name');
  const siteInitials = useText('site.initials');
  const about = useText('nav.about');
  const skills = useText('nav.skills');
  const experience = useText('nav.experience');
  const contact = useText('nav.contact');
  const openMenuLabel = useText('a11y.menu');
  const closeMenuLabel = useText('a11y.closeMenu');

  const links = [
    {href: '#about', label: about},
    {href: '#skills', label: skills},
    {href: '#experience', label: experience},
    {href: '#contact', label: contact},
  ];

  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-gray-200/60 bg-white/80 backdrop-blur-md'
          : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <a href="#home" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-sm font-bold text-white">
            {siteInitials}
          </span>
          <span className="font-semibold tracking-tight">{siteName}</span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? closeMenuLabel : openMenuLabel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-gray-200 bg-white/95 px-6 py-4 backdrop-blur md:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block py-2 text-gray-700"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
