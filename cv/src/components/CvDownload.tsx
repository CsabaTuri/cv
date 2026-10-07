'use client';

import {useText} from './ContentProvider';
import {Download} from './icons';

export default function CvDownload() {
  const label = useText('cv.label');

  return (
    <a
      href="/Csaba_Turi_CV_HU.pdf"
      download
      className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/60 px-7 py-3 text-sm font-semibold text-gray-700 backdrop-blur transition-colors hover:border-gray-400 hover:text-gray-900"
    >
      <Download className="h-4 w-4" />
      {label}
    </a>
  );
}
