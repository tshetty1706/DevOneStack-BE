import DailyContribution from '../models/DailyContribution.js';
import Space from '../models/Space.js';
import { CONTRIBUTION_CONFIG, calculateHeatmapLevel, getUtcDateString } from '../config/contributionConfig.js';

/**
 * Check if the user is the space owner or an accepted editor collaborator.
 */
export function isSpaceEditor(userId, space) {
  if (!userId || !space) return false;
  const uId = userId.toString();

  // 1. Space Owner
  const ownerId = (space.owner?._id || space.owner)?.toString();
  if (ownerId === uId) return true;

  // 2. Editor Collaborator
  if (Array.isArray(space.collaborators)) {
    return space.collaborators.some(
      (c) => (c.user?._id || c.user)?.toString() === uId && c.role === 'editor'
    );
  }

  return false;
}

/**
 * Record item creation contribution (+3 points, max 5 per day).
 */
export async function recordItemCreate(userId, space, item) {
  try {
    if (!userId || !space || !item) return null;

    // Check item type eligibility
    if (!CONTRIBUTION_CONFIG.eligibleItemTypes.includes(item.type)) {
      return null;
    }

    // Cloning, imports, system-generated items do not count
    if (item.source === 'clone' || item.source === 'import' || item.source === 'system') {
      return null;
    }

    // Must be space owner or editor collaborator
    if (!isSpaceEditor(userId, space)) {
      return null;
    }

    const today = getUtcDateString();

    // Atomic find or create
    let daily = await DailyContribution.findOne({ user: userId, date: today });
    if (!daily) {
      daily = new DailyContribution({
        user: userId,
        date: today,
        points: 0,
        createsCount: 0,
        editsCount: 0,
        readsCount: 0,
        createdItemIds: [],
        editedItemIds: [],
        readItemIds: []
      });
    }

    // Daily cap: max 5 counted creates per day
    if (daily.createsCount < CONTRIBUTION_CONFIG.createDailyLimit) {
      daily.createsCount += 1;
      daily.points += CONTRIBUTION_CONFIG.createPoints;
      daily.level = calculateHeatmapLevel(daily.points);
      daily.createdItemIds.push(item._id);
      await daily.save();
      return { counted: true, pointsAwarded: CONTRIBUTION_CONFIG.createPoints, totalDailyPoints: daily.points };
    }

    return { counted: false, reason: 'daily_create_limit_reached' };
  } catch (err) {
    console.error('recordItemCreate contribution error:', err);
    return null;
  }
}

/**
 * Record item edit contribution (+2 points, once per item per day, meaningful edits only).
 */
export async function recordItemEdit(userId, space, item, oldContent = '', newContent = '') {
  try {
    if (!userId || !space || !item) return null;

    // Check item type eligibility
    if (!CONTRIBUTION_CONFIG.eligibleItemTypes.includes(item.type)) {
      return null;
    }

    if (item.source === 'clone' || item.source === 'import' || item.source === 'system') {
      return null;
    }

    // Must be space owner or editor collaborator
    if (!isSpaceEditor(userId, space)) {
      return null;
    }

    // Check minimum meaningful edit threshold (at least 20 chars changed)
    const oldStr = String(oldContent || '').trim();
    const newStr = String(newContent || '').trim();
    const charDiff = Math.abs(newStr.length - oldStr.length);
    const contentChangedMeaningfully = charDiff >= CONTRIBUTION_CONFIG.minimumEditCharacters || (oldStr !== newStr && newStr.length >= 20);

    if (!contentChangedMeaningfully) {
      return { counted: false, reason: 'trivial_edit' };
    }

    const today = getUtcDateString();

    let daily = await DailyContribution.findOne({ user: userId, date: today });
    if (!daily) {
      daily = new DailyContribution({
        user: userId,
        date: today,
        points: 0,
        createsCount: 0,
        editsCount: 0,
        readsCount: 0,
        createdItemIds: [],
        editedItemIds: [],
        readItemIds: []
      });
    }

    // Deduplication: Only once per item per day
    const alreadyEdited = daily.editedItemIds.some((id) => id.toString() === item._id.toString());
    if (alreadyEdited) {
      return { counted: false, reason: 'already_edited_today' };
    }

    daily.editsCount += 1;
    daily.points += CONTRIBUTION_CONFIG.editPoints;
    daily.level = calculateHeatmapLevel(daily.points);
    daily.editedItemIds.push(item._id);
    await daily.save();

    return { counted: true, pointsAwarded: CONTRIBUTION_CONFIG.editPoints, totalDailyPoints: daily.points };
  } catch (err) {
    console.error('recordItemEdit contribution error:', err);
    return null;
  }
}

/**
 * Record meaningful read engagement (+1 point, once per item per day).
 */
