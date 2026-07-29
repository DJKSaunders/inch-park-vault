const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type SiteHeaderProps = {
  active?: "home" | "records" | "matches" | "players" | "insights";
};

export function SiteHeader({ active }: SiteHeaderProps) {
  const links = [
    { href: `${publicBasePath}/`, label: "Home", key: "home" },
    { href: `${publicBasePath}/records/`, label: "Records", key: "records" },
    { href: `${publicBasePath}/matches/`, label: "Matches", key: "matches" },
    { href: `${publicBasePath}/players/`, label: "Players", key: "players" },
    { href: `${publicBasePath}/insights/`, label: "Insights", key: "insights" },
  ] as const;

  const navigation = links.map((link) => (
    <a
      href={link.href}
      aria-current={active === link.key ? "page" : undefined}
      key={link.key}
    >
      {link.label}
    </a>
  ));

  return (
    <header className="site-header">
      <a
        className="brand"
        href={`${publicBasePath}/`}
        aria-label="The Inch Park Vault home"
      >
        <img src={`${publicBasePath}/escc-logo.png`} alt="" />
        <span>
          <strong>The Inch Park Vault</strong>
          <small>Edinburgh South Cricket Club Performance Archive · 2004–2026</small>
        </span>
      </a>
      <nav className="desktop-navigation" aria-label="Primary navigation">
        {navigation}
        <a
          href="https://www.edinburghsouthcc.org"
          target="_blank"
          rel="noreferrer"
        >
          Club website <span aria-hidden="true">↗</span>
        </a>
      </nav>
      <details className="mobile-navigation">
        <summary aria-label="Open navigation">Menu</summary>
        <nav aria-label="Mobile navigation">
          {navigation}
          <a
            href="https://www.edinburghsouthcc.org"
            target="_blank"
            rel="noreferrer"
          >
            Club website <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </details>
    </header>
  );
}
