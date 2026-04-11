export interface Package {
  id: string;
  namespace: string;
  slug: string;
  name: string;
  description: string;
  domain: string;
  downloads: number;
  version: string;
  author?: string;
  repository?: string;
}

export interface PackageVersion {
  version: string;
  publishedAt: string;
  description?: string;
  swiftOutputPreview?: string;
}

export interface PackageDetail extends Package {
  readme: string;
  versions: PackageVersion[];
  repository?: string;
  homepage?: string;
  license?: string;
}

const AXINT_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <defs>
    <linearGradient id="axint-grad" x1="8" y1="8" x2="88" y2="88" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F05138"/>
      <stop offset="0.5" stop-color="#EC4899"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <linearGradient id="axint-stroke" x1="20" y1="20" x2="76" y2="76" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="88" height="88" rx="22" fill="url(#axint-grad)"/>
  <path d="M29 66 L48 26 L67 66 M37 54 L59 54" stroke="url(#axint-stroke)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="48" cy="48" r="2.5" fill="#FFFFFF"/>
</svg>`;

const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  messaging: { bg: 'bg-blue-950', text: 'text-blue-300', border: 'border-blue-800' },
  productivity: { bg: 'bg-green-950', text: 'text-green-300', border: 'border-green-800' },
  media: { bg: 'bg-purple-950', text: 'text-purple-300', border: 'border-purple-800' },
  navigation: { bg: 'bg-orange-950', text: 'text-orange-300', border: 'border-orange-800' },
  webbrowser: { bg: 'bg-red-950', text: 'text-red-300', border: 'border-red-800' },
  default: { bg: 'bg-zinc-800', text: 'text-zinc-300', border: 'border-zinc-700' },
};

function getDomainColor(domain: string) {
  return DOMAIN_COLORS[domain.toLowerCase()] || DOMAIN_COLORS.default;
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

function renderToolCard(name: string, type: string, hint: string, url: string): string {
  const colors: Record<string, string> = {
    npx: '#F05138', ext: '#007ACC', config: '#a78bfa', spm: '#F05138', lua: '#86efac',
  };
  const color = colors[type] || '#a1a1a6';
  return `<a href="${url}" target="_blank" rel="noopener" style="
    display:flex;flex-direction:column;align-items:center;gap:0.5rem;
    padding:1.25rem 1rem;border-radius:12px;text-decoration:none;
    background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
    transition:all 0.25s cubic-bezier(0.4,0,0.2,1);color:#e4e4e7;
  " onmouseover="this.style.borderColor='${color}';this.style.transform='translateY(-4px)';this.style.boxShadow='0 12px 24px rgba(0,0,0,0.3)'"
     onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';this.style.transform='none';this.style.boxShadow='none'">
    <span style="font-weight:600;font-size:0.95rem;">${name}</span>
    <span style="font-size:0.7rem;color:#71717a;text-align:center;line-height:1.3;">${hint}</span>
  </a>`;
}

function renderBaseLayout(title: string, content: string, showNav = true): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Axint Registry</title>
  <meta name="description" content="Write an App Intent in TypeScript. Ship it to Siri. One defineIntent() call, one Swift App Intent out. The picks and shovels of Agent Siri.">
  <meta name="keywords" content="axint, swift compiler, app intents, siri, agent siri, shortcuts, swiftui, widgetkit, typescript to swift, python to swift, apple developer tools, mcp, ai coding, ios 27">
  <meta property="og:title" content="Axint — Write an App Intent in TypeScript, ship it to Siri">
  <meta property="og:description" content="One TypeScript defineIntent(). One Swift App Intent for Siri. One MCP tool for Claude, Cursor, and Windsurf. The picks and shovels of Agent Siri.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://axint.ai">
  <meta property="og:site_name" content="Axint">
  <meta property="og:image" content="https://axint.ai/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Axint — Write an App Intent in TypeScript, ship it to Siri">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@agenticempire">
  <meta name="twitter:creator" content="@agenticempire">
  <meta name="twitter:title" content="Axint — Write an App Intent in TypeScript, ship it to Siri">
  <meta name="twitter:description" content="One TypeScript defineIntent(). One Swift App Intent for Siri. One MCP tool for Claude, Cursor, and Windsurf. The picks and shovels of Agent Siri.">
  <meta name="twitter:image" content="https://axint.ai/og-image.png">
  <link rel="canonical" href="https://axint.ai">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      background: linear-gradient(135deg, #09090b 0%, #0f0f12 50%, #09090b 100%);
      color: #e4e4e7;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Navigation */
    nav {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    nav > div {
      max-width: 1280px;
      margin: 0 auto;
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .nav-logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: #e4e4e7;
      font-weight: 600;
      font-size: 1.125rem;
    }

    .nav-logo svg {
      width: 32px;
      height: 32px;
    }

    .nav-links {
      display: flex;
      gap: 2rem;
      list-style: none;
    }

    .nav-links a {
      color: #a1a1a6;
      text-decoration: none;
      font-size: 0.875rem;
      transition: color 0.3s;
    }

    .nav-links a:hover {
      color: #e4e4e7;
    }

    /* Main content */
    main {
      flex: 1;
      max-width: 1280px;
      margin: 0 auto;
      width: 100%;
      padding: 0 1.5rem;
    }

    /* Footer */
    footer {
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(0, 0, 0, 0.5);
      margin-top: 4rem;
      padding: 3rem 1.5rem;
      color: #71717a;
      font-size: 0.875rem;
    }

    footer > div {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }

    footer h3 {
      color: #e4e4e7;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }

    footer a {
      color: #71717a;
      text-decoration: none;
      display: block;
      margin-bottom: 0.75rem;
      transition: color 0.3s;
    }

    footer a:hover {
      color: #e4e4e7;
    }

    .footer-bottom {
      max-width: 1280px;
      margin: 0 auto;
      padding-top: 2rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
    }

    /* Screen reader only */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }

    /* Monaco editor lazy loading */
    .monaco-loading {
      display: none;
      padding: 2rem;
      text-align: center;
      color: #a1a1a6;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    /* Responsive */
    @media (max-width: 768px) {
      nav > div {
        flex-direction: column;
        gap: 1rem;
      }

      .nav-links {
        gap: 1rem;
      }

      main {
        padding: 0 1rem;
      }
    }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Axint",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "macOS, iOS",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "description": "Write an App Intent in TypeScript, ship it to Siri. The open-source compiler for Apple App Intents, SwiftUI, WidgetKit, and full apps.",
    "url": "https://axint.ai",
    "license": "https://www.apache.org/licenses/LICENSE-2.0",
    "version": "0.3.2",
    "author": { "@type": "Organization", "name": "Ambition Labs", "url": "https://ambitionlabs.com" },
    "sameAs": ["https://github.com/agenticempire/axint", "https://x.com/agenticempire"],
    "downloadUrl": "https://www.npmjs.com/package/@axintai/compiler"
  }
  </script>
  ${content}
</head>
<body>
  <a href="#main" class="sr-only">Skip to content</a>
  ${showNav ? `
  <nav>
    <div>
      <a href="/" class="nav-logo" aria-label="Axint home">
        ${AXINT_LOGO}
        <span>Axint</span>
      </a>
      <ul class="nav-links">
        <li><a href="/" aria-label="Registry home">Registry</a></li>
        <li><a href="https://github.com/agenticempire/axint" target="_blank" aria-label="GitHub repository">GitHub</a></li>
        <li><a href="https://axint.dev" target="_blank" aria-label="Documentation">Docs</a></li>
        <li><a href="https://discord.gg/axint" target="_blank" aria-label="Discord community">Discord</a></li>
      </ul>
    </div>
  </nav>
  ` : ''}
  <main id="main" role="main">
    ${content}
  </main>
  <footer>
    <div>
      <div>
        <h3>Product</h3>
        <a href="/" aria-label="Registry home">Registry</a>
        <a href="https://github.com/agenticempire/axint" target="_blank" aria-label="Axint GitHub repository">GitHub</a>
        <a href="https://github.com/agenticempire/axint/releases" target="_blank" aria-label="Release notes">Releases</a>
      </div>
      <div>
        <h3>Resources</h3>
        <a href="https://axint.dev" target="_blank" aria-label="Axint documentation">Documentation</a>
        <a href="https://axint.dev/guides" target="_blank" aria-label="Getting started guides">Guides</a>
        <a href="https://axint.dev/api" target="_blank" aria-label="API reference">API Reference</a>
      </div>
      <div>
        <h3>Community</h3>
        <a href="https://discord.gg/axint" target="_blank" aria-label="Join Discord community">Discord</a>
        <a href="https://x.com/agenticempire" target="_blank" aria-label="Follow on X">X</a>
        <a href="https://github.com/agenticempire" target="_blank" aria-label="Agenticempire GitHub organization">GitHub Org</a>
      </div>
      <div>
        <h3>Company</h3>
        <a href="https://ambitionlabs.com" target="_blank" aria-label="Ambition Labs website">Ambition Labs</a>
        <a href="https://github.com/agenticempire/axint/blob/main/LICENSE" target="_blank" aria-label="Apache 2.0 License">License</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 Ambition Labs. Axint is open source under Apache 2.0.</p>
    </div>
  </footer>
</body>
</html>`;
}

