import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "scrape_scorecards.py"
SPEC = importlib.util.spec_from_file_location("scrape_scorecards", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ScorecardParserTests(unittest.TestCase):
    def test_parses_scorecard_tables_and_metadata(self):
        source = """
        <html><head><title>
        Visitors v Edinburgh South Cricket Club 1st XI on Sat 25 Jul 2026 at 12:00
        </title></head><body>
        <h2 class="result">Visitors v Edinburgh South Cricket Club 1st XI on Sat
        25 Jul 2026 at 12:00<br/>Edinburgh South Cricket Club Won by 3 wickets</h2>
        <fieldset><legend>Edinburgh South Cricket Club 1st XI Batting</legend>
        <table id="bat"><thead><tr>
          <th>Player Name</th><th>&nbsp;</th><th>R</th><th>M</th><th>B</th>
          <th>4s</th><th>6s</th><th>SR</th><th>Catches</th><th>Stumpings</th><th>Run outs</th>
        </tr></thead><tfoot><tr>
          <td><div>extras</div>TOTAL :</td><td><div>2nb 3w</div>for 7 wickets</td>
          <td><div>5</div>255 (49.2 overs)</td>
        </tr></tfoot><tbody><tr>
          <td><a href="/memberprofile/memberID_123/Test-Player.aspx">Test Player</a></td>
          <td>Not Out</td><td>80</td><td>90</td><td>75</td><td>8</td><td>2</td>
          <td>106.67</td><td>1</td><td></td><td></td>
        </tr></tbody></table></fieldset>
        <h3>Edinburgh South Cricket Club 1st XI Bowling</h3>
        <table id="bowl"><thead><tr>
          <th>Player Name</th><th>Overs</th><th>Maidens</th><th>Runs</th>
          <th>Wickets</th><th>Average</th><th>Economy</th>
        </tr></thead><tbody><tr>
          <td><a href="/memberprofile/memberID_123/Test-Player.aspx">Test Player</a></td>
          <td>9.2</td><td>1</td><td>26</td><td>4</td><td>6.50</td><td>2.79</td>
        </tr></tbody></table>
        </body></html>
        """
        match = MODULE.parse_scorecard("925531", "https://example.test", source)
        self.assertEqual(match["date"], "2026-07-25")
        self.assertEqual(match["result"]["outcome"], "win")
        batter = match["batting"][0]["players"][0]
        self.assertEqual(batter["memberId"], "123")
        self.assertEqual(batter["runs"], 80)
        self.assertEqual(batter["balls"], 75)
        self.assertEqual(match["batting"][0]["total"]["runs"], 255)
        self.assertEqual(match["batting"][0]["total"]["wickets"], 7)
        bowler = match["bowling"][0]["players"][0]
        self.assertEqual(bowler["balls"], 56)
        self.assertEqual(bowler["wickets"], 4)

    def test_deterministic_sample_keeps_endpoints(self):
        rows = [
            {"fixtureId": str(index), "season": 2026, "url": "", "result": ""}
            for index in range(10)
        ]
        sample = MODULE.deterministic_sample(rows, 3)
        self.assertEqual([row["fixtureId"] for row in sample], ["0", "4", "9"])

    def test_classifies_drawn_match(self):
        source = """
        <html><head><title>
        Team A v Edinburgh South Cricket Club Mitres on Tue 22 Jun 2010 at 18.00
        </title></head><body>
        <h2 class="result">Team A v Edinburgh South Cricket Club Mitres on Tue
        22 Jun 2010 at 18.00<br/>Match was Drawn</h2>
        </body></html>
        """
        match = MODULE.parse_scorecard("1", "https://example.test", source)
        self.assertEqual(match["result"]["outcome"], "draw")


if __name__ == "__main__":
    unittest.main()
