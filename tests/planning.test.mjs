import assert from "node:assert/strict";
import test from "node:test";
import { calculatePriority, proposeSchedule } from "../app/lib/planning.ts";

const now = new Date("2026-08-17T14:00:00.000Z");
const baseAssignment = {
  id: "assignment-1",
  title: "Lab report",
  courseId: "course-1",
  notes: "",
  dueAt: "2026-08-18T18:00:00.000Z",
  estimatedMinutes: 100,
  remainingMinutes: 100,
  difficulty: 4,
  confidence: 2,
  importance: 5,
  gradeImpact: "high",
  status: "todo",
  milestones: [{ id: "m-1", title: "Analyze data", complete: false }],
  createdAt: now.toISOString(),
  source: "manual",
};

const profile = {
  displayName: "Student",
  email: "student@example.com",
  timezone: "UTC",
  preferredStudyStart: "16:00",
  preferredStudyEnd: "21:00",
  sleepStart: "23:00",
  sleepEnd: "07:00",
  maxDailyMinutes: 120,
  breakMinutes: 10,
  theme: "light",
  reducedMotion: false,
  tutorMemoryEnabled: true,
  availability: [],
};

test("priority score exposes the approved weighted components", () => {
  const result = calculatePriority(baseAssignment, now, 180);
  assert.equal(result.impact, 20);
  assert.equal(result.importance, 15);
  assert.equal(result.dependency, 5);
  assert.ok(result.score <= 100);
  assert.ok(result.summary.includes("high grade impact"));
});

test("overdue work receives maximum urgency", () => {
  const result = calculatePriority({ ...baseAssignment, dueAt: "2026-08-16T18:00:00.000Z" }, now);
  assert.equal(result.urgency, 35);
});

test("proposals avoid hard commitments and daily workload limits", () => {
  const commitments = [{
    id: "busy-1",
    title: "Practice",
    startAt: "2026-08-17T16:00:00.000Z",
    endAt: "2026-08-17T18:00:00.000Z",
    color: "#555555",
    recurrence: "none",
  }];
  const result = proposeSchedule([baseAssignment], commitments, profile, now);
  assert.ok(result.blocks.length > 0);
  for (const block of result.blocks) {
    const start = new Date(block.startAt);
    const end = new Date(block.endAt);
    assert.ok(end <= new Date(baseAssignment.dueAt));
    assert.ok(end <= new Date(start.toDateString() + " 21:00"));
    assert.ok(!(start < new Date(commitments[0].endAt) && end > new Date(commitments[0].startAt)));
  }
  const minutesByDay = new Map();
  for (const block of result.blocks) {
    const key = block.startAt.slice(0, 10);
    const minutes = (new Date(block.endAt) - new Date(block.startAt)) / 60_000;
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + minutes);
  }
  assert.ok([...minutesByDay.values()].every((minutes) => minutes <= profile.maxDailyMinutes));
});
