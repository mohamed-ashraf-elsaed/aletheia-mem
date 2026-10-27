// Round-level segmentation: a round is a user turn plus the consecutive tool chatter that followed it. A new round
// starts at each user message and whenever the gap between two episodes exceeds maxGapMs (2 minutes by default).
// Pure and I/O-free so the unit test and any benchmark exercise the same code.

export function segmentRounds(episodes, { maxGapMs = 2 * 60_000 } = {}) {
  const rounds = [];
  let current = null;
  for (const episode of episodes) {
    const previous = current?.episodes[current.episodes.length - 1];
    const gap = previous ? Math.max(0, Number(episode.createdAtEpoch) - Number(previous.createdAtEpoch)) : 0;
    const isUser = episode.role === "user";
    if (!current || isUser || gap > maxGapMs) {
      current = { episodeIds: [], episodes: [], startedAt: Number(episode.createdAtEpoch), endedAt: Number(episode.createdAtEpoch) };
      rounds.push(current);
    }
    current.episodeIds.push(episode.id);
    current.episodes.push(episode);
    current.endedAt = Number(episode.createdAtEpoch);
  }
  return rounds;
}
