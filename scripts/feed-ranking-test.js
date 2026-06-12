const assert = require("assert");
const { rankDiscoveryFeed } = require("../lib/feed-ranking");

const now = Date.now();
const posts = [
  {
    id: 1,
    username: "/dev",
    message: "Tiny",
    timestamp: now - (6 * 24 * 60 * 60 * 1000),
    likes: [],
    saves: [],
    retweets: [],
    views: 1
  },
  {
    id: 2,
    username: "/creator",
    message: "A thoughtful post about javascript, api design, and database scale.",
    timestamp: now - (60 * 60 * 1000),
    likes: ["/a", "/b", "/c"],
    saves: ["/a"],
    retweets: ["/b"],
    views: 42,
    imageUrl: "/uploads/example.png"
  },
  {
    id: 3,
    username: "/creator",
    message: "Another good javascript post from the same author.",
    timestamp: now - (2 * 60 * 60 * 1000),
    likes: ["/a"],
    saves: [],
    retweets: [],
    views: 10
  },
  {
    id: 4,
    username: "/music",
    message: "A fresh music note for variety.",
    timestamp: now - (90 * 60 * 1000),
    likes: ["/a"],
    saves: [],
    retweets: [],
    views: 9
  }
];

const ranked = rankDiscoveryFeed(posts, {
  now,
  currentUser: "/viewer",
  following: ["/creator"],
  users: {
    "/creator": { pfp: "/pfps/creator.png", isPremium: true },
    "/music": { pfp: "/pfps/music.png" }
  },
  userPrefs: {
    topics: { technology: 8, music: 1 },
    totalWeight: 9
  },
  getAnalysis: post => {
    if (post.id === 2 || post.id === 3) return { topics: ["technology"], energy: 8, sentiment: "positive" };
    if (post.id === 4) return { topics: ["music"], energy: 6, sentiment: "positive" };
    return { topics: ["general"], energy: 4, sentiment: "neutral" };
  }
});

assert.strictEqual(ranked[0].id, 2, "The strongest relevant post should rank first.");
assert.ok(ranked[0]._rank.score > ranked[ranked.length - 1]._rank.score, "Rank scores should be meaningful.");
assert.ok(ranked[0].pfp, "Ranking should hydrate author profile metadata.");

for (let index = 2; index < ranked.length; index += 1) {
  const a = ranked[index - 2].username;
  const b = ranked[index - 1].username;
  const c = ranked[index].username;
  assert.ok(!(a === b && b === c), "Feed should not show three posts from one author in a row.");
}

console.log("[OK] Feed ranking test passed.");
