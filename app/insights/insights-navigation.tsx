const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type InsightsGroup = "club" | "players" | "xis" | "seasons" | "archive";
export type InsightsSubsection =
  | "overview"
  | "club-trends"
  | "dismissals"
  | "compare"
  | "team-histories"
  | "season-reviews"
  | "team-performances"
  | "record-progression"
  | "data-coverage";

const groups: {
  key: InsightsGroup;
  label: string;
  href: string;
  subsections: { key: InsightsSubsection; label: string; href: string }[];
}[] = [
  {
    key: "club",
    label: "Club",
    href: `${publicBasePath}/insights/club/overview/#overview`,
    subsections: [
      { key: "overview", label: "Overview", href: `${publicBasePath}/insights/club/overview/#overview` },
      { key: "club-trends", label: "Club trends", href: `${publicBasePath}/insights/club/overview/#club-trends` },
      { key: "dismissals", label: "Dismissals", href: `${publicBasePath}/insights/club/overview/#dismissals` },
    ],
  },
  {
    key: "players",
    label: "Players",
    href: `${publicBasePath}/insights/players/compare/`,
    subsections: [
      { key: "compare", label: "Player comparison", href: `${publicBasePath}/insights/players/compare/` },
    ],
  },
  {
    key: "xis",
    label: "Teams",
    href: `${publicBasePath}/insights/teams/history/`,
    subsections: [
      { key: "team-histories", label: "XI records", href: `${publicBasePath}/insights/teams/history/` },
      { key: "team-performances", label: "Best performances by XI", href: `${publicBasePath}/insights/teams/performances/` },
    ],
  },
  {
    key: "seasons",
    label: "Seasons",
    href: `${publicBasePath}/insights/teams/seasons/`,
    subsections: [
      { key: "season-reviews", label: "Season overview", href: `${publicBasePath}/insights/teams/seasons/` },
    ],
  },
  {
    key: "archive",
    label: "Archive",
    href: `${publicBasePath}/insights/archive/progression/`,
    subsections: [
      { key: "record-progression", label: "Record progression", href: `${publicBasePath}/insights/archive/progression/` },
      { key: "data-coverage", label: "Data coverage", href: `${publicBasePath}/insights/archive/coverage/` },
    ],
  },
];

export function InsightsNavigation({
  activeGroup,
  activeSubsection,
}: {
  activeGroup: InsightsGroup;
  activeSubsection: InsightsSubsection;
}) {
  const selectedGroup = groups.find((group) => group.key === activeGroup) ?? groups[0];

  return (
    <div className="insights-navigation-shell">
      <nav className="insights-primary-tabs" aria-label="Primary Insights sections">
        {groups.map((group) => (
          <a
            href={group.href}
            aria-current={activeGroup === group.key ? "page" : undefined}
            key={group.key}
          >
            {group.label}
          </a>
        ))}
      </nav>
      {selectedGroup.subsections.length > 1 && (
        <nav
          className={`insights-secondary-tabs count-${selectedGroup.subsections.length}`}
          aria-label={`${selectedGroup.label} Insights sections`}
        >
          {selectedGroup.subsections.map((subsection) => (
            <a
              href={subsection.href}
              aria-current={activeSubsection === subsection.key ? "page" : undefined}
              key={subsection.key}
            >
              {subsection.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
