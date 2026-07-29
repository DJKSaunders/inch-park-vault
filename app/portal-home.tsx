import { SiteHeader } from "./site-header";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type PortalHomeProps = {
  summary: {
    seasons: number;
    players: number;
    performances: number;
    matches: number;
    seasonStart: number;
    seasonEnd: number;
  };
  latestMatches: {
    fixtureId: string;
    date: string;
    team: string | null;
    opposition: string | null;
    result: string;
  }[];
};

const formatDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function PortalHome({ summary, latestMatches }: PortalHomeProps) {
  const sections = [
    {
      eyebrow: "Career archive",
      title: "Records",
      copy: "Rank players across batting, bowling and fielding with precise filters.",
      href: `${publicBasePath}/records/`,
      stat: `${summary.performances.toLocaleString("en-GB")} performances`,
    },
    {
      eyebrow: "Fixture archive",
      title: "Matches",
      copy: "Search every available result and open its complete scorecard.",
      href: `${publicBasePath}/matches/`,
      stat: `${summary.matches.toLocaleString("en-GB")} fixtures`,
    },
    {
      eyebrow: "Career histories",
      title: "Players",
      copy: "Find a player, explore every statistic and follow their career by season.",
      href: `${publicBasePath}/players/`,
      stat: `${summary.players.toLocaleString("en-GB")} players`,
    },
    {
      eyebrow: "Visual analysis",
      title: "Insights",
      copy: "Compare players and explore how teams, seasons and opponents changed.",
      href: `${publicBasePath}/insights/`,
      stat: `${summary.seasons} seasons`,
    },
  ];

  return (
    <>
      <SiteHeader active="home" />
      <main className="portal-home">
        <section className="portal-hero">
          <p className="eyebrow">Edinburgh South Cricket Club · {summary.seasonStart}–{summary.seasonEnd}</p>
          <h1>
            Every season.
            <br />
            <em>One Vault.</em>
          </h1>
          <p>
            Explore the club through records, scorecards, player careers and
            interactive statistical stories.
          </p>
          <div className="portal-hero-actions">
            <a className="primary-action" href={`${publicBasePath}/players/`}>
              Find a player
            </a>
            <a href={`${publicBasePath}/insights/`}>Explore insights</a>
          </div>
        </section>

        <section className="portal-section-grid" aria-label="Explore the Vault">
          {sections.map((section, index) => (
            <a href={section.href} className="portal-section-card" key={section.title}>
              <span className="card-number">0{index + 1}</span>
              <p>{section.eyebrow}</p>
              <h2>{section.title}</h2>
              <strong>{section.stat}</strong>
              <span>{section.copy}</span>
              <i aria-hidden="true">Explore →</i>
            </a>
          ))}
        </section>

        <section className="latest-vault-matches">
          <header>
            <div>
              <p className="eyebrow">Latest in the archive</p>
              <h2>Recent matches</h2>
            </div>
            <a href={`${publicBasePath}/matches/`}>View all matches →</a>
          </header>
          <div>
            {latestMatches.map((match) => (
              <a
                href={`${publicBasePath}/matches/${match.fixtureId}/`}
                key={match.fixtureId}
              >
                <time dateTime={match.date}>
                  {formatDate.format(new Date(`${match.date}T12:00:00`))}
                </time>
                <strong>
                  {match.team ?? "ESCC"} <span>v</span>{" "}
                  {match.opposition ?? "Opposition"}
                </strong>
                <p>{match.result}</p>
              </a>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
