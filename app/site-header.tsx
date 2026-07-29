const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type SiteHeaderProps = {
  active?: "records" | "matches";
};

export function SiteHeader({ active }: SiteHeaderProps) {
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
      <nav aria-label="Primary navigation">
        <a
          href={`${publicBasePath}/#rankings`}
          aria-current={active === "records" ? "page" : undefined}
        >
          Records
        </a>
        <a
          href={`${publicBasePath}/matches/`}
          aria-current={active === "matches" ? "page" : undefined}
        >
          Matches
        </a>
        <a
          href="https://www.edinburghsouthcc.org"
          target="_blank"
          rel="noreferrer"
        >
          Club website <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