export async function recordItemRead(userId, space, item, durationSeconds = 0, meaningfulInteraction = false) {
  try {
    if (!userId || !space || !item) return null;

    if (!CONTRIBUTION_CONFIG.eligibleItemTypes.includes(item.type)) {
      return null;
    }

    // Must be space owner or editor collaborator
    if (!isSpaceEditor(userId, space)) {
      return { counted: false, reason: 'unauthorized_for_read_points' };
    }

    // Verify meaningful engagement criteria
    const qualifiedTime = durationSeconds >= CONTRIBUTION_CONFIG.readEngagementSeconds;
    if (!qualifiedTime && !meaningfulInteraction) {
      return { counted: false, reason: 'engagement_threshold_not_met' };
    }

    const today = getUtcDateString();

    let daily = await DailyContribution.findOne({ user: userId, date: today });
    if (!daily) {
      daily = new DailyContribution({
        user: userId,
        date: today,
        points: 0,
        createsCount: 0,
        editsCount: 0,
        readsCount: 0,
        createdItemIds: [],
        editedItemIds: [],
        readItemIds: []
      });
    }

    // Deduplication: Only once per item per day
    const alreadyRead = daily.readItemIds.some((id) => id.toString() === item._id.toString());
    if (alreadyRead) {
      return { counted: false, reason: 'already_read_today' };
    }

    daily.readsCount += 1;
    daily.points += CONTRIBUTION_CONFIG.readPoints;
    daily.level = calculateHeatmapLevel(daily.points);
    daily.readItemIds.push(item._id);
    await daily.save();

    return { counted: true, pointsAwarded: CONTRIBUTION_CONFIG.readPoints, totalDailyPoints: daily.points };
  } catch (err) {
    console.error('recordItemRead contribution error:', err);
    return null;
  }
}

/**
 * Fetch and construct full heatmap data for a given user.
 */
export async function getHeatmapData(userId, months = 12) {
  try {
    const rangeMonths = Math.min(12, Math.max(1, parseInt(months, 10) || 12));
    const now = new Date();
    const todayStr = getUtcDateString(now);

    // 53 weeks for 12 months, or proportional weeks for smaller ranges
    const weeks = rangeMonths === 12 ? 53 : Math.max(4, Math.ceil((rangeMonths * 30.5) / 7));

    // End on the Saturday of the current week
    const currentDayOfWeek = now.getUTCDay(); // 0 = Sunday ... 6 = Saturday
    const endDate = new Date(now);
    endDate.setUTCDate(now.getUTCDate() + (6 - currentDayOfWeek));

    // Start on Sunday `weeks` weeks before endDate
    const startDate = new Date(endDate);
    startDate.setUTCDate(endDate.getUTCDate() - (weeks * 7 - 1));

    const startDateStr = getUtcDateString(startDate);

    const records = await DailyContribution.find({
      user: userId,
      date: { $gte: startDateStr, $lte: todayStr }
    }).lean();

    const recordMap = new Map();
    let totalContributions = 0;
    let activeDaysCount = 0;

    records.forEach((r) => {
      const pts = r.points || 0;
      recordMap.set(r.date, {
        points: pts,
        level: calculateHeatmapLevel(pts),
        creates: r.createsCount || 0,
        edits: r.editsCount || 0,
        reads: r.readsCount || 0
      });
      totalContributions += pts;
      if (pts > 0) activeDaysCount += 1;
    });

    const grid = [];
    const daysFlat = [];
    const monthHeaders = [];
    let lastMonth = '';

    for (let w = 0; w < weeks; w++) {
      const week = [];
      let weekFirstValidMonth = '';

      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setUTCDate(startDate.getUTCDate() + (w * 7 + d));
        const dateStr = getUtcDateString(cellDate);

        // Check if date is in the future
        const isFuture = cellDate.getTime() > now.getTime() && dateStr !== todayStr;
        const matched = recordMap.get(dateStr) || { points: 0, level: 0, creates: 0, edits: 0, reads: 0 };

        const dayItem = {
          date: dateStr,
          dateFormatted: cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
          dayOfWeek: d,
          isFuture,
          count: isFuture ? 0 : matched.points,
          points: isFuture ? 0 : matched.points,
          level: isFuture ? -1 : matched.level, // -1 for future cells (hidden/blank)
          creates: isFuture ? 0 : matched.creates,
          edits: isFuture ? 0 : matched.edits,
          reads: isFuture ? 0 : matched.reads,
        };

        week.push(dayItem);
        daysFlat.push(dayItem);

        if (!isFuture && !weekFirstValidMonth) {
          weekFirstValidMonth = cellDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        }
      }

      // Check for month label change
      if (weekFirstValidMonth && weekFirstValidMonth !== lastMonth) {
        monthHeaders.push({ month: weekFirstValidMonth, colIndex: w });
        lastMonth = weekFirstValidMonth;
      }

      grid.push(week);
    }

    return {
      totalContributions,
      activeDaysCount,
      rangeMonths,
      weeksCount: weeks,
      monthHeaders,
      grid,
      days: daysFlat
    };
  } catch (err) {
    console.error('getHeatmapData error:', err);
    throw err;
  }
}