export function renderHomePage(packages: Package[] = []): string {
  const styles = `
  <style>
    .hero {
      padding: 6rem 0;
      text-align: center;
    }

    .hero-title {
      font-size: 4rem;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 1.5rem;
      background: linear-gradient(90deg, #F05138 0%, #EC4899 50%, #7C3AED 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradientShift 3s ease-in-out infinite;
    }

    @keyframes gradientShift {
      0%, 100% { background-position: 0% center; }
      50% { background-position: 100% center; }
    }

    .hero-subtitle {
      font-size: 1.25rem;
      color: #a1a1a6;
      margin-bottom: 2rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .search-container {
      max-width: 600px;
      margin: 0 auto 4rem;
      position: relative;
    }

    .search-input {
      width: 100%;
      padding: 1rem 1.5rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: #e4e4e7;
      font-size: 1rem;
      transition: all 0.3s;
    }

    .search-input::placeholder {
      color: #71717a;
    }

    .search-input:focus {
      outline: none;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(240, 81, 56, 0.5);
      box-shadow: 0 0 0 3px rgba(240, 81, 56, 0.1);
    }

    .featured-section {
      margin-bottom: 4rem;
    }

    .featured-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 2rem;
      text-align: center;
      color: #e4e4e7;
    }

    .packages-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 2rem;
    }

    .package-card {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.5rem;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .package-card:hover {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
      border-color: rgba(240, 81, 56, 0.3);
      transform: translateY(-8px);
      box-shadow: 0 20px 40px rgba(240, 81, 56, 0.15);
    }

    .package-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .package-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: #e4e4e7;
    }

    .domain-badge {
      padding: 0.375rem 0.75rem;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid;
    }

    .package-description {
      color: #a1a1a6;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      flex: 1;
      line-height: 1.5;
    }

    .package-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      color: #71717a;
      font-size: 0.75rem;
    }

    .download-count {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .version-badge {
      background: rgba(255, 255, 255, 0.05);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
    }

    @media (max-width: 768px) {
      .hero-title {
        font-size: 2rem;
      }

      .hero-subtitle {
        font-size: 1rem;
      }

      .packages-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
  `;

  const packageCardsHtml = packages.slice(0, 6).map((pkg) => {
    const colors = getDomainColor(pkg.domain);
    return `
    <a href="/@${encodeURIComponent(pkg.namespace)}/${encodeURIComponent(pkg.slug)}" class="package-card">
      <div class="package-header">
        <span class="package-name">${escapeHtml(pkg.name)}</span>
        <span class="domain-badge ${colors.bg} ${colors.text} ${colors.border}" style="border-color: currentColor;">
          ${escapeHtml(pkg.domain)}
        </span>
      </div>
      <p class="package-description">${escapeHtml(pkg.description)}</p>
      <div class="package-footer">
        <span class="download-count">
          📦 ${formatDownloads(pkg.downloads)} downloads
        </span>
        <span class="version-badge">${escapeHtml(pkg.version)}</span>
      </div>
    </a>
    `;
  }).join('');

  const content = `
  <div class="hero">
    <h1 class="hero-title">Axint Registry</h1>
    <p class="hero-subtitle">
      Discover and install App Intents, SwiftUI Views, Widgets, and Apps — all compiled from TypeScript.
    </p>

    <form class="search-container" action="/search" method="get">
      <input
        type="text"
        name="q"
        class="search-input"
        placeholder="Search packages..."
        autocomplete="off"
      >
    </form>

    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:1.5rem;">
      <a href="/search?q=messaging" style="padding:0.375rem 1rem;border-radius:20px;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(96,165,250,0.3);color:#93c5fd;background:rgba(96,165,250,0.08);transition:all 0.2s;">Messaging</a>
      <a href="/search?q=productivity" style="padding:0.375rem 1rem;border-radius:20px;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(74,222,128,0.3);color:#86efac;background:rgba(74,222,128,0.08);transition:all 0.2s;">Productivity</a>
      <a href="/search?q=media" style="padding:0.375rem 1rem;border-radius:20px;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(192,132,252,0.3);color:#d8b4fe;background:rgba(192,132,252,0.08);transition:all 0.2s;">Media</a>
      <a href="/search?q=navigation" style="padding:0.375rem 1rem;border-radius:20px;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(251,146,60,0.3);color:#fdba74;background:rgba(251,146,60,0.08);transition:all 0.2s;">Navigation</a>
      <a href="/search?q=webbrowser" style="padding:0.375rem 1rem;border-radius:20px;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(248,113,113,0.3);color:#fca5a5;background:rgba(248,113,113,0.08);transition:all 0.2s;">Web Browser</a>
    </div>
  </div>

  ${packages.length > 0 ? `
  <section class="featured-section">
    <h2 class="featured-title">Featured Packages</h2>
    <div class="packages-grid">
      ${packageCardsHtml}
    </div>
  </section>
  ` : ''}

  <section style="margin-bottom:4rem;">
    <h2 style="font-size:2rem;font-weight:700;text-align:center;margin-bottom:0.5rem;color:#e4e4e7;">Works with every AI coding tool</h2>
    <p style="text-align:center;color:#71717a;margin-bottom:2.5rem;font-size:0.95rem;">One MCP server. Ten integrations. Install in seconds.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;max-width:900px;margin:0 auto;">
      ${renderToolCard('Claude Code', 'npx', '/plugin marketplace add agenticempire/axint', 'https://github.com/agenticempire/axint/tree/main/extensions/claude-code')}
      ${renderToolCard('Claude Desktop', 'config', 'One-click .mcpb bundle', 'https://github.com/agenticempire/axint/tree/main/extensions/claude-desktop')}
      ${renderToolCard('VS Code', 'ext', 'ext install agenticempire.axint', 'https://marketplace.visualstudio.com/items?itemName=agenticempire.axint')}
      ${renderToolCard('Cursor', 'config', 'Settings → Tools → MCP', 'https://github.com/agenticempire/axint/tree/main/extensions/cursor')}
      ${renderToolCard('Windsurf', 'config', 'Cascade → MCP → Axint', 'https://github.com/agenticempire/axint/tree/main/extensions/windsurf')}
      ${renderToolCard('Codex', 'config', 'Add MCP config', 'https://github.com/agenticempire/axint/tree/main/extensions/codex')}
      ${renderToolCard('Xcode', 'spm', 'SPM build plugin', 'https://github.com/agenticempire/axint/tree/main/extensions/xcode')}
      ${renderToolCard('JetBrains', 'config', 'AI Assistant → MCP', 'https://github.com/agenticempire/axint/tree/main/extensions/jetbrains')}
      ${renderToolCard('Zed', 'config', 'Context server config', 'https://github.com/agenticempire/axint/tree/main/extensions/zed')}
      ${renderToolCard('Neovim', 'lua', 'Any MCP plugin', 'https://github.com/agenticempire/axint/tree/main/extensions/neovim')}
    </div>
  </section>
  `;

  return renderBaseLayout('Home', styles + '<div>' + content + '</div>');
}

