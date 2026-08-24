#!/usr/bin/env python3
"""Local browser helper for routine Vault data updates.

It preserves the existing two-stage GitHub workflow: stage and review first,
then explicitly apply the validated refresh. Credentials remain in the Mac
user's existing ``gh auth login`` session; this app stores none.
"""

from __future__ import annotations

import cgi
import json
import os
import re
import subprocess
import sys
import threading
import webbrowser
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
UPDATES = ROOT / "data" / "updates"
REQUIRED_FILES = {"batting": "batting.xml", "bowling": "bowling.xml", "averages": "averages.xlsx"}
WORKFLOW_URL = "https://github.com/DJKSaunders/inch-park-vault/actions/workflows/refresh-vault-data.yml"


def run(command: list[str], *, timeout: int = 45) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=False)


def ensure_tools() -> None:
    missing = [command for command in ("git", "gh") if not run(["/usr/bin/env", "which", command]).stdout.strip()]
    if missing:
        raise ValueError(f"Missing required tool: {', '.join(missing)}")
    if run(["gh", "auth", "status", "--hostname", "github.com"]).returncode:
        raise ValueError("GitHub is not authenticated. Run: gh auth login")


def safe_season(value: str) -> int:
    if not re.fullmatch(r"20\d{2}", value.strip()):
        raise ValueError("Enter a four-digit season, for example 2026.")
    return int(value)


def next_directory() -> Path:
    candidate = UPDATES / date.today().isoformat()
    suffix = 2
    while candidate.exists():
        candidate = UPDATES / f"{date.today().isoformat()}-{suffix}"
        suffix += 1
    return candidate


def validate(directory: Path, season: int) -> dict[str, Any]:
    output = directory / "validation.json"
    result = run([sys.executable, "scripts/validate_update_package.py", str(directory.relative_to(ROOT)), "--season", str(season), "--output", str(output)])
    if result.returncode:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "Validation failed.")
    return json.loads(output.read_text(encoding="utf-8"))


def write_uploads(form: cgi.FieldStorage, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    try:
        for field, filename in REQUIRED_FILES.items():
            item = form[field] if field in form else None
            # ``cgi.FieldStorage`` deliberately cannot be used as a boolean.
            # Doing so aborts the HTTP response and the browser only reports
            # the unhelpful "Load failed" message.
            if item is None or getattr(item, "file", None) is None:
                raise ValueError(f"Choose the {filename} file.")
            if Path(item.filename or "").name.casefold() != filename.casefold():
                raise ValueError(f"The {field} file must be named {filename}.")
            payload = item.file.read()
            if not payload:
                raise ValueError(f"{filename} is empty.")
            (destination / filename).write_bytes(payload)
    except Exception:
        for path in destination.glob("*"):
            path.unlink(missing_ok=True)
        destination.rmdir()
        raise


def staged_updates() -> list[dict[str, str]]:
    if not UPDATES.exists():
        return []
    return [{"directory": str(path.relative_to(ROOT)), "label": path.name} for path in sorted((p for p in UPDATES.iterdir() if p.is_dir()), reverse=True) if all((path / filename).is_file() for filename in REQUIRED_FILES.values())]


def commit_package(directory: Path, season: int) -> None:
    ensure_tools()
    relative = str(directory.relative_to(ROOT))
    result = run(["git", "add", "--", relative])
    if result.returncode:
        raise ValueError(result.stderr.strip() or "Could not stage the update files.")
    result = run(["git", "commit", "-m", f"Add Vault update package for {season}"])
    if result.returncode and "nothing to commit" not in result.stdout:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "Could not commit the update package.")
    result = run(["git", "push", "origin", "HEAD:main"], timeout=90)
    if result.returncode:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "Could not push the update package.")


def trigger_workflow(directory: str, season: int, scrape: bool, apply: bool) -> None:
    ensure_tools()
    command = ["gh", "workflow", "run", "refresh-vault-data.yml", "--ref", "main", "-f", f"update_directory={directory}", "-f", f"season={season}", "-f", f"scrape_scorecards={'true' if scrape else 'false'}", "-f", f"apply_changes={'true' if apply else 'false'}"]
    result = run(command)
    if result.returncode:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or "Could not start the GitHub refresh.")


