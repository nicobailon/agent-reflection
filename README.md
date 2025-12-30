# Agent Reflection

Daily self-improvement pipeline for coding agents. Analyzes sessions via [CASS](https://github.com/Dicklesworthstone/coding_agent_session_search) to extract patterns, anti-patterns, and wins. Also generates daily work logs for content creation.

## Quick Start

```bash
# Dry run (no LLM calls)
uv run main.py --dry-run --verbose

# Full run
uv run main.py

# With custom config
uv run main.py --config /path/to/config.toml
```

## Setup

### 1. Install Dependencies

Uses [uv](https://github.com/astral-sh/uv) with inline script metadata (PEP 723). No venv needed.

```bash
# Install uv if not present
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Install CASS

Build and install [cass](https://github.com/Dicklesworthstone/coding_agent_session_search):

```bash
cd /path/to/coding_agent_session_search
cargo build --release
cp target/release/cass ~/.local/bin/
```

### 3. Configure

Create config at `~/.config/cass/daily-report.toml`:

```toml
[general]
output_dir = "~/Documents/docs/cass-reports"
trend_window = 7
cass_path = "/path/to/cass"  # if not in PATH

[queries]
max_parallel = 3
scope = "since_last_run"  # or "last_24h", "last_7d"
agents = []               # filter by agent, empty = all
workspace_include = []    # filter by workspace
workspace_exclude = []    # exclude workspaces

[llm]
method = "pi"             # LLM command to use
prompt_template = "~/.config/cass/daily-report-prompt.md"
max_retries = 3
retry_backoff_seconds = [5, 15, 45]

[sources]
extra_dirs = ["~/Documents/docs"]  # additional dirs to scan
extra_patterns = ["*.md", "*.txt"] # file patterns to include

[worklog]
enabled = true            # generate daily work log

[sync]
sync_enabled = true       # sync remote sources before analysis
sync_sources = []         # specific sources, empty = all

[notifications]
email_enabled = false
email_provider = "sendgrid"
email_to = ""
email_from = ""

# Custom categories (optional)
# [[custom_categories]]
# name = "type_safety"
# display = "Type Safety"
# queries = ["any type", "as any", "@ts-ignore"]
# description = "TypeScript type safety violations"
```

### 4. Schedule (macOS)

```bash
# Copy launchd plist
cp com.agent-reflection.daily.plist ~/Library/LaunchAgents/

# Load
launchctl load ~/Library/LaunchAgents/com.agent-reflection.daily.plist

# Test immediate run
launchctl start com.agent-reflection.daily
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Run queries but skip LLM and email |
| `--verbose` | Detailed logging output |
| `--config PATH` | Custom config file path |
| `--output-dir PATH` | Override output directory |
| `--force-index` | Force cass reindex before analysis |

## Output

Reports are written to `~/Documents/docs/cass-reports/`:

- `daily-report-YYYY-MM-DD.json` - Machine-readable report
- `daily-report-YYYY-MM-DD.md` - Human-readable report (includes succinct work log)
- `daily-worklog-YYYY-MM-DD.md` - Full daily work log (for blogging/export)
- `.last-run` - Timestamp of last successful run

## Categories Analyzed

| Category | Description |
|----------|-------------|
| **Testing Gaps** | Agents claiming to test without actually running tests |
| **Unused Artifacts** | Screenshots or files created but never analyzed |
| **Debug Pollution** | Debug logging left in production code |
| **State Management** | Missing state update notifications after mutations |
| **Naming Inconsistencies** | Key name mismatches and identifier typos |
| **Process Skips** | Verification steps bypassed before commits |
| **Error Handling** | Missing or inadequate error handling |
| **TODO Accumulation** | Technical debt markers not addressed |

Custom categories can be added via config using `[[custom_categories]]` sections.

## Daily Work Log

The work log captures:

- **Projects touched** - Extracted from workspace paths
- **Files created/modified** - Parsed from session tool calls
- **Time estimates** - Calculated from session timestamps
- **Docs created/modified** - From extra directories

Two versions are generated:
1. **Succinct** - Embedded in main report for quick reference
2. **Full** - Separate file for blogging/content creation

## License

MIT
