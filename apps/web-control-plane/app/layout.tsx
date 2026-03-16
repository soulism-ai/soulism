import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import '../src/styles/app.css';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap'
});

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap'
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap'
});

const runtimeConfig = {
  gatewayServiceUrl: process.env.NEXT_PUBLIC_CONTROL_PLANE_API_BASE_URL ?? ''
};

const runtimeConfigScript = `window.__COGNITIVE_AI_RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};`;

export const metadata: Metadata = {
  title: 'Soulism Control Plane',
  description: 'Manage OpenClaw-inspired cognitive assistants, memory, and tasks.',
  metadataBase: new URL('https://web-control-plane.vercel.app')
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript }} />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>
        <div className="app-container">
          <nav className="app-sidebar">
            <div className="sidebar-brand">
              <div className="brand-logo">S</div>
              <span>Soulism</span>
            </div>
            <ul className="sidebar-nav">
              <li><a href="/" className="active">Dashboard</a></li>
              <li><a href="#">Memory Base</a></li>
              <li><a href="#">Action Feed</a></li>
              <li><a href="#">Soul Settings</a></li>
              <li><a href="#">Connections</a></li>
            </ul>
            <div className="sidebar-bottom">
               <div className="usage-meter">
                 <div className="meter-label">
                    <span>API Usage</span>
                    <small>$47.15 / 123k out</small>
                 </div>
                 <div className="meter-bar"><div className="meter-fill" style={{width: '45%'}}></div></div>
               </div>
            </div>
          </nav>
          <div className="app-main">
            <header className="app-header">
              <div className="header-breadcrumbs">Overview / Running Agents</div>
              <div className="header-status">
                <span className="status-dot healthy"></span>
                Soul State: <strong className="glow-text">Lucid</strong>
              </div>
            </header>
            <main className="app-content">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