PAGE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vault Updater</title><style>
:root{--ink:#071727;--panel:#102841;--line:#29445e;--cream:#f5f0e7;--yellow:#ffcf11;--orange:#e6571a;--muted:#afbdd0}*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--cream);font:16px Arial,sans-serif}.shell{max-width:960px;margin:auto;padding:52px 24px 80px}.eyebrow{margin:0;color:var(--orange);font-weight:bold;letter-spacing:.2em;font-size:13px}.title{font-size:clamp(44px,8vw,88px);margin:12px 0;font-weight:900;letter-spacing:-.06em}.intro{max-width:670px;color:#d5d8d8;font-size:19px;line-height:1.45;margin:0 0 44px}.steps{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);margin-bottom:36px}.step{padding:20px;border-right:1px solid var(--line);min-height:112px}.step:last-child{border:0}.step b{display:block;color:var(--yellow);margin-bottom:8px}.card{border:1px solid var(--line);background:var(--panel);padding:28px;margin:20px 0}.card h2{margin:0 0 9px;font-size:26px}.card p{margin:0 0 22px;color:var(--muted);line-height:1.4}.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.field label{display:block;color:var(--yellow);font-size:12px;font-weight:bold;letter-spacing:.12em;margin-bottom:8px}.field input,.field select{width:100%;background:#091d30;color:var(--cream);border:1px solid #4b6680;padding:13px;font:16px Arial}.options{margin:20px 0}.options label{display:flex;gap:10px;align-items:center;margin:8px 0}.buttons{display:flex;gap:12px;flex-wrap:wrap}button{padding:13px 18px;background:var(--yellow);color:#071727;border:0;font:bold 14px Arial;letter-spacing:.06em;cursor:pointer}button.secondary{background:transparent;color:var(--cream);border:1px solid #668098}button:disabled{opacity:.5;cursor:not-allowed}.notice{display:none;padding:18px;margin-top:18px;border-left:4px solid var(--yellow);background:#0a1d2e;white-space:pre-wrap;line-height:1.45}.notice.error{border-color:#e6571a}.notice.ok{border-color:#6fce80}.fine{margin-top:20px;color:var(--muted);font-size:13px;line-height:1.45}a{color:var(--yellow)}@media(max-width:700px){.shell{padding:34px 16px}.steps,.fields{grid-template-columns:1fr}.step{border-right:0;border-bottom:1px solid var(--line)}.step:last-child{border:0}.card{padding:21px}}</style></head><body><main class="shell"><p class="eyebrow">THE INCH PARK VAULT</p><h1 class="title">VAULT UPDATER</h1><p class="intro">Prepare the club’s latest exports, check them locally, then run the existing GitHub refresh with a clear review step before publishing.</p><section class="steps"><div class="step"><b>01 · Check</b>Choose the three exports and validate their season rows.</div><div class="step"><b>02 · Review</b>Stage the package and run a non-publishing GitHub refresh.</div><div class="step"><b>03 · Publish</b>After reviewing the report, explicitly apply the refresh.</div></section><section class="card"><h2>Prepare an update</h2><p>Use the cumulative batting and bowling XML exports plus the latest all-time averages workbook.</p><form id="upload"><div class="fields"><div class="field"><label>SEASON</label><input name="season" inputmode="numeric" pattern="20[0-9]{2}" value="2026" required></div><div class="field"><label>BATTING.XML</label><input name="batting" type="file" accept=".xml" required></div><div class="field"><label>BOWLING.XML</label><input name="bowling" type="file" accept=".xml" required></div><div class="field"><label>AVERAGES.XLSX</label><input name="averages" type="file" accept=".xlsx" required></div></div><div class="options"><label><input name="scrape" type="checkbox" checked> Discover and refresh this season’s public scorecards</label></div><div class="buttons"><button>CHECK AND STAGE UPDATE</button></div></form><div id="stageNotice" class="notice"></div><p class="fine">Staging adds only the three source files to this local Vault copy and commits them to GitHub. It does not alter the live statistics.</p></section><section class="card"><h2>Run the reviewed refresh</h2><p>Select a staged package after checking the GitHub Actions review report. This is the step that updates and deploys the live Vault.</p><div class="fields"><div class="field"><label>STAGED PACKAGE</label><select id="package"></select></div><div class="field"><label>SEASON</label><input id="applySeason" inputmode="numeric" value="2026"></div></div><div class="options"><label><input id="applyScrape" type="checkbox" checked> Refresh public scorecards</label><label><input id="confirm" type="checkbox"> I have reviewed the non-publishing refresh report.</label></div><div class="buttons"><button id="publish" disabled>APPLY AND DEPLOY</button><a href="https://github.com/DJKSaunders/inch-park-vault/actions/workflows/refresh-vault-data.yml" target="_blank"><button type="button" class="secondary">OPEN GITHUB REPORTS</button></a></div><div id="applyNotice" class="notice"></div></section></main><script>const stageNotice=document.querySelector('#stageNotice'),applyNotice=document.querySelector('#applyNotice'),pkg=document.querySelector('#package'),confirmBox=document.querySelector('#confirm'),publish=document.querySelector('#publish');function notice(el,message,error=false){el.textContent=message;el.className='notice '+(error?'error':'ok');el.style.display='block'}async function api(url,opts){const r=await fetch(url,opts);const d=await r.json();if(!r.ok)throw new Error(d.error||'Something went wrong');return d}async function packages(){try{const d=await api('/api/packages');pkg.innerHTML=d.packages.length?d.packages.map(p=>`<option value="${p.directory}">${p.label}</option>`).join(''):'<option>No staged packages yet</option>'}catch(e){notice(applyNotice,e.message,true)}}document.querySelector('#upload').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;notice(stageNotice,'Checking files and staging the update…');try{const d=await api('/api/stage',{method:'POST',body:new FormData(e.target)});notice(stageNotice,`Valid: ${d.validation.battingRows} batting rows and ${d.validation.bowlingRows} bowling rows for ${d.validation.season}.\n\nA non-publishing GitHub refresh has started. Review it here:\n${d.workflowUrl}\n\nWhen it passes, use the section below to apply the live update.`);document.querySelector('#applySeason').value=d.validation.season;await packages()}catch(err){notice(stageNotice,err.message,true)}finally{b.disabled=false}});confirmBox.addEventListener('change',()=>publish.disabled=!confirmBox.checked);publish.addEventListener('click',async()=>{if(!confirm('This starts the publishing refresh and will deploy its validated data to the live Vault. Continue?'))return;publish.disabled=true;notice(applyNotice,'Starting the publishing refresh…');try{const d=await api('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({directory:pkg.value,season:document.querySelector('#applySeason').value,scrape:document.querySelector('#applyScrape').checked})});notice(applyNotice,`Publishing refresh started. Follow its progress here:\n${d.workflowUrl}`)}catch(err){notice(applyNotice,err.message,true);publish.disabled=false}});packages();</script></body></html>'''


# Scorecard refresh is compulsory. A partial refresh would make player records
# disagree with scorecards, insights, milestones and cap data.
PAGE = PAGE.replace(
    '<input name="scrape" type="checkbox" checked> Discover and refresh this season’s public scorecards',
    '<input name="scrape" type="checkbox" checked disabled> Scorecard refresh is required for a complete update',
).replace(
    '<input id="applyScrape" type="checkbox" checked> Refresh public scorecards',
    '<input id="applyScrape" type="checkbox" checked disabled> Scorecard refresh is required for a complete update',
)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def respond(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/":
            encoded = PAGE.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        elif self.path == "/api/packages":
            self.respond(HTTPStatus.OK, {"packages": staged_updates()})
        else:
            self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            if self.path == "/api/stage":
                form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers["Content-Type"]})
                season = safe_season(str(form.getfirst("season", "")))
                directory = next_directory()
                write_uploads(form, directory)
                report = validate(directory, season)
                commit_package(directory, season)
                trigger_workflow(str(directory.relative_to(ROOT)), season, True, False)
                self.respond(HTTPStatus.OK, {"validation": report, "workflowUrl": WORKFLOW_URL})
            elif self.path == "/api/apply":
                request = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or "{}")
                season = safe_season(str(request.get("season", "")))
                directory = Path(str(request.get("directory", "")))
                if not str(directory).startswith("data/updates/"):
                    raise ValueError("Choose a valid staged update package.")
                full_directory = (ROOT / directory).resolve()
                if UPDATES.resolve() not in full_directory.parents:
                    raise ValueError("Choose a valid staged update package.")
                validate(full_directory, season)
                trigger_workflow(str(directory), season, True, True)
                self.respond(HTTPStatus.OK, {"workflowUrl": WORKFLOW_URL})
            else:
                self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except Exception as error:
            self.respond(HTTPStatus.BAD_REQUEST, {"error": str(error)})


def main() -> None:
    os.chdir(ROOT)
    # Let macOS choose a free local port: other Vault previews may already be
    # using a conventional development port.
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print(f"Vault Updater is running at {url}\nPress Ctrl+C to stop it.")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nVault Updater stopped.")


if __name__ == "__main__":
    main()
