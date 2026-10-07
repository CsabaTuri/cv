/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static Site Generation: export the site as plain HTML/CSS/JS.
  output: 'export',
  // Generate directory-style URLs (e.g. /admin/index.html) for clean static hosting.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
