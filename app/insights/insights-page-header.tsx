import archive from "../../public/data/archive-developments.json";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function InsightsPageHeader() {
  return (
    <header className="portal-page-heading insights-page-heading">
      <div className="insights-as-of">Stats as of <strong>{longDate.format(new Date(`${archive.asOfDate}T12:00:00`))}</strong></div>
      <p className="eyebrow">Visual analysis</p>
      <h1>Insights</h1>
      <p>Explore club trends, compare careers and follow the records that shaped the Vault.</p>
    </header>
  );
}
