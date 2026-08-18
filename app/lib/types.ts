export type ThemeMode = "light" | "dark" | "system";
export type AssignmentStatus = "todo" | "in-progress" | "complete";
export type StudyBlockStatus = "proposed" | "accepted" | "complete";
export type TutorMode =
  | "hint"
  | "explain"
  | "worked-example"
  | "check-work"
  | "direct-answer";

export interface AvailabilityRule {
  id: string;
  days: number[];
  start: string;
  end: string;
  label: string;
}

export interface StudentProfile {
  displayName: string;
  email: string;
  timezone: string;
  preferredStudyStart: string;
  preferredStudyEnd: string;
  sleepStart: string;
  sleepEnd: string;
  maxDailyMinutes: number;
  breakMinutes: number;
  theme: ThemeMode;
  reducedMotion: boolean;
  tutorMemoryEnabled: boolean;
  availability: AvailabilityRule[];
}

export interface CourseMaterial {
  id: string;
  title: string;
  kind: "note" | "syllabus" | "rubric" | "study-guide" | "other";
  content: string;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  color: string;
  instructor: string;
  term: string;
  schedule: string;
  grading: string;
  archived: boolean;
  materials: CourseMaterial[];
}

export interface Milestone {
  id: string;
  title: string;
  complete: boolean;
}

export interface Assignment {
  id: string;
  title: string;
  courseId: string;
  notes: string;
  dueAt: string;
  estimatedMinutes: number;
  remainingMinutes: number;
  difficulty: number;
  confidence: number;
  importance: number;
  gradeImpact: "low" | "medium" | "high";
  status: AssignmentStatus;
  milestones: Milestone[];
  createdAt: string;
  completedAt?: string;
  actualMinutes?: number;
  source: "manual" | "capture" | "import";
}

export interface Commitment {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  color: string;
  recurrence: "none" | "weekly";
}

export interface StudyBlock {
  id: string;
  assignmentId: string;
  startAt: string;
  endAt: string;
  status: StudyBlockStatus;
  reason: string;
  confidence: number;
}

export interface FocusSession {
  id: string;
  assignmentId: string;
  startedAt: string;
  endedAt: string;
  plannedMinutes: number;
  actualMinutes: number;
  reflection: string;
}

export interface TutorCitation {
  id: string;
  title: string;
  excerpt: string;
}

export interface TutorMessage {
  id: string;
  role: "student" | "assistant";
  content: string;
  createdAt: string;
  mode?: TutorMode;
  citations?: TutorCitation[];
  provider?: "openai" | "local";
}

export interface TutorThread {
  id: string;
  courseId: string;
  title: string;
  messages: TutorMessage[];
  updatedAt: string;
}

export interface TutorMemoryItem {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
}

export interface WorkspaceSnapshot {
  schemaVersion: 1;
  profile: StudentProfile;
  courses: Course[];
  assignments: Assignment[];
  commitments: Commitment[];
  studyBlocks: StudyBlock[];
  focusSessions: FocusSession[];
  tutorThreads: TutorThread[];
  tutorMemory: TutorMemoryItem[];
  acceptedTermsAt: string;
  updatedAt: string;
}

export interface PriorityBreakdown {
  score: number;
  urgency: number;
  impact: number;
  importance: number;
  effortRisk: number;
  challenge: number;
  dependency: number;
  summary: string;
}

export interface ScheduleProposal {
  blocks: StudyBlock[];
  unscheduled: { assignmentId: string; minutes: number; reason: string }[];
  generatedAt: string;
}

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
}
