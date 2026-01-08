CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  project TEXT,
  workspace TEXT,
  repo_full_name TEXT,
  is_public INTEGER DEFAULT 1,
  payload TEXT
);
CREATE INDEX idx_activities_date ON activities(date);
CREATE INDEX idx_activities_source ON activities(source, timestamp);
CREATE INDEX idx_activities_project ON activities(project, timestamp);
CREATE INDEX idx_activities_type ON activities(type, timestamp);
CREATE INDEX idx_activities_source_id ON activities(source_id);

CREATE TABLE day_activities (
  date TEXT PRIMARY KEY,
  level INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  commits INTEGER DEFAULT 0,
  issues_closed INTEGER DEFAULT 0,
  prs_merged INTEGER DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 0
);

CREATE TABLE analysis_results (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  category_display TEXT NOT NULL,
  anti_patterns TEXT,
  wins TEXT,
  summary TEXT,
  cass_hits INTEGER DEFAULT 0,
  doc_hits INTEGER DEFAULT 0,
  seven_day_avg REAL DEFAULT 0,
  delta REAL DEFAULT 0,
  UNIQUE(date, category)
);
CREATE INDEX idx_analysis_date ON analysis_results(date);
CREATE INDEX idx_analysis_category ON analysis_results(category, date);

CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  workspaces TEXT,
  repo_full_name TEXT,
  description TEXT,
  is_public INTEGER DEFAULT 1,
  is_archived INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  total_time_minutes INTEGER DEFAULT 0,
  first_activity INTEGER,
  last_activity INTEGER,
  anti_pattern_counts TEXT
);
CREATE INDEX idx_projects_repo ON projects(repo_full_name);

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  post_url TEXT UNIQUE NOT NULL,
  author_name TEXT,
  author_handle TEXT,
  tweet_text TEXT,
  timestamp INTEGER,
  interaction_bookmarks INTEGER DEFAULT 0,
  interaction_likes INTEGER DEFAULT 0,
  interaction_replies INTEGER DEFAULT 0,
  interaction_reposts INTEGER DEFAULT 0,
  interaction_views INTEGER DEFAULT 0,
  extracted_links TEXT,
  extracted_repos TEXT,
  topics TEXT,
  imported_at INTEGER,
  batch_file TEXT,
  source TEXT DEFAULT 'bookmark' CHECK(source IN ('bookmark', 'like', 'both'))
);
CREATE INDEX idx_bookmarks_timestamp ON bookmarks(timestamp);
CREATE INDEX idx_bookmarks_author ON bookmarks(author_handle, timestamp);
CREATE INDEX idx_bookmarks_post_url ON bookmarks(post_url);
CREATE INDEX idx_bookmarks_source ON bookmarks(source);

CREATE VIRTUAL TABLE bookmark_embeddings USING vec0(
  embedding float[1536] distance_metric=cosine
);

CREATE TABLE bookmark_embedding_map (
  bookmark_id TEXT PRIMARY KEY,
  vec_rowid INTEGER NOT NULL
);
CREATE INDEX idx_embedding_map_rowid ON bookmark_embedding_map(vec_rowid);

CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  tweet_text,
  author_handle,
  author_name,
  content='bookmarks',
  content_rowid='rowid'
);

CREATE TRIGGER bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, tweet_text, author_handle, author_name)
  VALUES (NEW.rowid, NEW.tweet_text, NEW.author_handle, NEW.author_name);
END;
CREATE TRIGGER bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, tweet_text, author_handle, author_name)
  VALUES ('delete', OLD.rowid, OLD.tweet_text, OLD.author_handle, OLD.author_name);
END;
CREATE TRIGGER bookmarks_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, tweet_text, author_handle, author_name)
  VALUES ('delete', OLD.rowid, OLD.tweet_text, OLD.author_handle, OLD.author_name);
  INSERT INTO bookmarks_fts(rowid, tweet_text, author_handle, author_name)
  VALUES (NEW.rowid, NEW.tweet_text, NEW.author_handle, NEW.author_name);
END;

CREATE TABLE blog_drafts (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  week_end TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'pending_review',
  created_at INTEGER,
  published_at INTEGER
);
CREATE INDEX idx_blog_drafts_status ON blog_drafts(status);

CREATE TABLE daily_summaries (
  date TEXT PRIMARY KEY,
  total_sessions INTEGER DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  total_issues_closed INTEGER DEFAULT 0,
  total_prs_merged INTEGER DEFAULT 0,
  docs_created INTEGER DEFAULT 0,
  docs_modified INTEGER DEFAULT 0,
  bookmarks_added INTEGER DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 0,
  anti_pattern_count INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  top_issue_category TEXT,
  projects TEXT,
  worklog_markdown TEXT,
  blog_draft TEXT,
  blog_draft_status TEXT
);

CREATE TABLE starred_repos (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  readme_content TEXT,
  readme_truncated INTEGER DEFAULT 0,
  primary_language TEXT,
  all_languages TEXT,
  topics TEXT,
  inferred_topics TEXT,
  license TEXT,
  stargazers_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  starred_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  pushed_at INTEGER,
  is_archived INTEGER DEFAULT 0,
  is_fork INTEGER DEFAULT 0,
  is_template INTEGER DEFAULT 0,
  has_readme INTEGER DEFAULT 1,
  imported_at INTEGER,
  last_synced_at INTEGER,
  readme_fetched_at INTEGER
);