export function renderSearchPage(query: string, results: Package[] = []): string {
  const styles = `
  <style>
    .search-header {
      padding: 3rem 0 2rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      margin-bottom: 2rem;
    }

    .search-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    .search-meta {
      color: #71717a;
      font-size: 0.875rem;
    }

    .search-meta strong {
      color: #e4e4e7;
    }

    .no-results {
      text-align: center;
      padding: 4rem 2rem;
      color: #71717a;
    }

    .no-results h2 {
      font-size: 1.5rem;
      color: #a1a1a6;
      margin-bottom: 0.5rem;
    }

    .packages-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .package-card {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.5rem;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .package-card:hover {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
      border-color: rgba(240, 81, 56, 0.3);
      transform: translateY(-8px);
      box-shadow: 0 20px 40px rgba(240, 81, 56, 0.15);
    }

    .package-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .package-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: #e4e4e7;
    }

    .domain-badge {
      padding: 0.375rem 0.75rem;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid;
      white-space: nowrap;
    }

    .package-namespace {
      color: #71717a;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .package-description {
      color: #a1a1a6;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      flex: 1;
      line-height: 1.5;
    }

    .package-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      color: #71717a;
      font-size: 0.75rem;
    }

    .download-count {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .version-badge {
      background: rgba(255, 255, 255, 0.05);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
    }

    @media (max-width: 768px) {
      .search-header {
        padding: 2rem 0 1rem;
      }

      .search-title {
        font-size: 1.5rem;
      }

      .packages-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
  `;

  const packageCardsHtml = results.map((pkg) => {
    const colors = getDomainColor(pkg.domain);
    return `
    <a href="/@${encodeURIComponent(pkg.namespace)}/${encodeURIComponent(pkg.slug)}" class="package-card">
      <div class="package-namespace">@${escapeHtml(pkg.namespace)}</div>
      <div class="package-header">
        <span class="package-name">${escapeHtml(pkg.name)}</span>
        <span class="domain-badge ${colors.bg} ${colors.text} ${colors.border}" style="border-color: currentColor;">
          ${escapeHtml(pkg.domain)}
        </span>
      </div>
      <p class="package-description">${escapeHtml(pkg.description)}</p>
      <div class="package-footer">
        <span class="download-count">
          📦 ${formatDownloads(pkg.downloads)} downloads
        </span>
        <span class="version-badge">${escapeHtml(pkg.version)}</span>
      </div>
    </a>
    `;
  }).join('');

  const resultCount = results.length;
  const content = `
  <div class="search-header">
    <h1 class="search-title">Search Results</h1>
    <div class="search-meta">
      ${resultCount > 0
        ? `Found <strong>${resultCount}</strong> package${resultCount === 1 ? '' : 's'} for "<strong>${escapeHtml(query)}</strong>"`
        : `No packages found for "<strong>${escapeHtml(query)}</strong>"`
      }
    </div>
  </div>

  ${resultCount > 0 ? `
    <div class="packages-grid">
      ${packageCardsHtml}
    </div>
  ` : `
    <div class="no-results">
      <h2>No packages found</h2>
      <p>Try a different search term or browse <a href="/" style="color: #EC4899; text-decoration: none;">featured packages</a></p>
    </div>
  `}
  `;

  return renderBaseLayout(`Search: ${query}`, styles + '<div>' + content + '</div>');
}

