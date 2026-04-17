import os from "node:os";

type LoadSample = {
  at: number;
  loadPercent: number;
};

const SAMPLE_INTERVAL_MS = 60_000;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const loadHistory: LoadSample[] = [];
const cpuCount = Math.max(1, os.cpus().length);

function calculateCurrentLoadPercent() {
  const oneMinuteLoad = os.loadavg()[0] ?? 0;
  return Math.max(0, (oneMinuteLoad / cpuCount) * 100);
}

function pruneHistory(now: number) {
  const minTimestamp = now - HISTORY_WINDOW_MS;

  while (loadHistory.length > 0 && loadHistory[0]!.at < minTimestamp) {
    loadHistory.shift();
  }
}

function pushSample() {
  const now = Date.now();
  loadHistory.push({
    at: now,
    loadPercent: calculateCurrentLoadPercent(),
  });
  pruneHistory(now);
}

pushSample();
setInterval(pushSample, SAMPLE_INTERVAL_MS);

export function getCurrentLoadPercent() {
  return calculateCurrentLoadPercent();
}

function getAverageLoadPercent(windowMs: number) {
  const now = Date.now();
  pruneHistory(now);

  const minTimestamp = now - windowMs;
  const samples = loadHistory.filter((sample) => sample.at >= minTimestamp);

  if (samples.length === 0 || now - loadHistory[0]!.at < windowMs) {
    return null;
  }

  const total = samples.reduce((sum, sample) => sum + sample.loadPercent, 0);
  return total / samples.length;
}

export function getLoadHistorySummary() {
  return {
    hourAvgPercent: getAverageLoadPercent(60 * 60 * 1_000),
    twelveHoursAvgPercent: getAverageLoadPercent(12 * 60 * 60 * 1_000),
    dayAvgPercent: getAverageLoadPercent(24 * 60 * 60 * 1_000),
  };
}
