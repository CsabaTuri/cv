import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static Site Generation: export the site as plain HTML/CSS/JS.
  output: 'export',
  // Generate directory-style URLs (e.g. /en/index.html) for clean static hosting.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