export function renderPackagePage(pkg: PackageDetail): string {
  const styles = `
  <style>
    .package-hero {
      padding: 3rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      margin-bottom: 3rem;
    }

    .package-breadcrumb {
      color: #71717a;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .package-breadcrumb a {
      color: #EC4899;
      text-decoration: none;
    }

    .package-breadcrumb a:hover {
      text-decoration: underline;
    }

    .package-header-flex {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .package-title-block h1 {
      font-size: 2.5rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      color: #e4e4e7;
    }

    .package-subtitle {
      color: #a1a1a6;
      font-size: 1.125rem;
      margin-bottom: 1rem;
      max-width: 600px;
    }

    .package-meta {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .domain-badge {
      padding: 0.375rem 0.75rem;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid;
    }

    .meta-item {
      color: #71717a;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .stats {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
    }

    .stat {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #e4e4e7;
    }

    .stat-label {
      color: #71717a;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.25rem;
    }

    .install-section {
      background: linear-gradient(135deg, rgba(240, 81, 56, 0.1) 0%, rgba(236, 72, 153, 0.05) 100%);
      border: 1px solid rgba(240, 81, 56, 0.2);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 3rem;
    }

    .install-title {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #e4e4e7;
    }

    .install-command {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1rem;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      color: #e4e4e7;
      overflow-x: auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .install-code {
      flex: 1;
      user-select: all;
    }

    .copy-button {
      background: linear-gradient(90deg, #F05138, #EC4899);
      border: none;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.3s;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .copy-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(240, 81, 56, 0.3);
    }

    .copy-button.copied {
      background: #10b981;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 3rem;
      margin-bottom: 3rem;
    }

    .readme-section h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 2rem 0 1rem;
      color: #e4e4e7;
    }

    .readme-section h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 1.5rem 0 0.75rem;
      color: #e4e4e7;
    }

    .readme-section p {
      color: #a1a1a6;
      line-height: 1.7;
      margin-bottom: 1rem;
    }

    .readme-section code {
      background: rgba(255, 255, 255, 0.05);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.875em;
      color: #fbbf24;
    }

    .readme-section pre {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      color: #e4e4e7;
      line-height: 1.5;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .sidebar-card {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.5rem;
    }

    .sidebar-card h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #e4e4e7;
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.875rem;
    }

    .version-item {
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #a1a1a6;
      font-size: 0.875rem;
    }

    .version-item:last-child {
      border-bottom: none;
    }

    .version-badge {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      color: #EC4899;
    }

    .link-item {
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      text-decoration: none;
      color: #EC4899;
      text-align: center;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.3s;
      margin-bottom: 0.5rem;
    }

    .link-item:last-child {
      margin-bottom: 0;
    }

    .link-item:hover {
      background: rgba(236, 72, 153, 0.1);
      border-color: rgba(236, 72, 153, 0.3);
    }

    .swift-preview {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1rem;
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      color: #e4e4e7;
      overflow-x: auto;
      line-height: 1.5;
      max-height: 300px;
      overflow-y: auto;
    }

    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
      }

      .package-header-flex {
        flex-direction: column;
      }

      .package-title-block h1 {
        font-size: 2rem;
      }
    }
  </style>

  <script>
    let monacoLoaded = false;

    function loadMonacoEditor(containerId) {
      if (monacoLoaded) return Promise.resolve();

      const container = document.getElementById(containerId);
      if (!container) return Promise.reject(new Error('Editor container not found'));

      const placeholder = container.querySelector('.monaco-loading');
      if (placeholder) {
        placeholder.style.display = 'block';
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/loader.min.js';
        script.onload = () => {
          require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs' } });
          require(['vs/editor/editor.main'], () => {
            monacoLoaded = true;
            if (placeholder) {
              placeholder.style.display = 'none';
            }
            resolve();
          });
        };
        script.onerror = () => reject(new Error('Failed to load Monaco Editor'));
        document.head.appendChild(script);
      });
    }

    function copyInstallCommand(button) {
      const code = button.previousElementSibling.textContent.trim();
      navigator.clipboard.writeText(code).then(() => {
        const original = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = original;
          button.classList.remove('copied');
        }, 2000);
      });
    }
  </script>
  `;

  const colors = getDomainColor(pkg.domain);
  const axintCmd = `axint add @${pkg.namespace}/${pkg.slug}`;
  const installCmd = `npm install @${pkg.namespace}/${pkg.slug}`;

  const versionsList = pkg.versions.slice(0, 10).map((v) => `
    <div class="version-item">
      <span>${escapeHtml(v.version)}</span>
      <span class="version-badge">${new Date(v.publishedAt).toLocaleDateString()}</span>
    </div>
  `).join('');

  const swiftPreview = pkg.versions[0]?.swiftOutputPreview ? `
    <div class="sidebar-card">
      <h3>Swift Output Preview</h3>
      <div class="swift-preview">${escapeHtml(pkg.versions[0].swiftOutputPreview)}</div>
    </div>
  ` : '';

  const readmeHtml = sanitizeMarkdown(pkg.readme);

  const content = `
  <div class="package-hero">
    <div class="package-breadcrumb">
      <a href="/">Registry</a> / <span>@${escapeHtml(pkg.namespace)}/${escapeHtml(pkg.slug)}</span>
    </div>

    <div class="package-header-flex">
      <div class="package-title-block">
        <h1>${escapeHtml(pkg.name)}</h1>
        <p class="package-subtitle">${escapeHtml(pkg.description)}</p>
        <div class="package-meta">
          <span class="domain-badge ${colors.bg} ${colors.text} ${colors.border}" style="border-color: currentColor;">
            ${escapeHtml(pkg.domain)}
          </span>
          ${pkg.author ? `<span class="meta-item">👤 ${escapeHtml(pkg.author)}</span>` : ''}
          ${pkg.license ? `<span class="meta-item">📜 ${escapeHtml(pkg.license)}</span>` : ''}
        </div>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${pkg.downloads.toLocaleString()}</div>
          <div class="stat-label">Downloads</div>
        </div>
        <div class="stat">
          <div class="stat-value">${escapeHtml(pkg.version)}</div>
          <div class="stat-label">Version</div>
        </div>
      </div>
    </div>
  </div>

  <div class="install-section">
    <div class="install-title">Quick Install</div>
    <div class="install-command" style="margin-bottom:0.75rem;">
      <code class="install-code">${escapeHtml(axintCmd)}</code>
      <button class="copy-button" onclick="copyInstallCommand(this)">Copy</button>
    </div>
    <div class="install-command" style="opacity:0.7;">
      <code class="install-code">${escapeHtml(installCmd)}</code>
      <button class="copy-button" onclick="copyInstallCommand(this)">Copy</button>
    </div>
  </div>

  <div class="content-grid">
    <div class="readme-section">
      ${readmeHtml}
    </div>

    <div class="sidebar">
      ${swiftPreview}

      <div class="sidebar-card">
        <h3>Versions</h3>
        ${versionsList}
      </div>

      <div class="sidebar-card">
        ${pkg.repository ? `<a href="${escapeHtml(pkg.repository)}" target="_blank" class="link-item">→ GitHub Repository</a>` : ''}
        ${pkg.homepage ? `<a href="${escapeHtml(pkg.homepage)}" target="_blank" class="link-item">→ Homepage</a>` : ''}
        <a href="https://github.com/agenticempire/axint" target="_blank" class="link-item">→ Axint Documentation</a>
      </div>
    </div>
  </div>
  `;

  return renderBaseLayout(`${pkg.name} - Axint Registry`, styles + '<div>' + content + '</div>');
}

