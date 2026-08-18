import type { Assignment, WorkspaceSnapshot } from "./types";

function isoFromNow(days: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function createSeedWorkspace(
  displayName: string,
  email: string,
  includeSampleData: boolean,
): WorkspaceSnapshot {
  const now = new Date().toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const courseIds = {
    history: crypto.randomUUID(),
    chemistry: crypto.randomUUID(),
    calculus: crypto.randomUUID(),
  };
  const assignments: Assignment[] = includeSampleData
    ? [
        {
          id: crypto.randomUUID(),
          title: "Primary source analysis",
          courseId: courseIds.history,
          notes: "Compare the two assigned letters and support the thesis with three quotations.",
          dueAt: isoFromNow(1, 23, 59),
          estimatedMinutes: 120,
          remainingMinutes: 95,
          difficulty: 3,
          confidence: 3,
          importance: 5,
          gradeImpact: "high",
          status: "in-progress",
          milestones: [
            { id: crypto.randomUUID(), title: "Choose evidence", complete: true },
            { id: crypto.randomUUID(), title: "Draft analysis", complete: false },
          ],
          createdAt: now,
          source: "manual",
        },
        {
          id: crypto.randomUUID(),
          title: "Stoichiometry problem set",
          courseId: courseIds.chemistry,
          notes: "Problems 14-28, show dimensional-analysis steps.",
          dueAt: isoFromNow(3, 8),
          estimatedMinutes: 80,
          remainingMinutes: 80,
          difficulty: 4,
          confidence: 2,
          importance: 4,
          gradeImpact: "medium",
          status: "todo",
          milestones: [],
          createdAt: now,
          source: "manual",
        },
        {
          id: crypto.randomUUID(),
          title: "Derivative review quiz",
          courseId: courseIds.calculus,
          notes: "Review product, quotient, and chain rules.",
          dueAt: isoFromNow(5, 10),
          estimatedMinutes: 60,
          remainingMinutes: 60,
          difficulty: 3,
          confidence: 3,
          importance: 3,
          gradeImpact: "medium",
          status: "todo",
          milestones: [],
          createdAt: now,
          source: "manual",
        },
      ]
    : [];

  return {
    schemaVersion: 1,
    profile: {
      displayName,
      email,
      timezone,
      preferredStudyStart: "16:00",
      preferredStudyEnd: "21:00",
      sleepStart: "23:00",
      sleepEnd: "07:00",
      maxDailyMinutes: 180,
      breakMinutes: 10,
      theme: "light",
      reducedMotion: false,
      tutorMemoryEnabled: true,
      availability: [
        { id: crypto.randomUUID(), days: [1, 2, 3, 4, 5], start: "16:00", end: "21:00", label: "Weekdays" },
        { id: crypto.randomUUID(), days: [0, 6], start: "10:00", end: "18:00", label: "Weekends" },
      ],
    },
    courses: includeSampleData
      ? [
          {
            id: courseIds.history,
            name: "U.S. History",
            code: "HIST 1301",
            color: "#3f7f73",
            instructor: "Dr. Rivera",
            term: "Fall 2026",
            schedule: "Mon/Wed 9:00 AM",
            grading: "Essays 40% · Exams 35% · Participation 25%",
            archived: false,
            materials: [
              {
                id: crypto.randomUUID(),
                title: "Primary source rubric",
                kind: "rubric",
                content: "Strong analyses state a specific thesis, use at least three quotations, explain context, and connect each quotation to the claim.",
                createdAt: now,
              },
            ],
          },
          {
            id: courseIds.chemistry,
            name: "Chemistry",
            code: "CHEM 1411",
            color: "#8465a8",
            instructor: "Ms. Chen",
            term: "Fall 2026",
            schedule: "Tue/Thu 11:00 AM",
            grading: "Labs 30% · Tests 45% · Homework 25%",
            archived: false,
            materials: [
              {
                id: crypto.randomUUID(),
                title: "Stoichiometry notes",
                kind: "note",
                content: "Convert the known quantity to moles, use the balanced-equation mole ratio, then convert moles into the requested unit. Keep units visible in every factor.",
                createdAt: now,
              },
            ],
          },
          {
            id: courseIds.calculus,
            name: "Calculus I",
            code: "MATH 2413",
            color: "#d08a4d",
            instructor: "Prof. Patel",
            term: "Fall 2026",
            schedule: "Mon/Wed/Fri 1:00 PM",
            grading: "Exams 60% · Quizzes 20% · Homework 20%",
            archived: false,
            materials: [],
          },
        ]
      : [],
    assignments,
    commitments: includeSampleData
      ? [
          {
            id: crypto.randomUUID(),
            title: "Soccer practice",
            startAt: isoFromNow(0, 18),
            endAt: isoFromNow(0, 19, 30),
            color: "#68758a",
            recurrence: "weekly",
          },
        ]
      : [],
    studyBlocks: [],
    focusSessions: [],
    tutorThreads: [],
    tutorMemory: [
      { id: crypto.randomUUID(), label: "Learning preference", value: "Explain the idea, then let me try one step.", enabled: true },
    ],
    acceptedTermsAt: now,
    updatedAt: now,
  };
}
