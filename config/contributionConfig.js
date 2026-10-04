/**
 * Centralized Contribution Configuration
 * Defines rules, point values, daily limits, and heatmap thresholds.
 */
export const CONTRIBUTION_CONFIG = {
  // CREATE ITEM
  createPoints: 3,
  createDailyLimit: 5, // Maximum 5 counted creates per day (Max 15 points/day)

  // EDIT ITEM
  editPoints: 2,
  editDailyLimitPerItem: 1, // Only once per item per day
  minimumEditCharacters: 20, // Minimum content difference to count as a meaningful edit

  // READ ITEM
  readPoints: 1,
  readDailyLimitPerItem: 1, // Only once per item per day
  readEngagementSeconds: 30, // Minimum active tab engagement in seconds

  // Allowed Item Types for contributions
  eligibleItemTypes: ['note', 'snippet', 'learning', 'doc', 'prompt'],

  // Heatmap Level Thresholds
  heatmapLevels: [
    { level: 0, min: 0, max: 0 },
    { level: 1, min: 1, max: 2 },
    { level: 2, min: 3, max: 5 },
    { level: 3, min: 6, max: 9 },
    { level: 4, min: 10, max: Infinity },
  ],
};

/**
 * Maps contribution points to a discrete heatmap level (0 to 4).
 * @param {number} points
 * @returns {number} Level from 0 to 4
 */
export function calculateHeatmapLevel(points) {
  if (!points || points <= 0) return 0;
  if (points <= 2) return 1;
  if (points <= 5) return 2;
  if (points <= 9) return 3;
  return 4;
}

/**
 * Formats a Date object to "YYYY-MM-DD" string (UTC).
 * @param {Date} date
 * @returns {string}
 */
export function getUtcDateString(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}
