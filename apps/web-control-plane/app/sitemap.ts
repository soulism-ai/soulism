import type { MetadataRoute } from 'next';
import { getDocs } from '../src/docs';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docs = await getDocs();
  const base = 'https://web-control-plane.vercel.app';

  return [
    {
      url: `${base}/`,
      priority: 1
    },
    {
      url: `${base}/docs`,
      priority: 0.9
    },
    {
      url: `${base}/control-plane`,
      priority: 0.6
    },
    ...docs.map((doc) => ({
      url: `${base}${doc.href}`,
      priority: 0.7
    }))
  ];
}
