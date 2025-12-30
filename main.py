#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "tomli",
#     "httpx",
#     "rich",
# ]
# ///
"""
Agent Reflection - Daily Self-Improvement Pipeline

Analyzes coding agent sessions via CASS to extract patterns, anti-patterns,
and wins for continuous improvement.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import tomli
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()

DEFAULT_CONFIG_PATH = Path.home() / ".config" / "cass" / "daily-report.toml"
DEFAULT_OUTPUT_DIR = Path.home() / "Documents" / "docs" / "cass-reports"
DEFAULT_PROMPT_PATH = Path.home() / ".config" / "cass" / "daily-report-prompt.md"
DEFAULT_CASS_PATH = "cass"

PREDEFINED_CATEGORIES = [
    {
        "name": "testing_gaps",
        "display": "Testing Gaps",
        "queries": ["claim to test", "should work", "looks correct", "assuming it works"],
        "description": "Agents claiming to test without actually running tests",
    },
    {
        "name": "unused_artifacts",
        "display": "Unused Artifacts",
        "queries": ["screenshot", "captured", "saved image"],
        "description": "Screenshots or files created but never analyzed",
    },
    {
        "name": "debug_pollution",
        "display": "Debug Pollution",
        "queries": ["console.log", "println!", "dbg!", "print(", "debugger"],
        "description": "Debug logging left in production code",
    },
    {
        "name": "state_management",
        "display": "State Management",
        "queries": ["notify", "setState", "signal", "emit"],
        "description": "Missing state update notifications after mutations",
    },
    {
        "name": "naming_inconsistencies",
        "display": "Naming Inconsistencies",
        "queries": ["wrong key", "typo", "mismatch", "incorrect name"],
        "description": "Key name mismatches and identifier typos",
    },
    {
        "name": "process_skips",
        "display": "Process Skips",
        "queries": ["skip verification", "without checking", "bypass", "skip test"],
        "description": "Verification steps bypassed before commits",
    },
    {
        "name": "error_handling",
        "display": "Error Handling",
        "queries": ["uncaught", "unhandled", "missing try", "bare unwrap", "panic"],
        "description": "Missing or inadequate error handling",
    },
    {
        "name": "todo_accumulation",
        "display": "TODO Accumulation",
        "queries": ["TODO", "FIXME", "HACK", "XXX"],
        "description": "Technical debt markers not addressed",
    },
]

DEFAULT_PROMPT_TEMPLATE = """You are analyzing coding agent session data from CASS (Coding Agent Session Search).

## Task
Analyze the following session data for:
1. **Anti-patterns**: Issues, mistakes, or bad practices
2. **Wins**: Good practices, successful patterns, improvements

## Category Being Analyzed
{category_name}: {category_description}

## Session Data (JSON)
{cass_results}