CREATE INDEX idx_stars_full_name ON starred_repos(full_name);
CREATE INDEX idx_stars_owner ON starred_repos(owner);
CREATE INDEX idx_stars_language ON starred_repos(primary_language);
CREATE INDEX idx_stars_starred_at ON starred_repos(starred_at);
CREATE INDEX idx_stars_stargazers ON starred_repos(stargazers_count);

CREATE VIRTUAL TABLE star_embeddings USING vec0(
  embedding float[1536] distance_metric=cosine
);

CREATE TABLE star_embedding_map (
  repo_id TEXT PRIMARY KEY,
  vec_rowid INTEGER NOT NULL
);
CREATE INDEX idx_star_embedding_map_rowid ON star_embedding_map(vec_rowid);

CREATE VIRTUAL TABLE starred_repos_fts USING fts5(
  full_name,
  description,
  readme_content,
  topics,
  content='starred_repos',
  content_rowid='rowid'
);

CREATE TRIGGER starred_repos_ai AFTER INSERT ON starred_repos BEGIN
  INSERT INTO starred_repos_fts(rowid, full_name, description, readme_content, topics)
  VALUES (NEW.rowid, NEW.full_name, NEW.description, NEW.readme_content, NEW.topics);
END;

CREATE TRIGGER starred_repos_ad AFTER DELETE ON starred_repos BEGIN
  INSERT INTO starred_repos_fts(starred_repos_fts, rowid, full_name, description, readme_content, topics)
  VALUES ('delete', OLD.rowid, OLD.full_name, OLD.description, OLD.readme_content, OLD.topics);
END;

CREATE TRIGGER starred_repos_au AFTER UPDATE ON starred_repos BEGIN
  INSERT INTO starred_repos_fts(starred_repos_fts, rowid, full_name, description, readme_content, topics)
  VALUES ('delete', OLD.rowid, OLD.full_name, OLD.description, OLD.readme_content, OLD.topics);
  INSERT INTO starred_repos_fts(rowid, full_name, description, readme_content, topics)
  VALUES (NEW.rowid, NEW.full_name, NEW.description, NEW.readme_content, NEW.topics);
END;

-- YouTube Saved Videos
CREATE TABLE IF NOT EXISTS saved_videos (
  id INTEGER PRIMARY KEY,
  video_id TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_name TEXT,
  channel_id TEXT,
  description TEXT,
  duration_seconds INTEGER,
  published_at TEXT,
  thumbnail_url TEXT,
  tags TEXT,
  view_count INTEGER,
  source TEXT NOT NULL CHECK(source IN ('liked', 'watch_later', 'both')),
  saved_at TEXT NOT NULL,
  transcript TEXT,
  transcript_fetched_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_videos_source ON saved_videos(source);
CREATE INDEX IF NOT EXISTS idx_saved_videos_channel ON saved_videos(channel_name);
CREATE INDEX IF NOT EXISTS idx_saved_videos_saved_at ON saved_videos(saved_at);

CREATE TABLE IF NOT EXISTS saved_video_embedding_map (
  video_id TEXT PRIMARY KEY,
  vec_rowid INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_video_embedding_map_rowid ON saved_video_embedding_map(vec_rowid);

CREATE TABLE IF NOT EXISTS saved_video_segments (
  id INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB,
  FOREIGN KEY (video_id) REFERENCES saved_videos(video_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_video_segments_video ON saved_video_segments(video_id);

CREATE VIRTUAL TABLE IF NOT EXISTS saved_videos_fts USING fts5(
  video_id, title, channel_name, description, tags, transcript,
  content='saved_videos', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS saved_videos_ai AFTER INSERT ON saved_videos BEGIN
  INSERT INTO saved_videos_fts(rowid, video_id, title, channel_name, description, tags, transcript)
  VALUES (NEW.id, NEW.video_id, NEW.title, NEW.channel_name, NEW.description, NEW.tags, NEW.transcript);
END;

CREATE TRIGGER IF NOT EXISTS saved_videos_ad AFTER DELETE ON saved_videos BEGIN
  INSERT INTO saved_videos_fts(saved_videos_fts, rowid, video_id, title, channel_name, description, tags, transcript)
  VALUES ('delete', OLD.id, OLD.video_id, OLD.title, OLD.channel_name, OLD.description, OLD.tags, OLD.transcript);
END;

CREATE TRIGGER IF NOT EXISTS saved_videos_au AFTER UPDATE ON saved_videos BEGIN
  INSERT INTO saved_videos_fts(saved_videos_fts, rowid, video_id, title, channel_name, description, tags, transcript)
  VALUES ('delete', OLD.id, OLD.video_id, OLD.title, OLD.channel_name, OLD.description, OLD.tags, OLD.transcript);
  INSERT INTO saved_videos_fts(rowid, video_id, title, channel_name, description, tags, transcript)
  VALUES (NEW.id, NEW.video_id, NEW.title, NEW.channel_name, NEW.description, NEW.tags, NEW.transcript);
END;
