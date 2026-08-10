"use client";

import { useEffect, useRef, useState } from "react";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type SiteHeaderProps = {
  active?: "home" | "records" | "vaultguru" | "matches" | "players" | "milestones" | "insights";
};

export function SiteHeader({ active }: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const links = [
    { href: `${publicBasePath}/`, label: "Home", key: "home", icon: `${publicBasePath}/escc-logo.png` },
    { href: `${publicBasePath}/records/`, label: "Records", key: "records", icon: `${publicBasePath}/icons/medal.svg` },
    { href: `${publicBasePath}/vaultguru/`, label: "VaultGuru", key: "vaultguru", icon: `${publicBasePath}/icons/lightbulb.svg` },
    { href: `${publicBasePath}/matches/`, label: "Matches", key: "matches", icon: `${publicBasePath}/icons/calendar-days.svg` },
    { href: `${publicBasePath}/players/`, label: "Players", key: "players", icon: `${publicBasePath}/icons/users.svg` },
    { href: `${publicBasePath}/milestones/`, label: "Milestones", key: "milestones", icon: `${publicBasePath}/icons/flag.svg` },
    { href: `${publicBasePath}/insights/`, label: "Insights", key: "insights", icon: `${publicBasePath}/icons/chart-no-axes-combined.svg` },
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
      <div className="mobile-navigation" ref={mobileMenuRef}>
        <button
          type="button"
          className="mobile-navigation-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span className="burger-icon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
        <nav
          id="mobile-navigation-menu"
          aria-label="Mobile navigation"
          data-open={mobileMenuOpen ? "true" : "false"}
          onClick={() => setMobileMenuOpen(false)}
        >
          {links.map((link) => (
            <a
              href={link.href}
              aria-current={active === link.key ? "page" : undefined}
              key={link.key}
            >
              <img
                src={link.icon}
                alt=""
                className={link.key === "home" ? "mobile-home-icon" : undefined}
              />
              <span>{link.label}</span>
            </a>
          ))}
          <a
            href="https://www.edinburghsouthcc.org"
            target="_blank"
            rel="noreferrer"
          >
            <span className="mobile-club-icon" aria-hidden="true">↗</span>
            <span>Club website</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
