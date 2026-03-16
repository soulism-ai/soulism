import path from 'node:path';

const config = {
  title: 'Cognitive AI Platform',
  tagline: 'Production-ready persona runtime, policy governance, and MCP tool control',
  favicon: 'img/logo.svg',
  url: 'https://soulism.local',
  baseUrl: '/',
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  organizationName: 'soulism',
  projectName: 'soulism-platform',
  future: {
    experimental_router: 'hash'
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: path.resolve(__dirname, '../../docs'),
          routeBasePath: '/docs',
          sidebarPath: path.resolve(__dirname, './sidebars.ts')
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css'
        }
      }
    ]
  ],
  themeConfig: {
    navbar: {
      title: 'Cognitive AI',
      items: [
        { to: '/docs/architecture/overview', label: 'Architecture', position: 'left' },
        { to: '/docs/compliance/iso-42001-mapping', label: 'Compliance', position: 'left' },
        { to: '/docs/runbooks/incident-response', label: 'Runbooks', position: 'left' },
        { href: 'https://github.com/', label: 'GitHub', position: 'right' }
      ]
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Architecture', to: '/docs/architecture/overview' },
            { label: 'Policies', to: '/docs/architecture/policy-gates' },
            { label: 'Launch & Rollback', to: '/docs/architecture/release-distribution' }
          ]
        },
        {
          title: 'Runbooks',
          items: [
            { label: 'Incident Response', to: '/docs/runbooks/incident-response' },
            { label: 'Rollback', to: '/docs/runbooks/rollback' },
            { label: 'SLA / SLO', to: '/docs/runbooks/sla-slo' }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Cognitive AI Platform`
    }
  }
};

export default config;
