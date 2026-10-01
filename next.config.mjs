/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { "/api/manuals/*": ["./public/fonts/*.ttf"] },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
