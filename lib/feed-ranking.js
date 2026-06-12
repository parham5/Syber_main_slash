const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildTopicPreferences(userPrefs = {}) {
  const topics = userPrefs.topics || {};
  const totalWeight = Number(userPrefs.totalWeight || 0);
  if (!totalWeight) return {};

  return Object.fromEntries(
    Object.entries(topics).map(([topic, weight]) => [topic, (Number(weight) / totalWeight) * 100])
  );
}

function engagementForPost(post, replyCount = 0) {
  const likes = asArray(post.likes).length;
  const saves = asArray(post.saves).length;
  const retweets = asArray(post.retweets).length;
  const quotes = Number(post.quoteCount || 0);
  const views = Number(post.views || 0);

  return {
    likes,
    saves,
    retweets,
    replies: replyCount,
    quotes,
    views,
    score: Math.min(70, likes + (saves * 2.2) + (retweets * 3) + (replyCount * 2.4) + (quotes * 2.6) + Math.log10(views + 1) * 2)
  };
}

function recencyScore(timestamp, now = Date.now()) {
  const age = Math.max(0, now - Number(timestamp || now));
  if (age < HOUR_MS) return 100;
  if (age < 6 * HOUR_MS) return 85;
  if (age < DAY_MS) return 68;
  if (age < 3 * DAY_MS) return 45;
  if (age < 7 * DAY_MS) return 25;
  return 8;
}

function topicScore(postTopics, topicPreferences) {
  const topics = asArray(postTopics).length ? postTopics : ["general"];
  const preferenceNames = Object.keys(topicPreferences);
  if (!preferenceNames.length) return 48;

  const total = topics.reduce((sum, topic) => sum + Number(topicPreferences[topic] || 0), 0);
  return Math.min(100, total / topics.length);
}

function qualityScore(post, analysis = {}) {
  const text = String(post.message || "").trim();
  let score = 35;

  if (text.length >= 20) score += 10;
  if (text.length >= 80) score += 8;
  if (post.imageUrl) score += post.isVideo ? 12 : 8;
  if (post.isQuote) score += 5;
  if ((analysis.energy || 0) >= 7) score += 8;
  if (analysis.sentiment === "negative") score -= 7;
  if (/https?:\/\//i.test(text)) score -= 4;
  if (text.length < 5 && !post.imageUrl) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function diversifyRankedPosts(scoredPosts, options = {}) {
  const maxAuthorStreak = options.maxAuthorStreak || 2;
  const selected = [];
  const queue = [...scoredPosts];

  while (queue.length) {
    const recentAuthors = selected.slice(-maxAuthorStreak).map(post => post.username);
    const blockedAuthor = recentAuthors.length === maxAuthorStreak && recentAuthors.every(author => author === recentAuthors[0])
      ? recentAuthors[0]
      : null;

    const index = blockedAuthor
      ? queue.findIndex(post => post.username !== blockedAuthor)
      : 0;

    const pickIndex = index === -1 ? 0 : index;
    selected.push(queue.splice(pickIndex, 1)[0]);
  }

  return selected;
}

function rankDiscoveryFeed(posts, options = {}) {
  const now = options.now || Date.now();
  const currentUser = options.currentUser;
  const following = options.following instanceof Set ? options.following : new Set(options.following || []);
  const users = options.users || {};
  const topicPreferences = buildTopicPreferences(options.userPrefs || {});
  const getAnalysis = options.getAnalysis || (() => null);
  const getReplyCount = options.getReplyCount || (() => 0);
  const maxCandidates = options.maxCandidates || 500;

  const seenOriginals = new Set();
  const candidates = asArray(posts)
    .filter(post => post && !post.parentId)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, maxCandidates)
    .filter(post => {
      const duplicateKey = post.retweetOf || post.quoteOf || post.id;
      if (seenOriginals.has(duplicateKey) && post.isRetweet) return false;
      seenOriginals.add(duplicateKey);
      return true;
    });

  const scored = candidates.map(post => {
    const author = post.username;
    const analysis = getAnalysis(post) || {};
    const postTopics = asArray(analysis.topics).length ? analysis.topics : ["general"];
    const replyCount = Number(post.replyCount ?? getReplyCount(post.id));
    const engagement = engagementForPost(post, replyCount);
    const authorInfo = users[author] || {};
    const isFollowing = following.has(author);
    const isOwnPost = author === currentUser;
    const age = now - Number(post.timestamp || now);
    const stalePenalty = age > 10 * DAY_MS && !isFollowing ? 18 : 0;
    const premiumBoost = authorInfo.isPremium || post.isPremium ? 3 : 0;
    const mediaBoost = post.imageUrl ? 4 : 0;

    const signals = {
      topic: topicScore(postTopics, topicPreferences),
      engagement: engagement.score,
      recency: recencyScore(post.timestamp, now),
      quality: qualityScore(post, analysis),
      relationship: isFollowing ? 18 : 0,
      ownPost: isOwnPost ? 6 : 0,
      premium: premiumBoost,
      media: mediaBoost,
      stalePenalty
    };

    const score =
      (signals.topic * 0.27) +
      (signals.engagement * 0.24) +
      (signals.recency * 0.19) +
      (signals.quality * 0.18) +
      signals.relationship +
      signals.ownPost +
      signals.premium +
      signals.media -
      signals.stalePenalty;

    return {
      ...post,
      pfp: authorInfo.pfp || post.pfp || null,
      isPremium: authorInfo.isPremium || post.isPremium || false,
      replyCount,
      _rank: {
        score: Math.round(score * 100) / 100,
        topics: postTopics,
        signals
      }
    };
  });

  scored.sort((a, b) => {
    if (b._rank.score !== a._rank.score) return b._rank.score - a._rank.score;
    return Number(b.timestamp || 0) - Number(a.timestamp || 0);
  });

  return diversifyRankedPosts(scored, { maxAuthorStreak: options.maxAuthorStreak || 2 });
}

function stripRankDebug(post, includeDebug = false) {
  if (includeDebug) return post;
  const { _rank, ...cleanPost } = post;
  return cleanPost;
}

module.exports = {
  buildTopicPreferences,
  engagementForPost,
  rankDiscoveryFeed,
  recencyScore,
  stripRankDebug,
  topicScore
};