## Output Format
Respond with ONLY valid JSON (no markdown, no explanation):
{{
  "anti_patterns": [
    {{
      "description": "Brief description of the issue",
      "severity": "high|medium|low",
      "occurrences": 3,
      "example_sessions": ["path/to/session.jsonl:42"],
      "recommendation": "How to improve"
    }}
  ],
  "wins": [
    {{
      "description": "Brief description of good practice",
      "occurrences": 5,
      "example_sessions": ["path/to/session.jsonl:100"]
    }}
  ],
  "summary": "One sentence summary of findings for this category"
}}
"""


@dataclass
class Config:
    output_dir: Path = DEFAULT_OUTPUT_DIR
    trend_window: int = 7
    log_level: str = "info"
    max_parallel: int = 3
    cass_path: str = DEFAULT_CASS_PATH
    scope: str = "since_last_run"
    agents: list[str] = field(default_factory=list)
    workspace_include: list[str] = field(default_factory=list)
    workspace_exclude: list[str] = field(default_factory=list)
    llm_method: str = "pi"
    prompt_template_path: Path = DEFAULT_PROMPT_PATH
    max_retries: int = 3
    retry_backoff: list[int] = field(default_factory=lambda: [5, 15, 45])
    email_enabled: bool = False
    email_provider: str = "sendgrid"
    email_to: str = ""
    email_from: str = ""
    sync_enabled: bool = True
    sync_sources: list[str] = field(default_factory=list)
    custom_categories: list[dict] = field(default_factory=list)

    @classmethod
    def from_toml(cls, path: Path) -> "Config":
        if not path.exists():
            return cls()
        
        with open(path, "rb") as f:
            data = tomli.load(f)
        
        config = cls()
        
        if "general" in data:
            g = data["general"]
            if "output_dir" in g:
                config.output_dir = Path(g["output_dir"]).expanduser()
            if "trend_window" in g:
                config.trend_window = g["trend_window"]
            if "log_level" in g:
                config.log_level = g["log_level"]
            if "cass_path" in g:
                config.cass_path = g["cass_path"]
        
        if "queries" in data:
            q = data["queries"]
            if "max_parallel" in q:
                config.max_parallel = q["max_parallel"]
            if "scope" in q:
                config.scope = q["scope"]
            if "agents" in q:
                config.agents = q["agents"]
            if "workspace_include" in q:
                config.workspace_include = q["workspace_include"]
            if "workspace_exclude" in q:
                config.workspace_exclude = q["workspace_exclude"]
        
        if "llm" in data:
            llm = data["llm"]
            if "method" in llm:
                config.llm_method = llm["method"]
            if "prompt_template" in llm:
                config.prompt_template_path = Path(llm["prompt_template"]).expanduser()
            if "max_retries" in llm:
                config.max_retries = llm["max_retries"]
            if "retry_backoff_seconds" in llm:
                config.retry_backoff = llm["retry_backoff_seconds"]
        
        if "notifications" in data:
            n = data["notifications"]
            if "email_enabled" in n:
                config.email_enabled = n["email_enabled"]
            if "email_provider" in n:
                config.email_provider = n["email_provider"]
            if "email_to" in n:
                config.email_to = n["email_to"]
            if "email_from" in n:
                config.email_from = n["email_from"]
        
        if "sync" in data:
            s = data["sync"]
            if "sync_enabled" in s:
                config.sync_enabled = s["sync_enabled"]
            if "sync_sources" in s:
                config.sync_sources = s["sync_sources"]
        
        if "custom_categories" in data:
            config.custom_categories = data["custom_categories"]
        
        return config


@dataclass
class CategoryResult:
    name: str
    display: str
    description: str
    cass_hits: list[dict]
    anti_patterns: list[dict] = field(default_factory=list)
    wins: list[dict] = field(default_factory=list)
    summary: str = ""
    error: str | None = None


def run_command(cmd: list[str], input_text: str | None = None) -> tuple[int, str, str]:
    result = subprocess.run(
        cmd,
        input=input_text,
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout, result.stderr


def get_last_run_timestamp(output_dir: Path) -> datetime | None:
    last_run_file = output_dir / ".last-run"
    if not last_run_file.exists():
        return None
    try:
        ts = last_run_file.read_text().strip()
        return datetime.fromisoformat(ts)
    except (ValueError, OSError):
        return None


def set_last_run_timestamp(output_dir: Path, ts: datetime) -> None:
    last_run_file = output_dir / ".last-run"
    last_run_file.write_text(ts.isoformat())


def check_cass_health(cass_path: str = "cass") -> tuple[bool, dict]:
    code, stdout, _ = run_command([cass_path, "health", "--json"])
    if code != 0:
        return False, {}
    try:
        data = json.loads(stdout)
        return data.get("healthy", False), data
    except json.JSONDecodeError:
        return False, {}


def sync_remote_sources(sources: list[str], cass_path: str = "cass") -> bool:
    if not sources:
        code, _, _ = run_command([cass_path, "sources", "sync", "--json"])
        return code == 0
    else:
        for source in sources:
            code, _, _ = run_command([cass_path, "sources", "sync", "--source", source, "--json"])
            if code != 0:
                return False
        return True


def run_cass_index(cass_path: str = "cass") -> bool:
    code, _, _ = run_command([cass_path, "index", "--json"])
    return code == 0


def build_cass_query(
    query: str,
    since: datetime | None,
    agents: list[str],
    workspace_include: list[str],
    cass_path: str = "cass",
    limit: int = 50,
) -> list[str]:
    cmd = [cass_path, "search", query, "--robot", "--limit", str(limit)]
    
    if since:
        cmd.extend(["--since", since.strftime("%Y-%m-%dT%H:%M:%S")])
    
    for agent in agents:
        cmd.extend(["--agent", agent])
    
    for ws in workspace_include:
        cmd.extend(["--workspace", ws])
    
    return cmd


def search_category(
    category: dict,
    since: datetime | None,
    config: Config,
) -> CategoryResult:
    name = category["name"]
    display = category.get("display", name)
    description = category.get("description", "")
    queries = category.get("queries", [])
    
    all_hits = []
    seen_paths = set()
    
    for query in queries:
        cmd = build_cass_query(
            query,
            since,
            config.agents,
            config.workspace_include,
            config.cass_path,
        )
        code, stdout, _ = run_command(cmd)
        
        if code == 0 and stdout.strip():
            try:
                data = json.loads(stdout)
                for hit in data.get("hits", []):
                    workspace = hit.get("workspace", "")
                    if config.workspace_exclude and any(excl in workspace for excl in config.workspace_exclude):
                        continue
                    path_key = f"{hit.get('source_path')}:{hit.get('line_number', 0)}"
                    if path_key not in seen_paths:
                        seen_paths.add(path_key)
                        all_hits.append(hit)
            except json.JSONDecodeError:
                pass
    
    return CategoryResult(
        name=name,
        display=display,
        description=description,
        cass_hits=all_hits,
    )


def analyze_with_llm(
    result: CategoryResult,
    prompt_template: str,
    config: Config,
    dry_run: bool = False,
) -> CategoryResult:
    if not result.cass_hits:
        result.summary = "No sessions found for this category"
        return result
    
    if dry_run:
        result.summary = f"[DRY RUN] Would analyze {len(result.cass_hits)} hits"
        result.anti_patterns = [{"description": "[DRY RUN] Skipped", "severity": "low", "occurrences": 0}]
        return result
    
    prompt = prompt_template.format(
        category_name=result.display,
        category_description=result.description,
        cass_results=json.dumps(result.cass_hits, indent=2),
    )
    
    llm_cmd = [config.llm_method, "-p", prompt]
    
    for attempt in range(config.max_retries):
        code, stdout, stderr = run_command(llm_cmd)
        
        if code == 0 and stdout.strip():
            try:
                response_text = stdout.strip()
                fence_match = re.match(r'^```(?:json)?\s*\n(.*?)\n```\s*$', response_text, re.DOTALL)
                if fence_match:
                    response_text = fence_match.group(1)
                
                data = json.loads(response_text)
                result.anti_patterns = data.get("anti_patterns", [])
                result.wins = data.get("wins", [])
                result.summary = data.get("summary", "")
                return result
            except json.JSONDecodeError as e:
                result.error = f"JSON parse error: {e}"
        else:
            result.error = f"{config.llm_method} command failed: {stderr}"
        
        if attempt < config.max_retries - 1 and config.retry_backoff:
            backoff = config.retry_backoff[min(attempt, len(config.retry_backoff) - 1)]
            time.sleep(backoff)
    
    if not result.error:
        result.error = "Max retries exceeded"
    result.summary = f"Analysis failed: {result.error}"
    return result


def load_historical_data(output_dir: Path, days: int) -> list[dict]:
    reports = []
    today = datetime.now().date()
    
    for i in range(1, days + 1):
        date = today - timedelta(days=i)
        json_file = output_dir / f"daily-report-{date.isoformat()}.json"
        if json_file.exists():
            try:
                with open(json_file) as f:
                    reports.append(json.load(f))
            except (json.JSONDecodeError, OSError):
                pass
    
    return reports


def calculate_trends(
    current_results: dict[str, CategoryResult],
    historical: list[dict],
) -> dict[str, dict]:
    trends = {}
    
    for name, result in current_results.items():
        current_count = len(result.anti_patterns)
        
        historical_counts = []
        for report in historical:
            if "categories" in report and name in report["categories"]:
                cat_data = report["categories"][name]
                historical_counts.append(len(cat_data.get("anti_patterns", [])))
        
        if historical_counts:
            avg = sum(historical_counts) / len(historical_counts)
            delta = current_count - avg
        else:
            avg = 0
            delta = 0
        
        trends[name] = {
            "current": current_count,
            "seven_day_avg": round(avg, 1),
            "delta": round(delta, 1),
        }
    
    return trends


def generate_markdown_report(
    results: dict[str, CategoryResult],
    trends: dict[str, dict],
    metadata: dict,
) -> str:
    date_str = metadata["date"]
    total_sessions = metadata["total_sessions"]
    
    total_anti = sum(len(r.anti_patterns) for r in results.values())
    total_wins = sum(len(r.wins) for r in results.values())
    
    top_issue = max(results.items(), key=lambda x: len(x[1].anti_patterns), default=(None, None))
    top_issue_name = top_issue[0] if top_issue[0] else "None"
    
    lines = [
        f"# Agent Reflection Report - {date_str}",
        "",
        "> Daily analysis of coding agent sessions for patterns and improvements",
        "",
        "## Executive Summary",
        "",
        f"- **{total_anti} anti-patterns** detected across {total_sessions} sessions",
        f"- **{total_wins} wins** identified showing good practices",
    ]
    
    if top_issue_name != "None" and top_issue[1]:
        trend = trends.get(top_issue_name, {})
        delta = trend.get("delta", 0)
        delta_str = f"+{delta}" if delta > 0 else ("0" if delta == 0 else str(delta))
        lines.append(f"- **{results[top_issue_name].display}** is the most common issue ({delta_str} vs 7-day avg)")
    
    lines.extend(["", "## Anti-Patterns by Category", ""])
    
    for name, result in results.items():
        if not result.anti_patterns:
            continue
        
        trend = trends.get(name, {})
        delta = trend.get("delta", 0)
        delta_str = f"+{delta}" if delta > 0 else ("0" if delta == 0 else str(delta))
        
        lines.append(f"### {result.display} ({len(result.anti_patterns)} occurrences, {delta_str} vs avg)")
        lines.append("")
        
        for ap in result.anti_patterns[:5]:
            severity = ap.get("severity", "medium")
            desc = ap.get("description", "No description")
            lines.append(f"- **[{severity.upper()}]** {desc}")
            
            for session in ap.get("example_sessions", [])[:2]:
                lines.append(f"  - `{session}`")
            
            if ap.get("recommendation"):
                lines.append(f"  - *Recommendation*: {ap['recommendation']}")
        
        lines.append("")
    
    lines.extend(["## Wins", ""])
    
    for name, result in results.items():
        if not result.wins:
            continue
        
        lines.append(f"### {result.display}")
        lines.append("")
        
        for win in result.wins[:3]:
            desc = win.get("description", "No description")
            lines.append(f"- {desc}")
            for session in win.get("example_sessions", [])[:2]:
                lines.append(f"  - `{session}`")
        
        lines.append("")
    
    lines.extend(["## Trends (7-Day Rolling)", "", "| Category | Today | 7-Day Avg | Delta |", "|----------|-------|-----------|-------|"])
    
    for name, result in results.items():
        trend = trends.get(name, {})
        current = trend.get("current", 0)
        avg = trend.get("seven_day_avg", 0)
        delta = trend.get("delta", 0)
        delta_str = f"+{delta}" if delta > 0 else ("0" if delta == 0 else str(delta))
        lines.append(f"| {result.display} | {current} | {avg} | {delta_str} |")
    
    lines.extend([
        "",
        "## Raw Data",
        "",
        f"- **Sessions analyzed**: {total_sessions}",
        f"- **Time range**: {metadata.get('since', 'N/A')} to {metadata.get('until', 'N/A')}",
        f"- **Categories analyzed**: {len(results)}",
    ])
    
    lines.extend(["", "## Session Links", "", "All sessions with findings (VS Code clickable):", ""])
    
    for name, result in results.items():
        for ap in result.anti_patterns:
            for session in ap.get("example_sessions", []):
                lines.append(f"- `{session}` - {result.display}")
    
    return "\n".join(lines)


def generate_json_report(
    results: dict[str, CategoryResult],
    trends: dict[str, dict],
    metadata: dict,
) -> dict:
    categories = {}
    session_links = []
    
    for name, result in results.items():
        categories[name] = {
            "display": result.display,
            "description": result.description,
            "anti_patterns": result.anti_patterns,
            "wins": result.wins,
            "summary": result.summary,
            "count": len(result.anti_patterns),
            "seven_day_avg": trends.get(name, {}).get("seven_day_avg", 0),
            "delta": trends.get(name, {}).get("delta", 0),
        }
        
        for ap in result.anti_patterns:
            for session in ap.get("example_sessions", []):
                if ":" in session:
                    path, line = session.rsplit(":", 1)
                    try:
                        line_num = int(line)
                    except ValueError:
                        line_num = 0
                        path = session
                    session_links.append({"path": path, "line": line_num, "category": name})
                else:
                    session_links.append({"path": session, "line": 0, "category": name})
    
    return {
        "date": metadata["date"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "time_range": {
            "since": metadata.get("since"),
            "until": metadata.get("until"),
        },
        "summary": {
            "total_sessions": metadata["total_sessions"],
            "anti_pattern_count": sum(len(r.anti_patterns) for r in results.values()),
            "win_count": sum(len(r.wins) for r in results.values()),
        },
        "categories": categories,
        "session_links": session_links,
        "trends": trends,
    }


def send_failure_email(error: str, config: Config) -> bool:
    if not config.email_enabled or not config.email_to or not config.email_from:
        return False
    
    api_key = os.environ.get("SENDGRID_API_KEY")
    if not api_key:
        console.print("[yellow]Warning: SENDGRID_API_KEY not set, skipping email[/yellow]")
        return False
    
    try:
        with httpx.Client() as client:
            response = client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "personalizations": [{"to": [{"email": config.email_to}]}],
                    "from": {"email": config.email_from},
                    "subject": f"Agent Reflection Failed - {datetime.now().date().isoformat()}",
                    "content": [{"type": "text/plain", "value": f"Daily report failed:\n\n{error}"}],
                },
            )
            return response.status_code == 202
    except Exception as e:
        console.print(f"[red]Email send failed: {e}[/red]")
        return False


def run_pipeline(args: argparse.Namespace) -> int:
    config = Config.from_toml(Path(args.config).expanduser())
    
    if args.output_dir:
        config.output_dir = Path(args.output_dir).expanduser()
    
    config.output_dir.mkdir(parents=True, exist_ok=True)
    
    verbose = args.verbose
    dry_run = args.dry_run
    
    if verbose:
        console.print(f"[dim]Config loaded from {args.config}[/dim]")
        console.print(f"[dim]Output directory: {config.output_dir}[/dim]")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        
        if config.sync_enabled and not dry_run:
            task = progress.add_task("Syncing remote sources...", total=None)
            if not sync_remote_sources(config.sync_sources, config.cass_path):
                console.print("[yellow]Warning: Source sync failed, continuing with local data[/yellow]")
            progress.remove_task(task)
        
        if args.force_index and not dry_run:
            task = progress.add_task("Force rebuilding index...", total=None)
            if not run_cass_index(config.cass_path):
                error = "Failed to rebuild cass index"
                console.print(f"[red]{error}[/red]")
                send_failure_email(error, config)
                return 1
            progress.remove_task(task)
        else:
            task = progress.add_task("Checking index health...", total=None)
            healthy, _ = check_cass_health(config.cass_path)
            progress.remove_task(task)
            
            if not healthy and not dry_run:
                task = progress.add_task("Rebuilding index...", total=None)
                if not run_cass_index(config.cass_path):
                    error = "Failed to rebuild cass index"
                    console.print(f"[red]{error}[/red]")
                    send_failure_email(error, config)
                    return 1
                progress.remove_task(task)
        
        last_run = get_last_run_timestamp(config.output_dir)
        now = datetime.now(timezone.utc)
        
        if config.scope == "since_last_run" and last_run:
            since = last_run
        elif config.scope == "last_24h" or last_run is None:
            since = now - timedelta(hours=24)
        elif config.scope == "last_7d":
            since = now - timedelta(days=7)
        else:
            since = now - timedelta(hours=24)
        
        if verbose:
            console.print(f"[dim]Analyzing sessions since: {since.isoformat()}[/dim]")
        
        all_categories = PREDEFINED_CATEGORIES + config.custom_categories
        category_order = [cat["name"] for cat in all_categories]
        
        task = progress.add_task(f"Searching {len(all_categories)} categories...", total=len(all_categories))
        
        unordered_results: dict[str, CategoryResult] = {}
        total_sessions = 0
        
        with ThreadPoolExecutor(max_workers=config.max_parallel) as executor:
            futures = {
                executor.submit(search_category, cat, since, config): cat["name"]
                for cat in all_categories
            }
            
            for future in as_completed(futures):
                name = futures[future]
                try:
                    result = future.result()
                    unordered_results[name] = result
                    total_sessions += len(result.cass_hits)
                except Exception as e:
                    unordered_results[name] = CategoryResult(
                        name=name,
                        display=name,
                        description="",
                        cass_hits=[],
                        error=str(e),
                    )
                progress.advance(task)
        
        results: dict[str, CategoryResult] = {
            name: unordered_results[name] 
            for name in category_order 
            if name in unordered_results
        }
        
        progress.remove_task(task)
        
        if verbose:
            console.print(f"[dim]Found {total_sessions} total session hits[/dim]")
        
        prompt_template = DEFAULT_PROMPT_TEMPLATE
        if config.prompt_template_path.exists():
            prompt_template = config.prompt_template_path.read_text()
        
        task = progress.add_task("Analyzing with LLM...", total=len(results))
        
        for name, result in results.items():
            if verbose:
                console.print(f"[dim]Analyzing {result.display}...[/dim]")
            
            results[name] = analyze_with_llm(result, prompt_template, config, dry_run)
            progress.advance(task)
        
        progress.remove_task(task)
        
        task = progress.add_task("Calculating trends...", total=None)
        historical = load_historical_data(config.output_dir, config.trend_window)
        trends = calculate_trends(results, historical)
        progress.remove_task(task)
        
        today = datetime.now().date().isoformat()
        metadata = {
            "date": today,
            "total_sessions": total_sessions,
            "since": since.isoformat(),
            "until": now.isoformat(),
        }
        
        task = progress.add_task("Generating reports...", total=None)
        
        json_report = generate_json_report(results, trends, metadata)
        md_report = generate_markdown_report(results, trends, metadata)
        
        json_path = config.output_dir / f"daily-report-{today}.json"
        md_path = config.output_dir / f"daily-report-{today}.md"
        
        with open(json_path, "w") as f:
            json.dump(json_report, f, indent=2)
        
        with open(md_path, "w") as f:
            f.write(md_report)
        
        progress.remove_task(task)
        
        if not dry_run:
            set_last_run_timestamp(config.output_dir, now)
    
    console.print(f"\n[green]Reports generated:[/green]")
    console.print(f"  JSON: {json_path}")
    console.print(f"  Markdown: {md_path}")
    
    total_anti = sum(len(r.anti_patterns) for r in results.values())
    total_wins = sum(len(r.wins) for r in results.values())
    console.print(f"\n[bold]Summary:[/bold] {total_anti} anti-patterns, {total_wins} wins across {total_sessions} sessions")
    
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Agent Reflection - Daily Self-Improvement Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help=f"Path to config file (default: {DEFAULT_CONFIG_PATH})",
    )
    parser.add_argument(
        "--output-dir",
        help="Override output directory from config",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run queries but skip LLM analysis and email",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--force-index",
        action="store_true",
        help="Force reindex before analysis",
    )
    
    args = parser.parse_args()
    
    try:
        return run_pipeline(args)
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted[/yellow]")
        return 130
    except Exception as e:
        console.print(f"[red]Fatal error: {e}[/red]")
        config = Config.from_toml(Path(args.config).expanduser())
        send_failure_email(str(e), config)
        return 1


if __name__ == "__main__":
    sys.exit(main())
