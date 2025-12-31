"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface Bookmark {
  id: string;
  postUrl: string;
  authorName: string;
  authorHandle: string;
  tweetText: string;
  timestamp: number;
  topics: string[];
  extractedRepos: string[];
  extractedLinks: string[];
}

interface TopicCount {
  topic: string;
  count: number;
}

export default function BookmarksPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>();

  const params = new URLSearchParams();
  if (searchQuery) params.set("query", searchQuery);
  if (selectedTopic) params.set("topic", selectedTopic);
  params.set("limit", "50");

  const { data: bookmarks } = useSWR<Bookmark[]>(
    `/api/bookmarks?${params}`,
    fetcher
  );

  const { data: topics } = useSWR<TopicCount[]>(
    "/api/bookmarks/topics",
    fetcher
  );

  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-zinc-700"
          />
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            <TopicButton
              label="All"
              selected={!selectedTopic}
              onClick={() => setSelectedTopic(undefined)}
            />
            {topics?.slice(0, 6).map(({ topic }: TopicCount) => (
              <TopicButton
                key={topic}
                label={topic}
                selected={selectedTopic === topic}
                onClick={() => setSelectedTopic(topic)}
              />
            ))}
          </div>
        </div>

        {bookmarks === undefined ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            {searchQuery || selectedTopic
              ? "No bookmarks match your search."
              : "No bookmarks yet. Run the Twitter ingestion script."}
          </div>
        ) : (
          <div className="space-y-4">
            {bookmarks.map((bookmark: Bookmark) => (
              <BookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function TopicButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
        selected
          ? "bg-zinc-100 text-zinc-900"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  const topics = bookmark.topics || [];
  const extractedRepos = bookmark.extractedRepos || [];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-medium text-zinc-200">{bookmark.authorName}</span>
          <span className="text-zinc-500 ml-2">@{bookmark.authorHandle}</span>
        </div>
        <time className="text-xs text-zinc-600">
          {formatDistanceToNow(bookmark.timestamp, { addSuffix: true })}
        </time>
      </div>
      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{bookmark.tweetText}</p>
      {topics.length > 0 && (
        <div className="flex gap-2 mt-3">
          {topics.map((topic: string) => (
            <span
              key={topic}
              className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
      {extractedRepos.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Mentioned repos:</p>
          <div className="flex gap-2 flex-wrap">
            {extractedRepos.map((repo: string) => (
              <a
                key={repo}
                href={`https://github.com/${repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                {repo}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3">
        <a
          href={bookmark.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          View on X
        </a>
      </div>
    </div>
  );
}
