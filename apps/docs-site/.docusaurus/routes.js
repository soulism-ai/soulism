import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/docs',
    component: ComponentCreator('/docs', '976'),
    routes: [
      {
        path: '/docs',
        component: ComponentCreator('/docs', '933'),
        routes: [
          {
            path: '/docs',
            component: ComponentCreator('/docs', '7bb'),
            routes: [
              {
                path: '/docs/',
                component: ComponentCreator('/docs/', '2fe'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/audit-ledger-append-only',
                component: ComponentCreator('/docs/adr/audit-ledger-append-only', '8ab'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/mcp-transport-http-stdio',
                component: ComponentCreator('/docs/adr/mcp-transport-http-stdio', 'd4e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/memory-store-hybrid',
                component: ComponentCreator('/docs/adr/memory-store-hybrid', '4f2'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/monorepo-pnpm-turbo',
                component: ComponentCreator('/docs/adr/monorepo-pnpm-turbo', '02e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/persona-pack-format',
                component: ComponentCreator('/docs/adr/persona-pack-format', '93e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/policy-gate-service',
                component: ComponentCreator('/docs/adr/policy-gate-service', '3f4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/release-signing',
                component: ComponentCreator('/docs/adr/release-signing', '6f7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/telemetry-privacy',
                component: ComponentCreator('/docs/adr/telemetry-privacy', 'd10'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/adr/tool-sandboxing',
                component: ComponentCreator('/docs/adr/tool-sandboxing', '1ec'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/asyncapi',
                component: ComponentCreator('/docs/api/asyncapi', '4b8'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/mcp',
                component: ComponentCreator('/docs/api/mcp', 'a7d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/openapi',
                component: ComponentCreator('/docs/api/openapi', '747'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/audit-logging',
                component: ComponentCreator('/docs/architecture/audit-logging', '399'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/data-flows',
                component: ComponentCreator('/docs/architecture/data-flows', '69c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/identity-access',
                component: ComponentCreator('/docs/architecture/identity-access', '96a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/memory-model',
                component: ComponentCreator('/docs/architecture/memory-model', '7ea'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/observability',
                component: ComponentCreator('/docs/architecture/observability', 'ed4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/overview',
                component: ComponentCreator('/docs/architecture/overview', '0e7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/persona-system',
                component: ComponentCreator('/docs/architecture/persona-system', '14a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/policy-gates',
                component: ComponentCreator('/docs/architecture/policy-gates', '595'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/release-distribution',
                component: ComponentCreator('/docs/architecture/release-distribution', '95d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/security-model',
                component: ComponentCreator('/docs/architecture/security-model', '76f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/service-map',
                component: ComponentCreator('/docs/architecture/service-map', 'eb6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/eu-ai-act-notes',
                component: ComponentCreator('/docs/compliance/eu-ai-act-notes', '25b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/iso-42001-mapping',
                component: ComponentCreator('/docs/compliance/iso-42001-mapping', '76c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/nist-ai-rmf-mapping',
                component: ComponentCreator('/docs/compliance/nist-ai-rmf-mapping', 'b39'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/pii-policy',
                component: ComponentCreator('/docs/compliance/pii-policy', '7a7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/privacy',
                component: ComponentCreator('/docs/compliance/privacy', 'e14'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/responsible-ai',
                component: ComponentCreator('/docs/compliance/responsible-ai', 'c70'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/risk-register',
                component: ComponentCreator('/docs/compliance/risk-register', 'e3b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/compliance/vendor-management',
                component: ComponentCreator('/docs/compliance/vendor-management', '334'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/breach-playbook',
                component: ComponentCreator('/docs/runbooks/breach-playbook', '5d7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/data-retention',
                component: ComponentCreator('/docs/runbooks/data-retention', 'e4f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/disaster-recovery',
                component: ComponentCreator('/docs/runbooks/disaster-recovery', 'b5d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/incident-response',
                component: ComponentCreator('/docs/runbooks/incident-response', '13a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/key-rotation',
                component: ComponentCreator('/docs/runbooks/key-rotation', 'aa7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/oncall',
                component: ComponentCreator('/docs/runbooks/oncall', 'ec6'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/open-source-quickstart',
                component: ComponentCreator('/docs/runbooks/open-source-quickstart', 'a92'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/rollback',
                component: ComponentCreator('/docs/runbooks/rollback', '2fd'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/runbooks/sla-slo',
                component: ComponentCreator('/docs/runbooks/sla-slo', '057'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
