import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/api/', '/control-plane']
      }
    ],
    sitemap: 'https://web-control-plane.vercel.app/sitemap.xml'
  };
}
