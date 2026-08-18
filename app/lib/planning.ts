import type {
  Assignment,
  Commitment,
  PriorityBreakdown,
  ScheduleProposal,
  StudentProfile,
  StudyBlock,
} from "./types";

const DAY = 86_400_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculatePriority(
  assignment: Assignment,
  now = new Date(),
  availableMinutes = 360,
): PriorityBreakdown {
  const due = new Date(assignment.dueAt);
  const hoursUntilDue = (due.getTime() - now.getTime()) / 3_600_000;
  const slackHours = hoursUntilDue - assignment.remainingMinutes / 60;

  let urgency = 5;
  if (hoursUntilDue <= 0) urgency = 35;
  else if (slackHours <= 2) urgency = 34;
  else if (hoursUntilDue <= 24) urgency = 31;
  else if (hoursUntilDue <= 72) urgency = 26;
  else if (hoursUntilDue <= 168) urgency = 20;
  else if (hoursUntilDue <= 336) urgency = 12;

  const impact = { low: 7, medium: 14, high: 20 }[assignment.gradeImpact];
  const importance = Math.round(clamp(assignment.importance, 1, 5) * 3);
  const effortRisk = Math.round(
    clamp(assignment.remainingMinutes / Math.max(availableMinutes, 1), 0, 1) * 15,
  );
  const challenge = Math.round(
    clamp(assignment.difficulty, 1, 5) + clamp(6 - assignment.confidence, 1, 5),
  );
  const dependency = assignment.milestones.some((item) => !item.complete) ? 5 : 0;
  const score = clamp(
    urgency + impact + importance + effortRisk + challenge + dependency,
    0,
    100,
  );

  const reasons: string[] = [];
  if (hoursUntilDue <= 0) reasons.push("overdue");
  else if (hoursUntilDue <= 72) reasons.push("due soon");
  if (assignment.gradeImpact === "high") reasons.push("high grade impact");
  if (effortRisk >= 10) reasons.push("limited planning slack");
  if (assignment.confidence <= 2) reasons.push("low confidence");

  return {
    score,
    urgency,
    impact,
    importance,
    effortRisk,
    challenge,
    dependency,
    summary: reasons.length ? reasons.join(" · ") : "steady progress keeps this on track",
  };
}

export function sortAssignmentsByPriority(
  assignments: Assignment[],
  now = new Date(),
) {
  return [...assignments]
    .filter((assignment) => assignment.status !== "complete")
    .sort(
      (a, b) =>
        calculatePriority(b, now).score - calculatePriority(a, now).score ||
        new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
    );
}

function dateAt(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const value = new Date(date);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function overlaps(start: Date, end: Date, commitments: Commitment[], blocks: StudyBlock[]) {
  return [...commitments, ...blocks].some((item) => {
    const itemStart = new Date(item.startAt);
    const itemEnd = new Date(item.endAt);
    return start < itemEnd && end > itemStart;
  });
}

export function proposeSchedule(
  assignments: Assignment[],
  commitments: Commitment[],
  profile: StudentProfile,
  now = new Date(),
): ScheduleProposal {
  const ranked = sortAssignmentsByPriority(assignments, now);
  const blocks: StudyBlock[] = [];
  const unscheduled: ScheduleProposal["unscheduled"] = [];
  const horizonEnd = new Date(now.getTime() + 14 * DAY);
  const dailyUse = new Map<string, number>();

  for (const assignment of ranked) {
    let remaining = Math.max(0, assignment.remainingMinutes);
    let cursor = new Date(now);
    cursor.setSeconds(0, 0);

    while (remaining > 0 && cursor <= horizonEnd && cursor < new Date(assignment.dueAt)) {
      const dayKey = cursor.toISOString().slice(0, 10);
      const startBoundary = dateAt(cursor, profile.preferredStudyStart);
      const endBoundary = dateAt(cursor, profile.preferredStudyEnd);
      if (cursor < startBoundary) cursor = startBoundary;
      if (cursor >= endBoundary) {
        cursor = new Date(cursor.getTime() + DAY);
        cursor = dateAt(cursor, profile.preferredStudyStart);
        continue;
      }

      const used = dailyUse.get(dayKey) ?? 0;
      if (used >= profile.maxDailyMinutes) {
        cursor = new Date(cursor.getTime() + DAY);
        cursor = dateAt(cursor, profile.preferredStudyStart);
        continue;
      }

      const duration = Math.min(50, Math.max(25, remaining), profile.maxDailyMinutes - used);
      const end = new Date(cursor.getTime() + duration * 60_000);
      if (end > endBoundary || end > new Date(assignment.dueAt)) {
        cursor = new Date(cursor.getTime() + DAY);
        cursor = dateAt(cursor, profile.preferredStudyStart);
        continue;
      }

      if (overlaps(cursor, end, commitments, blocks)) {
        cursor = new Date(cursor.getTime() + 15 * 60_000);
        continue;
      }

      const priority = calculatePriority(assignment, now);
      blocks.push({
        id: crypto.randomUUID(),
        assignmentId: assignment.id,
        startAt: cursor.toISOString(),
        endAt: end.toISOString(),
        status: "proposed",
        reason: `Priority ${priority.score}: ${priority.summary}`,
        confidence: remaining <= duration ? 94 : 88,
      });
      remaining -= duration;
      dailyUse.set(dayKey, used + duration);
      cursor = new Date(end.getTime() + profile.breakMinutes * 60_000);
    }

    if (remaining > 0) {
      unscheduled.push({
        assignmentId: assignment.id,
        minutes: remaining,
        reason: "Not enough available time before the deadline within your workload limit.",
      });
    }
  }

  return { blocks, unscheduled, generatedAt: now.toISOString() };
}

export function parseCaptureDraft(
  rawText: string,
  courseNames: { id: string; name: string; code: string }[],
  now = new Date(),
) {
  const normalized = rawText.trim().replace(/\s+/g, " ");
  const course = courseNames.find((item) => {
    const haystack = normalized.toLowerCase();
    return haystack.includes(item.name.toLowerCase()) || haystack.includes(item.code.toLowerCase());
  });
  const minuteMatch = normalized.match(/(\d{1,3})\s*(?:min|minute)/i);
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/i);
  const due = new Date(now.getTime() + DAY);
  due.setHours(23, 59, 0, 0);
  const dateMatch = normalized.match(/(?:due\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i);
  if (dateMatch) {
    const year = dateMatch[3]
      ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3])
      : now.getFullYear();
    due.setFullYear(year, Number(dateMatch[1]) - 1, Number(dateMatch[2]));
  }
  const effort = minuteMatch
    ? Number(minuteMatch[1])
    : hourMatch
      ? Math.round(Number(hourMatch[1]) * 60)
      : 60;
  const title = normalized
    .replace(/\bdue\b.*$/i, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/gi, "")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .slice(0, 90);

  return {
    title: title || "New assignment",
    courseId: course?.id ?? courseNames[0]?.id ?? "",
    dueAt: due.toISOString(),
    estimatedMinutes: effort,
    confidence: {
      title: normalized.length > 6 ? 0.92 : 0.55,
      course: course ? 0.9 : 0.42,
      dueAt: dateMatch ? 0.88 : 0.46,
      effort: minuteMatch || hourMatch ? 0.9 : 0.4,
    },
  };
}
