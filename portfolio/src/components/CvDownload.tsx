'use client';

import {useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {ChevronDown, Download} from './icons';

export default function CvDownload() {
  const t = useTranslations('cv');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const options = [
    {href: '/Csaba_Turi_CV_HU.pdf', label: t('hungarian')},
    {href: '/Csaba_Turi_CV_EN.pdf', label: t('english')},
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/60 px-7 py-3 text-sm font-semibold text-gray-700 backdrop-blur transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
      >
        <Download className="h-4 w-4" />
        {t('label')}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 z-50 mt-3 w-48 -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
        >
          {options.map(({href, label}) => (
            <a
              key={href}
              href={href}
              download
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-200 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
            >
              <Download className="h-4 w-4" />
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