export function renderNotFound(): string {
  const styles = `
  <style>
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
      padding: 2rem;
    }

    .not-found-code {
      font-size: 6rem;
      font-weight: 800;
      background: linear-gradient(90deg, #F05138, #EC4899, #7C3AED);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 1rem;
    }

    .not-found-title {
      font-size: 2rem;
      font-weight: 700;
      color: #e4e4e7;
      margin-bottom: 0.5rem;
    }

    .not-found-text {
      color: #a1a1a6;
      font-size: 1.125rem;
      margin-bottom: 2rem;
      max-width: 500px;
    }

    .not-found-link {
      display: inline-block;
      background: linear-gradient(90deg, #F05138, #EC4899);
      color: white;
      padding: 0.75rem 2rem;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s;
    }

    .not-found-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(240, 81, 56, 0.3);
    }
  </style>
  `;

  const content = `
  <div class="not-found">
    <div class="not-found-code">404</div>
    <h1 class="not-found-title">Package Not Found</h1>
    <p class="not-found-text">The package you're looking for doesn't exist or has been removed.</p>
    <a href="/" class="not-found-link">← Back to Registry</a>
  </div>
  `;

  return renderBaseLayout('404 - Not Found', styles + '<div>' + content + '</div>');
}

function sanitizeMarkdown(markdown: string): string {
  let html = escapeHtml(markdown);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code blocks
  html = html.replace(/```([\s\S]+?)```/g, '<pre>$1</pre>');

  // Links — sanitize href to block javascript: and data: schemes
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_match, text, href) => {
    const trimmed = href.trim().toLowerCase();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
      return text; // strip the link, keep the text
    }
    const safeHref = escapeHtml(href.trim());
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color: #EC4899; text-decoration: none; border-bottom: 1px solid #EC4899;">${text}</a>`;
  });

  // Paragraphs
  html = html.split('\n\n').map(p => p.trim()).filter(p => p).map(p => {
    if (p.startsWith('<h') || p.startsWith('<pre>')) return p;
    return `<p>${p}</p>`;
  }).join('');

  return html;
}
