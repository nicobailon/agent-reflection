# Agent Reflection

Personal knowledge system with semantic search. Aggregates and indexes content from Twitter bookmarks/likes, GitHub starred repos, YouTube saved videos, and coding sessions.

## Features

- **Semantic Search** - Find content by meaning using embeddings (text-embedding-3-small)
- **Full-Text Search** - Fast keyword search via SQLite FTS5
- **Multiple Sources** - Twitter, GitHub stars, YouTube, coding sessions
- **CLI Tools** - Query your knowledge base from the terminal
- **REST API** - Programmatic access for integrations

## Quick Start

```bash
# Install dependencies
cd ingestion && npm install

# Set up environment
export OPENAI_API_KEY="..."  # or OPENROUTER_API_KEY

# Run API server
cd api && npm run dev
```

## CLI Tools

### Twitter (`tweets`)
```bash
tweets search "machine learning"     # Full-text search
tweets semantic "AI safety"          # Semantic search  
tweets stats                         # Collection stats
```

### GitHub Stars (`stars`)
```bash
stars search "react state"           # Full-text search
stars semantic "database orm"        # Semantic search
stars stats                          # Collection stats
stars topics                         # Browse by topic
```

### YouTube Saved Videos (`videos`)
```bash
videos search "karpathy"             # Full-text search
videos semantic "transformers"       # Semantic search
videos ask "explain attention"       # Semantic search → Gemini analysis
videos stats                         # Collection stats
```

The `videos ask` command finds matching videos via semantic search, then queries them using `surf gemini --youtube`.

## API Endpoints

```
GET  /api/tweets              # List bookmarked tweets
POST /api/tweets/semantic     # Semantic search tweets
GET  /api/tweets/search       # Full-text search tweets

GET  /api/stars               # List starred repos
POST /api/stars/semantic      # Semantic search repos
GET  /api/stars/search        # Full-text search repos

GET  /api/videos              # List saved videos
POST /api/videos/semantic     # Semantic search videos
GET  /api/videos/search       # Full-text search videos

GET  /api/stats               # Global statistics
```

## Data Sources

| Source | Description | Sync |
|--------|-------------|------|
| Twitter Bookmarks | Saved tweets via bookmark-sync | Daily |
| Twitter Likes | Liked tweets via likes-sync | Daily |
| GitHub Stars | Starred repos + READMEs | Daily |
| YouTube Liked | Liked videos via youtube-sync | Daily |
| YouTube Watch Later | Watch Later playlist | Daily |

## Project Structure

```
agent-reflection/
├── api/                      # Hono REST API server
│   └── src/server.ts
├── ingestion/
│   └── scripts/
│       ├── cli/              # CLI tools (tweets, stars, videos)
│       ├── lib/              # Shared utilities (embeddings, db)
│       ├── twitter-ingest-sqlite.ts
│       ├── github-stars-sync.ts
│       ├── github-stars-embed.ts
│       └── youtube-ingest-sqlite.ts
├── main.py                   # CASS session ingestion
└── data/                     # SQLite databases (gitignored)
```

## Configuration

```bash
# API endpoint (for CLI tools calling from other machines)
export AGENT_REFLECTION_API="http://localhost:3001"

# Embedding provider (one required)
export OPENAI_API_KEY="..."
export OPENROUTER_API_KEY="..."  # Alternative
```

## Development

```bash
# Start API server
cd api && npm run dev

# Run ingestion scripts
cd ingestion
npm run twitter           # Ingest Twitter bookmarks/likes
npm run stars:sync        # Sync GitHub stars
npm run stars:embed       # Generate embeddings for stars
npm run videos            # See saved-videos CLI
```

## License

MIT
