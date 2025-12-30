# Agent Reflection

Developer activity tracking and insight system. Aggregates data from coding agent sessions (CASS), GitHub, local documentation, and Twitter bookmarks into a real-time dashboard.

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up Convex**:
   ```bash
   npx convex init
   npx convex dev
   ```

3. **Configure environment**:
   ```bash
   # Copy your Convex URL from the dashboard
   export CONVEX_URL="https://your-deployment.convex.cloud"
   ```

4. **Run ingestion**:
   ```bash
   # CASS + Docs (Python)
   uv run main.py
   
   # GitHub
   npm run ingest:github
   
   # Twitter bookmarks
   npm run ingest:twitter
   ```

5. **Start dashboard**:
   ```bash
   npm run dev
   ```

## Project Structure

```
agent-reflection/
├── main.py               # CASS + Docs ingestion (Python)
├── convex/               # Convex backend
│   ├── schema.ts         # Database schema
│   ├── activities.ts     # Activity queries/mutations
│   ├── projects.ts       # Project management
│   └── ...
├── dashboard/            # Next.js dashboard
│   ├── src/app/          # Pages
│   └── src/components/   # React components
└── ingestion/            # TypeScript ingestion scripts
    └── scripts/
        ├── github-ingest.ts
        └── twitter-ingest.ts
```

## Data Sources

| Source | Format | Frequency | Script |
|--------|--------|-----------|--------|
| CASS Sessions | JSONL | Daily | `main.py` |
| GitHub Activity | REST API | Daily | `github-ingest.ts` |
| Documentation | Markdown files | Daily | `main.py` |
| Twitter Bookmarks | JSON export | Weekly | `twitter-ingest.ts` |

## Configuration

Config files are stored outside the repo:
- `~/.config/cass/daily-report.toml` - Main config
- `~/.config/cass/daily-report-prompt.md` - LLM prompt

## Development

```bash
# Start Convex dev server (terminal 1)
npx convex dev

# Start Next.js dev server (terminal 2)
npm run dev
```

## License

MIT
