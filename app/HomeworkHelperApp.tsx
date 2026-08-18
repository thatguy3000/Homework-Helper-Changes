"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { calculatePriority, parseCaptureDraft, proposeSchedule, sortAssignmentsByPriority } from "./lib/planning";
import { createSeedWorkspace } from "./lib/seed";
import type {
  Assignment,
  Commitment,
  Course,
  CourseMaterial,
  ScheduleProposal,
  SessionUser,
  StudyBlock,
  TutorMessage,
  TutorMode,
  WorkspaceSnapshot,
} from "./lib/types";

type ViewKey =
  | "dashboard"
  | "calendar"
  | "assignments"
  | "classes"
  | "tutor"
  | "insights"
  | "integrations"
  | "settings";
type ModalKey = "assignment" | "course" | "capture" | "planner" | "commitment" | "material" | null;

type SpeechRecognizer = new () => {
  lang: string;
  interimResults: boolean;
  onresult: (event: {
    results: { [index: number]: { [index: number]: { transcript: string } } };
  }) => void;
  onend: () => void;
  start: () => void;
};

const NAV_ITEMS: { id: ViewKey; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "H" },
  { id: "calendar", label: "Calendar", icon: "C" },
  { id: "assignments", label: "Assignments", icon: "A" },
  { id: "classes", label: "Classes", icon: "K" },
  { id: "tutor", label: "Tutor", icon: "T" },
  { id: "insights", label: "Insights", icon: "I" },
  { id: "integrations", label: "Integrations", icon: "+" },
  { id: "settings", label: "Settings", icon: "S" },
];

const COURSE_COLORS = ["#3f7f73", "#8465a8", "#d08a4d", "#4779a8", "#b45f6f", "#607d45"];

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options ?? { month: "short", day: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function localDateTimeValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function downloadFile(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function icsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function LoginScreen({
  onComplete,
  busy,
  error,
}: {
  onComplete: (input: { displayName: string; email: string; ageConfirmed: boolean; sample: boolean }) => void;
  busy: boolean;
  error: string;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [sample, setSample] = useState(true);

  return (
    <main className="welcome-page">
      <section className="welcome-story">
        <div className="brand-lockup brand-lockup-large">
          <span className="brand-mark" aria-hidden="true"><span>✓</span></span>
          <span>Homework Helper</span>
        </div>
        <div className="welcome-copy">
          <p className="eyebrow">Your semester, made workable</p>
          <h1>Plan the work.<br />Protect your time.<br /><em>Learn with context.</em></h1>
          <p>
            A calm workspace that turns deadlines into realistic study blocks, keeps every decision editable,
            and gives you course-aware help without taking over the learning.
          </p>
        </div>
        <div className="welcome-proof" aria-label="Key product principles">
          <span><b>01</b> Explainable priorities</span>
          <span><b>02</b> Nothing schedules silently</span>
          <span><b>03</b> Your data stays yours</span>
        </div>
      </section>
      <section className="welcome-panel" aria-labelledby="setup-title">
        <div className="welcome-form-wrap">
          <span className="setup-kicker">Personal server setup</span>
          <h2 id="setup-title">Create your local owner profile</h2>
          <p>
            This account is stored on this Homework Helper server. External email and Google sign-in can be connected
            when you add production credentials.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onComplete({ displayName, email, ageConfirmed, sample });
            }}
            className="stack-form"
          >
            <label>
              Your name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jordan Lee" autoComplete="name" required />
            </label>
            <label>
              Email address
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jordan@example.com" type="email" autoComplete="email" required />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
              <span>I confirm I am 13 or older.</span>
            </label>
            <label className="check-row subtle-check">
              <input type="checkbox" checked={sample} onChange={(event) => setSample(event.target.checked)} />
              <span>Start with a realistic sample semester I can edit or delete.</span>
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-button full-button" type="submit" disabled={busy}>
              {busy ? "Preparing your workspace…" : "Enter Homework Helper"}
            </button>
          </form>
          <p className="privacy-note">No advertising, public profiles, or competitive leaderboards.</p>
        </div>
      </section>
    </main>
  );
}

export function HomeworkHelperApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [modal, setModal] = useState<ModalKey>(null);
  const [loading, setLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline" | "conflict">("saved");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [hydrated, setHydrated] = useState(false);
  const versionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceTheme = workspace?.profile.theme;
  const reducedMotion = workspace?.profile.reducedMotion;

  const loadWorkspace = useCallback(async (sessionUser: SessionUser, sample = true) => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load your saved workspace.");
    const payload = (await response.json()) as { workspace: WorkspaceSnapshot | null; version: number };
    versionRef.current = payload.version;
    const next = payload.workspace ?? createSeedWorkspace(sessionUser.displayName, sessionUser.email, sample);
    setWorkspace(next);
    setHydrated(true);
    localStorage.setItem("hh_cached_workspace", JSON.stringify(next));
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    const boot = async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) throw new Error("signed-out");
        const payload = (await response.json()) as { user: SessionUser };
        setUser(payload.user);
        localStorage.setItem("hh_cached_user", JSON.stringify(payload.user));
        await loadWorkspace(payload.user);
      } catch (bootError) {
        if (!navigator.onLine) {
          const cachedUser = localStorage.getItem("hh_cached_user");
          const cachedWorkspace = localStorage.getItem("hh_cached_workspace");
          if (cachedUser && cachedWorkspace) {
            setUser(JSON.parse(cachedUser) as SessionUser);
            setWorkspace(JSON.parse(cachedWorkspace) as WorkspaceSnapshot);
            setSaveStatus("offline");
            return;
          }
        }
        if (bootError instanceof Error && bootError.message !== "signed-out") setError(bootError.message);
      } finally {
        setLoading(false);
      }
    };
    void boot();
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [loadWorkspace]);

  const persistWorkspace = useCallback(async (snapshot: WorkspaceSnapshot) => {
    localStorage.setItem("hh_cached_workspace", JSON.stringify(snapshot));
    if (!navigator.onLine) {
      localStorage.setItem("hh_offline_queue", JSON.stringify(snapshot));
      setSaveStatus("offline");
      return;
    }
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace: snapshot, expectedVersion: versionRef.current }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        versionRef.current = payload.version;
        setWorkspace(payload.workspace as WorkspaceSnapshot);
        setSaveStatus("conflict");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Save failed");
      versionRef.current = payload.version;
      localStorage.removeItem("hh_offline_queue");
      setSaveStatus("saved");
    } catch {
      localStorage.setItem("hh_offline_queue", JSON.stringify(snapshot));
      setSaveStatus("offline");
    }
  }, []);

  useEffect(() => {
    if (!workspace || !user || !hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persistWorkspace(workspace), 650);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [workspace, user, hydrated, persistWorkspace]);

  useEffect(() => {
    if (!isOnline || !workspace || !hydrated) return;
    const queued = localStorage.getItem("hh_offline_queue");
    if (!queued) return;
    const replayTimer = window.setTimeout(
      () => void persistWorkspace(JSON.parse(queued) as WorkspaceSnapshot),
      0,
    );
    return () => window.clearTimeout(replayTimer);
  }, [isOnline, workspace, hydrated, persistWorkspace]);

  useEffect(() => {
    if (!workspaceTheme) return;
    const mode = workspaceTheme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : workspaceTheme;
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
  }, [workspaceTheme, reducedMotion]);

  const mutate = useCallback((updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => {
    setWorkspace((current) => current ? { ...updater(current), updatedAt: new Date().toISOString() } : current);
  }, []);

  const handleLogin = async (input: {
    displayName: string;
    email: string;
    ageConfirmed: boolean;
    sample: boolean;
  }) => {
    setLoginBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create the local profile.");
      setUser(payload.user as SessionUser);
      localStorage.setItem("hh_cached_user", JSON.stringify(payload.user));
      await loadWorkspace(payload.user as SessionUser, input.sample);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not create the local profile.");
    } finally {
      setLoginBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setUser(null);
    setWorkspace(null);
    setHydrated(false);
    localStorage.removeItem("hh_cached_user");
  };

  if (loading) {
    return (
      <main className="loading-page" role="status">
        <div className="brand-mark brand-mark-pulse" aria-hidden="true"><span>✓</span></div>
        <p>Opening your workspace…</p>
      </main>
    );
  }

  if (!user || !workspace) {
    return <LoginScreen onComplete={handleLogin} busy={loginBusy} error={error} />;
  }

  const activeAssignments = workspace.assignments.filter((item) => item.status !== "complete");
  const topAssignments = sortAssignmentsByPriority(workspace.assignments).slice(0, 4);
  const todayKey = new Date().toDateString();
  const todayBlocks = workspace.studyBlocks
    .filter((block) => new Date(block.startAt).toDateString() === todayKey && block.status !== "complete")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const dashboardTitle = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><span>✓</span></span>
          <span>Homework<br />Helper</span>
        </div>
        <nav aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setActiveView(item.id)}
              aria-current={activeView === item.id ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.id === "assignments" && activeAssignments.length ? <span className="nav-count">{activeAssignments.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-card">
            <span className={`sync-dot ${saveStatus}`} aria-hidden="true" />
            <div><b>{saveStatus === "saved" ? "All caught up" : saveStatus === "saving" ? "Saving changes" : saveStatus === "conflict" ? "Newer copy loaded" : "Working offline"}</b><small>{isOnline ? "Private server workspace" : "Changes are queued"}</small></div>
          </div>
          <button className="profile-chip" onClick={() => setActiveView("settings")}>
            <span className="avatar">{initials(workspace.profile.displayName)}</span>
            <span><b>{workspace.profile.displayName}</b><small>Student workspace</small></span>
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="topbar-date">{dashboardTitle}</p>
            <p className="topbar-context">{NAV_ITEMS.find((item) => item.id === activeView)?.label}</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button desktop-only" onClick={() => setModal("capture")}>Quick capture</button>
            <button className="primary-button" onClick={() => setModal("assignment")}>+ Add assignment</button>
          </div>
        </header>

        <div className="view-container">
          {activeView === "dashboard" && (
            <DashboardView
              workspace={workspace}
              topAssignments={topAssignments}
              todayBlocks={todayBlocks}
              onNavigate={setActiveView}
              onCapture={() => setModal("capture")}
              onPlan={() => setModal("planner")}
              onComplete={(id) => mutate((current) => ({
                ...current,
                assignments: current.assignments.map((item) => item.id === id ? { ...item, status: "complete", completedAt: new Date().toISOString(), remainingMinutes: 0 } : item),
              }))}
            />
          )}
          {activeView === "assignments" && (
            <AssignmentsView
              workspace={workspace}
              mutate={mutate}
              onAdd={() => setModal("assignment")}
            />
          )}
          {activeView === "classes" && (
            <ClassesView workspace={workspace} mutate={mutate} onAdd={() => setModal("course")} onMaterial={() => setModal("material")} />
          )}
          {activeView === "calendar" && (
            <CalendarView workspace={workspace} mutate={mutate} onAddCommitment={() => setModal("commitment")} onPlan={() => setModal("planner")} />
          )}
          {activeView === "tutor" && <TutorView workspace={workspace} mutate={mutate} />}
          {activeView === "insights" && <InsightsView workspace={workspace} />}
          {activeView === "integrations" && <IntegrationsView workspace={workspace} mutate={mutate} />}
          {activeView === "settings" && <SettingsView workspace={workspace} mutate={mutate} onSignOut={signOut} onDeleted={() => { setUser(null); setWorkspace(null); }} />}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.slice(0, 5).map((item) => (
          <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
            <span>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>

      {modal === "assignment" && <AssignmentModal workspace={workspace} onClose={() => setModal(null)} onSave={(assignment) => { mutate((current) => ({ ...current, assignments: [assignment, ...current.assignments] })); setModal(null); }} />}
      {modal === "course" && <CourseModal onClose={() => setModal(null)} onSave={(course) => { mutate((current) => ({ ...current, courses: [...current.courses, course] })); setModal(null); }} />}
      {modal === "capture" && <CaptureModal workspace={workspace} onClose={() => setModal(null)} onSave={(assignment) => { mutate((current) => ({ ...current, assignments: [assignment, ...current.assignments] })); setModal(null); }} />}
      {modal === "planner" && <PlannerModal workspace={workspace} onClose={() => setModal(null)} onAccept={(proposal) => { mutate((current) => ({ ...current, studyBlocks: [...current.studyBlocks.filter((item) => item.status !== "proposed"), ...proposal.blocks.map((item) => ({ ...item, status: "accepted" as const }))] })); setModal(null); }} />}
      {modal === "commitment" && <CommitmentModal onClose={() => setModal(null)} onSave={(commitment) => { mutate((current) => ({ ...current, commitments: [...current.commitments, commitment] })); setModal(null); }} />}
      {modal === "material" && <MaterialModal workspace={workspace} onClose={() => setModal(null)} onSave={(courseId, material) => { mutate((current) => ({ ...current, courses: current.courses.map((course) => course.id === courseId ? { ...course, materials: [...course.materials, material] } : course) })); setModal(null); }} />}
    </div>
  );
}

function DashboardView({
  workspace,
  topAssignments,
  todayBlocks,
  onNavigate,
  onCapture,
  onPlan,
  onComplete,
}: {
  workspace: WorkspaceSnapshot;
  topAssignments: Assignment[];
  todayBlocks: StudyBlock[];
  onNavigate: (view: ViewKey) => void;
  onCapture: () => void;
  onPlan: () => void;
  onComplete: (id: string) => void;
}) {
  const firstName = workspace.profile.displayName.split(" ")[0];
  const now = new Date();
  const completedThisWeek = workspace.assignments.filter((item) => item.completedAt && now.getTime() - new Date(item.completedAt).getTime() < 7 * 86_400_000).length;
  return (
    <div className="dashboard-view">
      <section className="hero-grid">
        <div className="hero-message">
          <p className="eyebrow">Today’s learning plan</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}.</h1>
          <p>{topAssignments.length ? `You have ${topAssignments.length} priority items in view. Let’s make the next step feel small.` : "Your priority queue is clear. Use the space to get ahead or take a real break."}</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onPlan}>Build my study plan</button>
            <button className="text-button" onClick={onCapture}>Capture something quickly →</button>
          </div>
        </div>
        <div className="day-score-card">
          <span className="score-label">Plan health</span>
          <div className="score-orbit" style={{ "--score": `${Math.max(20, 100 - topAssignments.reduce((sum, item) => sum + Math.max(0, calculatePriority(item).score - 65), 0))}%` } as React.CSSProperties}>
            <strong>{topAssignments.length > 3 ? "Busy" : "Good"}</strong>
            <small>{todayBlocks.reduce((total, item) => total + (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000, 0)} min planned</small>
          </div>
          <p>{completedThisWeek} assignment{completedThisWeek === 1 ? "" : "s"} completed this week</p>
        </div>
      </section>

      <section className="dashboard-columns">
        <div className="panel priority-panel">
          <div className="section-heading">
            <div><p className="eyebrow">What matters next</p><h2>Priority queue</h2></div>
            <button className="text-button" onClick={() => onNavigate("assignments")}>View all</button>
          </div>
          <div className="priority-list">
            {topAssignments.map((assignment, index) => {
              const course = workspace.courses.find((item) => item.id === assignment.courseId);
              const priority = calculatePriority(assignment);
              return (
                <article className="priority-row" key={assignment.id}>
                  <span className="priority-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="course-line" style={{ background: course?.color ?? "#68758a" }} />
                  <div className="priority-main">
                    <div><span className="course-name">{course?.name ?? "Unassigned"}</span><h3>{assignment.title}</h3></div>
                    <div className="priority-meta"><span>Due {formatDate(assignment.dueAt)} · {assignment.remainingMinutes} min left</span><span className={`priority-pill p${Math.ceil(priority.score / 25)}`}>{priority.score} priority</span></div>
                    <small>{priority.summary}</small>
                  </div>
                  <button className="complete-button" onClick={() => onComplete(assignment.id)} aria-label={`Mark ${assignment.title} complete`}>✓</button>
                </article>
              );
            })}
            {!topAssignments.length && <EmptyState title="Your queue is clear" body="Add an assignment or capture a deadline when something new comes in." action="Add an assignment" onAction={() => onNavigate("assignments")} />}
          </div>
        </div>

        <div className="panel agenda-panel">
          <div className="section-heading"><div><p className="eyebrow">Protected time</p><h2>Today’s agenda</h2></div><button className="text-button" onClick={() => onNavigate("calendar")}>Calendar</button></div>
          <div className="agenda-list">
            {todayBlocks.map((block) => {
              const assignment = workspace.assignments.find((item) => item.id === block.assignmentId);
              const course = workspace.courses.find((item) => item.id === assignment?.courseId);
              return (
                <div className="agenda-row" key={block.id}>
                  <span className="agenda-time">{formatTime(block.startAt)}</span>
                  <span className="agenda-bar" style={{ background: course?.color ?? "#68758a" }} />
                  <div><b>{assignment?.title ?? "Study block"}</b><small>{course?.name ?? "Homework Helper"} · {Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000)} min</small></div>
                </div>
              );
            })}
            {!todayBlocks.length && <EmptyState title="No study blocks yet" body="Generate a plan, edit every block, then accept it when it feels right." action="Propose blocks" onAction={onPlan} compact />}
          </div>
          <div className="agenda-rule"><span aria-hidden="true">◷</span><p><b>Your guardrails are active.</b><br />{workspace.profile.maxDailyMinutes} min/day · studies end at {workspace.profile.preferredStudyEnd}</p></div>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, body, action, onAction, compact = false }: { title: string; body: string; action: string; onAction: () => void; compact?: boolean }) {
  return <div className={compact ? "empty-state compact" : "empty-state"}><span aria-hidden="true">○</span><h3>{title}</h3><p>{body}</p><button className="text-button" onClick={onAction}>{action} →</button></div>;
}

function AssignmentsView({ workspace, mutate, onAdd }: { workspace: WorkspaceSnapshot; mutate: (updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => void; onAdd: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "complete" | "all">("active");
  const [focusAssignment, setFocusAssignment] = useState<Assignment | null>(null);
  const visible = workspace.assignments
    .filter((item) => filter === "all" || (filter === "complete" ? item.status === "complete" : item.status !== "complete"))
    .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  const toggleComplete = (id: string) => mutate((current) => ({
    ...current,
    assignments: current.assignments.map((item) => item.id === id
      ? item.status === "complete"
        ? { ...item, status: "todo", completedAt: undefined, remainingMinutes: item.estimatedMinutes }
        : { ...item, status: "complete", completedAt: new Date().toISOString(), remainingMinutes: 0 }
      : item),
  }));

  return (
    <div className="standard-view">
      <section className="view-intro">
        <div><p className="eyebrow">Every deadline, one calm list</p><h1>Assignments</h1><p>Sort by what matters, not by what shouts the loudest.</p></div>
        <button className="primary-button" onClick={onAdd}>+ Add assignment</button>
      </section>
      <div className="toolbar-row">
        <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assignments" aria-label="Search assignments" /></label>
        <div className="segmented-control" aria-label="Assignment filter">
          {(["active", "complete", "all"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>
      </div>
      <section className="assignment-table panel">
        <div className="table-head"><span>Assignment</span><span>Due</span><span>Effort</span><span>Priority</span><span>Status</span><span /></div>
        {visible.map((assignment) => {
          const course = workspace.courses.find((item) => item.id === assignment.courseId);
          const priority = calculatePriority(assignment);
          return (
            <article className={assignment.status === "complete" ? "assignment-item complete" : "assignment-item"} key={assignment.id}>
              <div className="assignment-title-cell"><span className="course-dot" style={{ background: course?.color ?? "#68758a" }} /><div><b>{assignment.title}</b><small>{course?.name ?? "Unassigned"} · {assignment.notes || "No notes"}</small></div></div>
              <span><b>{formatDate(assignment.dueAt, { month: "short", day: "numeric" })}</b><small>{formatTime(assignment.dueAt)}</small></span>
              <span><b>{assignment.remainingMinutes} min</b><small>of {assignment.estimatedMinutes}</small></span>
              <span><b>{priority.score}</b><small>{priority.summary}</small></span>
              <span className={`status-badge ${assignment.status}`}>{assignment.status.replace("-", " ")}</span>
              <div className="row-actions">
                {assignment.status !== "complete" ? <button className="small-button" onClick={() => setFocusAssignment(assignment)}>Focus</button> : null}
                <button className="icon-button" onClick={() => toggleComplete(assignment.id)} aria-label={assignment.status === "complete" ? `Reopen ${assignment.title}` : `Complete ${assignment.title}`}>{assignment.status === "complete" ? "↺" : "✓"}</button>
              </div>
            </article>
          );
        })}
        {!visible.length && <EmptyState title="Nothing matches this view" body="Change the filter or add your next assignment." action="Add assignment" onAction={onAdd} />}
      </section>
      {focusAssignment ? <FocusOverlay assignment={focusAssignment} onClose={() => setFocusAssignment(null)} onFinish={(minutes, reflection) => { mutate((current) => ({
        ...current,
        assignments: current.assignments.map((item) => item.id === focusAssignment.id ? { ...item, status: "in-progress", remainingMinutes: Math.max(0, item.remainingMinutes - minutes), actualMinutes: (item.actualMinutes ?? 0) + minutes } : item),
        focusSessions: [...current.focusSessions, { id: crypto.randomUUID(), assignmentId: focusAssignment.id, startedAt: new Date(Date.now() - minutes * 60_000).toISOString(), endedAt: new Date().toISOString(), plannedMinutes: 25, actualMinutes: minutes, reflection }],
      })); setFocusAssignment(null); }} /> : null}
    </div>
  );
}

function FocusOverlay({ assignment, onClose, onFinish }: { assignment: Assignment; onClose: () => void; onFinish: (minutes: number, reflection: string) => void }) {
  const [totalMinutes, setTotalMinutes] = useState(25);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [reflection, setReflection] = useState("");
  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [running, seconds]);
  useEffect(() => {
    if (seconds !== 0) return;
    const completionTimer = window.setTimeout(() => {
      setRunning(false);
      if ("Notification" in window && Notification.permission === "granted") new Notification("Focus block complete", { body: `Nice work on ${assignment.title}.` });
    }, 0);
    return () => window.clearTimeout(completionTimer);
  }, [seconds, assignment.title]);
  const elapsed = Math.max(1, Math.min(totalMinutes, Math.ceil((totalMinutes * 60 - seconds) / 60)));
  return (
    <div className="focus-overlay" role="dialog" aria-modal="true" aria-labelledby="focus-title">
      <button className="focus-close" onClick={onClose} aria-label="Close focus session">×</button>
      <p className="eyebrow">One thing at a time</p>
      <h2 id="focus-title">{assignment.title}</h2>
      <div className="focus-timer"><span>{String(Math.floor(seconds / 60)).padStart(2, "0")}</span><i>:</i><span>{String(seconds % 60).padStart(2, "0")}</span></div>
      <div className="focus-presets">{[25, 45, 60].map((minutes) => <button key={minutes} className={totalMinutes === minutes ? "active" : ""} onClick={() => { setTotalMinutes(minutes); setSeconds(minutes * 60); setRunning(false); }}>{minutes} min</button>)}</div>
      <button className="primary-button focus-main-button" onClick={() => setRunning((value) => !value)}>{running ? "Pause" : seconds < totalMinutes * 60 ? "Resume" : "Start focus"}</button>
      <label className="focus-reflection">Quick reflection<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What moved forward?" /></label>
      <button className="text-button light-text-button" onClick={() => onFinish(elapsed, reflection)}>Finish and log {elapsed} min</button>
    </div>
  );
}

function ClassesView({ workspace, mutate, onAdd, onMaterial }: { workspace: WorkspaceSnapshot; mutate: (updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => void; onAdd: () => void; onMaterial: () => void }) {
  const [selectedId, setSelectedId] = useState(workspace.courses.find((item) => !item.archived)?.id ?? workspace.courses[0]?.id ?? "");
  const selected = workspace.courses.find((item) => item.id === selectedId);
  return (
    <div className="standard-view">
      <section className="view-intro"><div><p className="eyebrow">Everything stays class-specific</p><h1>Classes</h1><p>Keep schedules, grading rules, materials, and tutoring context together.</p></div><button className="primary-button" onClick={onAdd}>+ Add class</button></section>
      <div className="classes-layout">
        <section className="course-grid">
          {workspace.courses.map((course) => {
            const open = workspace.assignments.filter((item) => item.courseId === course.id && item.status !== "complete").length;
            return <button className={selectedId === course.id ? "course-card selected" : "course-card"} key={course.id} onClick={() => setSelectedId(course.id)} style={{ "--course-color": course.color } as React.CSSProperties}>
              <span className="course-card-code">{course.code || "COURSE"}</span><h2>{course.name}</h2><p>{course.instructor || "Instructor not set"}</p><div><span>{open} open</span><span>{course.materials.length} materials</span></div>{course.archived ? <em>Archived</em> : null}
            </button>;
          })}
          {!workspace.courses.length && <EmptyState title="Create your first class" body="Classes connect assignments, materials, and tutor context." action="Add class" onAction={onAdd} />}
        </section>
        {selected ? <section className="panel class-workspace">
          <div className="class-workspace-head"><span className="large-course-dot" style={{ background: selected.color }} /><div><p className="eyebrow">{selected.term}</p><h2>{selected.name}</h2><p>{selected.schedule} · {selected.instructor}</p></div><button className="ghost-button" onClick={() => mutate((current) => ({ ...current, courses: current.courses.map((course) => course.id === selected.id ? { ...course, archived: !course.archived } : course) }))}>{selected.archived ? "Restore" : "Archive"}</button></div>
          <div className="class-detail-grid"><div><span>Grading setup</span><p>{selected.grading || "Not configured"}</p></div><div><span>Upcoming work</span><p>{workspace.assignments.filter((item) => item.courseId === selected.id && item.status !== "complete").length} assignments</p></div></div>
          <div className="materials-heading"><div><p className="eyebrow">Grounded tutor library</p><h3>Class materials</h3></div><button className="small-button" onClick={onMaterial}>+ Add material</button></div>
          <div className="material-list">
            {selected.materials.map((material) => <article key={material.id}><span>{material.kind === "rubric" ? "R" : material.kind === "syllabus" ? "S" : "N"}</span><div><b>{material.title}</b><p>{material.content}</p></div><button className="icon-button" aria-label={`Delete ${material.title}`} onClick={() => mutate((current) => ({ ...current, courses: current.courses.map((course) => course.id === selected.id ? { ...course, materials: course.materials.filter((item) => item.id !== material.id) } : course) }))}>×</button></article>)}
            {!selected.materials.length && <p className="muted-empty">Add pasted notes, a rubric, syllabus text, or a study guide so tutor answers can cite this class.</p>}
          </div>
        </section> : null}
      </div>
    </div>
  );
}

function CalendarView({ workspace, mutate, onAddCommitment, onPlan }: { workspace: WorkspaceSnapshot; mutate: (updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => void; onAddCommitment: () => void; onPlan: () => void }) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const days = Array.from({ length: mode === "day" ? 1 : 7 }, (_, index) => new Date(weekStart.getTime() + (mode === "day" ? today.getDay() : index) * 86_400_000));
  const blocksFor = (day: Date) => [
    ...workspace.commitments.map((item) => ({ ...item, kind: "commitment" as const })),
    ...workspace.studyBlocks.filter((item) => item.status !== "proposed").map((item) => ({ ...item, title: workspace.assignments.find((assignment) => assignment.id === item.assignmentId)?.title ?? "Study block", color: workspace.courses.find((course) => course.id === workspace.assignments.find((assignment) => assignment.id === item.assignmentId)?.courseId)?.color ?? "#3f7f73", kind: "study" as const })),
  ].filter((item) => new Date(item.startAt).toDateString() === day.toDateString()).sort((a, b) => a.startAt.localeCompare(b.startAt));

  const markBlockComplete = (id: string) => mutate((current) => ({ ...current, studyBlocks: current.studyBlocks.map((item) => item.id === id ? { ...item, status: "complete" } : item) }));
  return (
    <div className="standard-view calendar-page">
      <section className="view-intro"><div><p className="eyebrow">A plan you approve</p><h1>Calendar</h1><p>Commitments stay fixed. Study blocks stay editable.</p></div><div className="button-pair"><button className="ghost-button" onClick={onAddCommitment}>+ Commitment</button><button className="primary-button" onClick={onPlan}>Propose study blocks</button></div></section>
      <div className="calendar-toolbar"><div className="segmented-control">{(["day", "week", "month"] as const).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div><span>{formatDate(weekStart.toISOString(), { month: "long", day: "numeric" })} – {formatDate(new Date(weekStart.getTime() + 6 * 86_400_000).toISOString(), { month: "long", day: "numeric", year: "numeric" })}</span></div>
      {mode !== "month" ? <section className="week-calendar panel" style={{ "--calendar-columns": days.length } as React.CSSProperties}>
        {days.map((day) => <div className={day.toDateString() === today.toDateString() ? "calendar-day today" : "calendar-day"} key={day.toISOString()}><div className="calendar-day-head"><span>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</span><b>{day.getDate()}</b></div><div className="calendar-events">{blocksFor(day).map((item) => <article className={`calendar-event ${item.kind}`} key={item.id} style={{ borderColor: item.color }}><small>{formatTime(item.startAt)} – {formatTime(item.endAt)}</small><b>{item.title}</b>{item.kind === "study" ? <button onClick={() => markBlockComplete(item.id)}>Mark done</button> : <span>Busy time</span>}</article>)}{!blocksFor(day).length && <span className="open-time">Open for planning</span>}</div></div>)}
      </section> : <MonthGrid workspace={workspace} />}
      <div className="calendar-legend"><span><i className="legend-study" />Accepted study block</span><span><i className="legend-busy" />Commitment / busy time</span><span><i className="legend-open" />Available time</span></div>
    </div>
  );
}

function MonthGrid({ workspace }: { workspace: WorkspaceSnapshot }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, index) => new Date(now.getFullYear(), now.getMonth(), index - first.getDay() + 1));
  return <section className="month-grid panel">{days.map((day) => {
    const assignmentCount = workspace.assignments.filter((item) => new Date(item.dueAt).toDateString() === day.toDateString() && item.status !== "complete").length;
    const blockCount = workspace.studyBlocks.filter((item) => new Date(item.startAt).toDateString() === day.toDateString() && item.status === "accepted").length;
    return <div className={day.getMonth() === now.getMonth() ? "month-cell" : "month-cell outside"} key={day.toISOString()}><b>{day.getDate()}</b>{assignmentCount ? <span>{assignmentCount} due</span> : null}{blockCount ? <small>{blockCount} block{blockCount > 1 ? "s" : ""}</small> : null}</div>;
  })}</section>;
}

function TutorView({ workspace, mutate }: { workspace: WorkspaceSnapshot; mutate: (updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => void }) {
  const [courseId, setCourseId] = useState(workspace.courses.find((item) => !item.archived)?.id ?? workspace.courses[0]?.id ?? "");
  const [mode, setMode] = useState<TutorMode>("hint");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const course = workspace.courses.find((item) => item.id === courseId);
  const thread = workspace.tutorThreads.find((item) => item.courseId === courseId);
  const messages = thread?.messages ?? [];
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || !course) return;
    setQuestion("");
    setBusy(true);
    const studentMessage: TutorMessage = { id: crypto.randomUUID(), role: "student", content: prompt, createdAt: new Date().toISOString(), mode };
    const threadId = thread?.id ?? crypto.randomUUID();
    mutate((current) => ({
      ...current,
      tutorThreads: current.tutorThreads.some((item) => item.id === threadId)
        ? current.tutorThreads.map((item) => item.id === threadId ? { ...item, messages: [...item.messages, studentMessage], updatedAt: new Date().toISOString() } : item)
        : [...current.tutorThreads, { id: threadId, courseId, title: prompt.slice(0, 50), messages: [studentMessage], updatedAt: new Date().toISOString() }],
    }));
    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: prompt, courseName: course.name, mode, materials: course.materials, memory: workspace.profile.tutorMemoryEnabled ? workspace.tutorMemory : [] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Tutor unavailable");
      const assistantMessage: TutorMessage = { id: crypto.randomUUID(), role: "assistant", content: payload.answer, createdAt: new Date().toISOString(), mode, citations: payload.citations, provider: payload.provider };
      mutate((current) => ({ ...current, tutorThreads: current.tutorThreads.map((item) => item.id === threadId ? { ...item, messages: [...item.messages, assistantMessage], updatedAt: new Date().toISOString() } : item) }));
    } catch {
      const failure: TutorMessage = { id: crypto.randomUUID(), role: "assistant", content: "I could not reach the tutor service. Your question is saved; try again when the server is online.", createdAt: new Date().toISOString(), mode, provider: "local" };
      mutate((current) => ({ ...current, tutorThreads: current.tutorThreads.map((item) => item.id === threadId ? { ...item, messages: [...item.messages, failure], updatedAt: new Date().toISOString() } : item) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tutor-layout">
      <aside className="tutor-context">
        <p className="eyebrow">Course context</p>
        <h1>Tutor</h1>
        <label>Selected class<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{workspace.courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="tutor-source-card"><span className="large-course-dot" style={{ background: course?.color ?? "#68758a" }} /><div><b>{course?.name ?? "Add a class first"}</b><small>{course?.materials.length ?? 0} source{course?.materials.length === 1 ? "" : "s"} available</small></div></div>
        <p className="context-note">When grounding is requested, the tutor only uses material from this class and shows the sources it received.</p>
        <div className="memory-card"><div><b>Tutor memory</b><span className={workspace.profile.tutorMemoryEnabled ? "status-on" : "status-off"}>{workspace.profile.tutorMemoryEnabled ? "On" : "Off"}</span></div>{workspace.tutorMemory.filter((item) => item.enabled).map((item) => <p key={item.id}><strong>{item.label}</strong>{item.value}</p>)}<button className="text-button" onClick={() => mutate((current) => ({ ...current, profile: { ...current.profile, tutorMemoryEnabled: !current.profile.tutorMemoryEnabled } }))}>{workspace.profile.tutorMemoryEnabled ? "Disable memory" : "Enable memory"}</button></div>
      </aside>
      <section className="tutor-chat panel">
        <div className="tutor-chat-head"><div><p className="eyebrow">Academic support, not autopilot</p><h2>{course ? `Ask about ${course.name}` : "Create a class to begin"}</h2></div><span className="ai-label">AI-assisted / local fallback</span></div>
        <div className="mode-row" aria-label="Tutor response mode">
          {(["hint", "explain", "worked-example", "check-work", "direct-answer"] as TutorMode[]).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item.replace("-", " ")}</button>)}
        </div>
        <div className="message-list" aria-live="polite">
          {!messages.length ? <div className="tutor-welcome"><span>?</span><h3>Start with what feels unclear.</h3><p>Try “Give me a hint for the first step” or “Check whether my reasoning matches the rubric.”</p><div><button onClick={() => setQuestion("Give me a hint for the first step of my highest-priority assignment.")}>Hint for my next step</button><button onClick={() => setQuestion("Quiz me using the selected class materials.")}>Quiz me from my notes</button></div></div> : null}
          {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className="message-label">{message.role === "student" ? "You" : message.provider === "openai" ? "Homework Helper AI" : "Private local study coach"}</div><p>{message.content}</p>{message.citations?.length ? <div className="citation-list"><b>Sources provided to this response</b>{message.citations.map((citation) => <details key={citation.id}><summary>{citation.title}</summary><p>{citation.excerpt}</p></details>)}</div> : null}</article>)}
          {busy ? <article className="message assistant typing" role="status"><span /><span /><span /></article> : null}
        </div>
        <form className="tutor-compose" onSubmit={send}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={course ? "Ask for a hint, explanation, example, or check…" : "Add a class first"} disabled={!course || busy} /><button className="primary-button" type="submit" disabled={!course || busy || !question.trim()}>Send</button><small>AI can be wrong. Check cited materials and your instructor’s guidance.</small></form>
      </section>
    </div>
  );
}

function InsightsView({ workspace }: { workspace: WorkspaceSnapshot }) {
  const totalPlanned = workspace.studyBlocks.filter((item) => item.status !== "proposed").reduce((sum, item) => sum + (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000, 0);
  const totalActual = workspace.focusSessions.reduce((sum, item) => sum + item.actualMinutes, 0);
  const completionRate = workspace.assignments.length ? Math.round(workspace.assignments.filter((item) => item.status === "complete").length / workspace.assignments.length * 100) : 0;
  const byCourse = workspace.courses.map((course) => ({
    course,
    minutes: workspace.focusSessions.reduce((sum, session) => sum + (workspace.assignments.find((item) => item.id === session.assignmentId)?.courseId === course.id ? session.actualMinutes : 0), 0),
  }));
  const maxMinutes = Math.max(60, ...byCourse.map((item) => item.minutes));
  return <div className="standard-view"><section className="view-intro"><div><p className="eyebrow">Patterns, never rankings</p><h1>Insights</h1><p>Use your own trends to adjust the plan. No public scores or comparisons.</p></div></section><section className="metric-grid"><article><span>Completion rate</span><strong>{completionRate}%</strong><small>{workspace.assignments.filter((item) => item.status === "complete").length} of {workspace.assignments.length} finished</small></article><article><span>Planned study time</span><strong>{Math.round(totalPlanned / 60 * 10) / 10}h</strong><small>Accepted calendar blocks</small></article><article><span>Focused time logged</span><strong>{Math.round(totalActual / 60 * 10) / 10}h</strong><small>{workspace.focusSessions.length} focus sessions</small></article><article><span>Plan accuracy</span><strong>{totalPlanned ? Math.min(100, Math.round(totalActual / totalPlanned * 100)) : 0}%</strong><small>Actual versus planned</small></article></section><section className="insight-panels"><div className="panel chart-panel"><div className="section-heading"><div><p className="eyebrow">Course workload</p><h2>Time invested</h2></div></div><div className="bar-chart">{byCourse.map((item) => <div className="bar-row" key={item.course.id}><span>{item.course.name}</span><div><i style={{ width: `${item.minutes / maxMinutes * 100}%`, background: item.course.color }} /></div><b>{item.minutes}m</b></div>)}</div></div><div className="panel insight-note"><p className="eyebrow">Gentle adjustment</p><h2>{workspace.assignments.some((item) => calculatePriority(item).score > 80 && item.status !== "complete") ? "Your next 72 hours look tight." : "Your workload has breathing room."}</h2><p>{workspace.assignments.some((item) => calculatePriority(item).score > 80 && item.status !== "complete") ? "Try generating a fresh plan, then reduce or renegotiate work that cannot fit before its deadline." : "Protect the open time instead of automatically filling it. Rest is part of the plan."}</p><span>Based only on your private workspace data</span></div></section></div>;
}

function IntegrationsView({ workspace, mutate }: { workspace: WorkspaceSnapshot; mutate: (updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const exportIcs = () => {
    const events = [
      ...workspace.commitments.map((item) => ({ id: item.id, title: item.title, startAt: item.startAt, endAt: item.endAt })),
      ...workspace.studyBlocks.filter((item) => item.status === "accepted").map((item) => ({ id: item.id, title: `Homework Helper: ${workspace.assignments.find((assignment) => assignment.id === item.assignmentId)?.title ?? "Study block"}`, startAt: item.startAt, endAt: item.endAt })),
    ];
    const body = events.map((item) => `BEGIN:VEVENT\r\nUID:${item.id}@homework-helper.local\r\nDTSTAMP:${icsDate(new Date().toISOString())}\r\nDTSTART:${icsDate(item.startAt)}\r\nDTEND:${icsDate(item.endAt)}\r\nSUMMARY:${item.title.replaceAll("\n", " ")}\r\nEND:VEVENT`).join("\r\n");
    downloadFile("homework-helper-calendar.ics", `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Homework Helper//EN\r\n${body}\r\nEND:VCALENDAR`, "text/calendar");
  };
  const importIcs = async (file: File) => {
    const text = await file.text();
    const events = text.split("BEGIN:VEVENT").slice(1).map((part): Commitment | null => {
      const summary = part.match(/SUMMARY:(.*)/)?.[1]?.trim() ?? "Imported busy time";
      const start = part.match(/DTSTART[^:]*:(\d{8}T?\d{0,6}Z?)/)?.[1];
      const end = part.match(/DTEND[^:]*:(\d{8}T?\d{0,6}Z?)/)?.[1];
      const parse = (value?: string) => value ? new Date(value.replace(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/, "$1-$2-$3T$4:$5:$6Z")) : null;
      const startDate = parse(start);
      const endDate = parse(end);
      if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
      return { id: crypto.randomUUID(), title: summary, startAt: startDate.toISOString(), endAt: endDate.toISOString(), color: "#68758a", recurrence: "none" };
    }).filter((item): item is Commitment => item !== null);
    mutate((current) => ({ ...current, commitments: [...current.commitments, ...events] }));
  };
  const reminders = async () => {
    if ("Notification" in window) await Notification.requestPermission();
  };
  return <div className="standard-view"><section className="view-intro"><div><p className="eyebrow">You stay in control</p><h1>Integrations</h1><p>Phase A works privately on this server. Import only what you choose.</p></div></section><section className="integration-grid"><article className="integration-card featured"><span className="integration-icon">PC</span><div><span className="status-on">Connected</span><h2>Personal server storage</h2><p>Your profile, courses, plans, and tutor history are saved in the server’s local D1/SQLite database.</p></div></article><article className="integration-card"><span className="integration-icon">ICS</span><div><span className="status-on">Available</span><h2>Calendar files</h2><p>Import outside events as busy time or export accepted study blocks to any calendar app.</p><div className="button-pair"><button className="small-button" onClick={() => fileRef.current?.click()}>Import .ics</button><button className="small-button" onClick={exportIcs}>Export .ics</button></div><input ref={fileRef} hidden type="file" accept=".ics,text/calendar" onChange={(event) => event.target.files?.[0] && void importIcs(event.target.files[0])} /></div></article><article className="integration-card"><span className="integration-icon">N</span><div><span className={typeof Notification !== "undefined" && Notification.permission === "granted" ? "status-on" : "status-neutral"}>Local only</span><h2>Focus reminders</h2><p>Allow this browser to notify you when a running focus block ends. No remote push or email reminders.</p><button className="small-button" onClick={reminders}>Allow reminders</button></div></article>{[
    ["G", "Google Calendar", "Read-only busy time and dedicated Homework Helper calendar sync."],
    ["M", "Microsoft Calendar", "Least-privilege calendar sync with duplicate protection."],
    ["GC", "Google Classroom", "Read-only courses, coursework, due dates, and grades."],
  ].map(([icon, title, body]) => <article className="integration-card future" key={title}><span className="integration-icon">{icon}</span><div><span className="status-neutral">Planned for Phase B</span><h2>{title}</h2><p>{body}</p><button className="small-button" disabled>Not connected</button></div></article>)}</section></div>;
}

function SettingsView({ workspace, mutate, onSignOut, onDeleted }: { workspace: WorkspaceSnapshot; mutate: (updater: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => void; onSignOut: () => void; onDeleted: () => void }) {
  const updateProfile = (field: keyof WorkspaceSnapshot["profile"], value: string | number | boolean) => mutate((current) => ({ ...current, profile: { ...current.profile, [field]: value } }));
  const exportJson = () => downloadFile("homework-helper-data.json", JSON.stringify(workspace, null, 2), "application/json");
  const exportCsv = () => {
    const rows = [["Title", "Course", "Due", "Status", "Estimated minutes", "Actual minutes"], ...workspace.assignments.map((item) => [item.title, workspace.courses.find((course) => course.id === item.courseId)?.name ?? "", item.dueAt, item.status, item.estimatedMinutes, item.actualMinutes ?? 0])];
    downloadFile("homework-helper-assignments.csv", rows.map((row) => row.map(escapeCsv).join(",")).join("\n"), "text/csv");
  };
  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete this local account and all Homework Helper data? This cannot be undone.")) return;
    const response = await fetch("/api/workspace", { method: "DELETE" });
    if (response.ok) { localStorage.removeItem("hh_cached_user"); localStorage.removeItem("hh_cached_workspace"); localStorage.removeItem("hh_offline_queue"); onDeleted(); }
  };
  return <div className="standard-view"><section className="view-intro"><div><p className="eyebrow">Your rules shape the plan</p><h1>Settings</h1><p>Time limits and quiet hours are hard constraints, not suggestions.</p></div><button className="ghost-button" onClick={onSignOut}>Sign out</button></section><div className="settings-layout"><section className="panel settings-section"><div><p className="eyebrow">Student profile</p><h2>About you</h2></div><div className="form-grid"><label>Display name<input value={workspace.profile.displayName} onChange={(event) => updateProfile("displayName", event.target.value)} /></label><label>Email<input value={workspace.profile.email} readOnly /></label><label>Timezone<input value={workspace.profile.timezone} onChange={(event) => updateProfile("timezone", event.target.value)} /></label><label>Theme<select value={workspace.profile.theme} onChange={(event) => updateProfile("theme", event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label></div><label className="check-row"><input type="checkbox" checked={workspace.profile.reducedMotion} onChange={(event) => updateProfile("reducedMotion", event.target.checked)} /><span>Reduce interface motion</span></label></section><section className="panel settings-section"><div><p className="eyebrow">Planning guardrails</p><h2>Study boundaries</h2></div><div className="form-grid"><label>Preferred start<input type="time" value={workspace.profile.preferredStudyStart} onChange={(event) => updateProfile("preferredStudyStart", event.target.value)} /></label><label>Preferred end<input type="time" value={workspace.profile.preferredStudyEnd} onChange={(event) => updateProfile("preferredStudyEnd", event.target.value)} /></label><label>Sleep starts<input type="time" value={workspace.profile.sleepStart} onChange={(event) => updateProfile("sleepStart", event.target.value)} /></label><label>Wake time<input type="time" value={workspace.profile.sleepEnd} onChange={(event) => updateProfile("sleepEnd", event.target.value)} /></label><label>Max study minutes/day<input type="number" min="30" max="600" value={workspace.profile.maxDailyMinutes} onChange={(event) => updateProfile("maxDailyMinutes", Number(event.target.value))} /></label><label>Break between blocks<input type="number" min="5" max="60" value={workspace.profile.breakMinutes} onChange={(event) => updateProfile("breakMinutes", Number(event.target.value))} /></label></div></section><section className="panel settings-section"><div><p className="eyebrow">Tutor memory</p><h2>What the tutor can remember</h2></div>{workspace.tutorMemory.map((item) => <div className="memory-setting" key={item.id}><input value={item.label} onChange={(event) => mutate((current) => ({ ...current, tutorMemory: current.tutorMemory.map((memory) => memory.id === item.id ? { ...memory, label: event.target.value } : memory) }))} /><input value={item.value} onChange={(event) => mutate((current) => ({ ...current, tutorMemory: current.tutorMemory.map((memory) => memory.id === item.id ? { ...memory, value: event.target.value } : memory) }))} /><button className="icon-button" onClick={() => mutate((current) => ({ ...current, tutorMemory: current.tutorMemory.filter((memory) => memory.id !== item.id) }))}>×</button></div>)}<button className="small-button" onClick={() => mutate((current) => ({ ...current, tutorMemory: [...current.tutorMemory, { id: crypto.randomUUID(), label: "Preference", value: "", enabled: true }] }))}>+ Add memory</button></section><section className="panel settings-section data-section"><div><p className="eyebrow">Student-controlled data</p><h2>Export or delete</h2><p>Download complete machine-readable data or a simple assignment table at any time.</p></div><div className="button-pair"><button className="ghost-button" onClick={exportJson}>Export JSON</button><button className="ghost-button" onClick={exportCsv}>Export CSV</button><button className="danger-button" onClick={deleteAccount}>Delete account and data</button></div></section></div></div>;
}

function ModalFrame({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={wide ? "modal-card wide" : "modal-card"} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><p className="eyebrow">{eyebrow}</p><h2 id="modal-title">{title}</h2></div><button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button></div>{children}</section></div>;
}

function AssignmentModal({ workspace, onClose, onSave }: { workspace: WorkspaceSnapshot; onClose: () => void; onSave: (assignment: Assignment) => void }) {
  const tomorrow = new Date(new Date().getTime() + 86_400_000); tomorrow.setHours(23, 59, 0, 0);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(workspace.courses[0]?.id ?? "");
  const [dueAt, setDueAt] = useState(localDateTimeValue(tomorrow.toISOString()));
  const [effort, setEffort] = useState(60);
  const [difficulty, setDifficulty] = useState(3);
  const [confidence, setConfidence] = useState(3);
  const [importance, setImportance] = useState(3);
  const [gradeImpact, setGradeImpact] = useState<Assignment["gradeImpact"]>("medium");
  const [notes, setNotes] = useState("");
  const [milestones, setMilestones] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ id: crypto.randomUUID(), title, courseId, notes, dueAt: new Date(dueAt).toISOString(), estimatedMinutes: effort, remainingMinutes: effort, difficulty, confidence, importance, gradeImpact, status: "todo", milestones: milestones.split("\n").map((item) => item.trim()).filter(Boolean).map((item) => ({ id: crypto.randomUUID(), title: item, complete: false })), createdAt: new Date().toISOString(), source: "manual" });
  };
  return <ModalFrame title="Add an assignment" eyebrow="Capture the details you know" onClose={onClose}><form className="modal-form" onSubmit={submit}><label className="full-span">Assignment title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Research paper draft" autoFocus required /></label><label>Class<select value={courseId} onChange={(event) => setCourseId(event.target.value)} required><option value="" disabled>Add a class first</option>{workspace.courses.filter((item) => !item.archived).map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></label><label>Deadline<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label><label>Estimated minutes<input type="number" min="10" max="3000" step="5" value={effort} onChange={(event) => setEffort(Number(event.target.value))} /></label><label>Grade impact<select value={gradeImpact} onChange={(event) => setGradeImpact(event.target.value as Assignment["gradeImpact"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><RangeField label="Difficulty" value={difficulty} onChange={setDifficulty} low="Easy" high="Hard" /><RangeField label="Confidence" value={confidence} onChange={setConfidence} low="Unsure" high="Ready" /><RangeField label="Importance" value={importance} onChange={setImportance} low="Flexible" high="Critical" /><label className="full-span">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Instructions, links, or context" /></label><label className="full-span">Milestones (one per line)<textarea value={milestones} onChange={(event) => setMilestones(event.target.value)} placeholder={'Choose sources\nDraft outline\nRevise and submit'} /></label><div className="modal-actions full-span"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!courseId}>Save assignment</button></div></form></ModalFrame>;
}

function RangeField({ label, value, onChange, low, high }: { label: string; value: number; onChange: (value: number) => void; low: string; high: string }) {
  return <label className="range-field">{label}<input type="range" min="1" max="5" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span><small>{low}</small><b>{value}/5</b><small>{high}</small></span></label>;
}

function CourseModal({ onClose, onSave }: { onClose: () => void; onSave: (course: Course) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [instructor, setInstructor] = useState("");
  const [term, setTerm] = useState("Fall 2026");
  const [schedule, setSchedule] = useState("");
  const [grading, setGrading] = useState("");
  return <ModalFrame title="Create a class workspace" eyebrow="One place for work and context" onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave({ id: crypto.randomUUID(), name, code, color, instructor, term, schedule, grading, archived: false, materials: [] }); }}><label className="full-span">Class name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Biology" autoFocus required /></label><label>Course code<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="BIOL 1406" /></label><label>Instructor<input value={instructor} onChange={(event) => setInstructor(event.target.value)} placeholder="Dr. Martinez" /></label><label>Term<input value={term} onChange={(event) => setTerm(event.target.value)} /></label><label>Schedule<input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="Tue/Thu 2:00 PM" /></label><label className="full-span">Grading configuration<input value={grading} onChange={(event) => setGrading(event.target.value)} placeholder="Exams 50% · Labs 30% · Homework 20%" /></label><fieldset className="color-picker full-span"><legend>Class color</legend>{COURSE_COLORS.map((item) => <button type="button" aria-label={`Use color ${item}`} className={color === item ? "selected" : ""} style={{ background: item }} key={item} onClick={() => setColor(item)} />)}</fieldset><div className="modal-actions full-span"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Create class</button></div></form></ModalFrame>;
}

function CaptureModal({ workspace, onClose, onSave }: { workspace: WorkspaceSnapshot; onClose: () => void; onSave: (assignment: Assignment) => void }) {
  const [captureMode, setCaptureMode] = useState<"text" | "photo" | "voice">("text");
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<ReturnType<typeof parseCaptureDraft> | null>(null);
  const [listening, setListening] = useState(false);
  const parse = () => setDraft(parseCaptureDraft(raw, workspace.courses));
  const startVoice = () => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognizer;
      webkitSpeechRecognition?: SpeechRecognizer;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { setRaw("Voice recognition is not supported by this browser. Type the assignment details here instead."); return; }
    const recognition = new SpeechRecognition(); recognition.lang = "en-US"; recognition.interimResults = false; recognition.onresult = (event) => setRaw(event.results[0][0].transcript); recognition.onend = () => setListening(false); setListening(true); recognition.start();
  };
  const saveDraft = () => {
    if (!draft) return;
    onSave({ id: crypto.randomUUID(), title: draft.title, courseId: draft.courseId, notes: `Captured from ${captureMode}: ${raw}`, dueAt: draft.dueAt, estimatedMinutes: draft.estimatedMinutes, remainingMinutes: draft.estimatedMinutes, difficulty: 3, confidence: 3, importance: 3, gradeImpact: "medium", status: "todo", milestones: [], createdAt: new Date().toISOString(), source: "capture" });
  };
  return <ModalFrame title="Quick capture" eyebrow="Draft first, confirm before saving" onClose={onClose} wide><div className="capture-tabs">{(["text", "photo", "voice"] as const).map((item) => <button className={captureMode === item ? "active" : ""} key={item} onClick={() => { setCaptureMode(item); setDraft(null); }}>{item === "text" ? "Paste text" : item === "photo" ? "Photo / file" : "Voice"}</button>)}</div><div className="capture-layout"><section><h3>{captureMode === "text" ? "Paste an assignment message" : captureMode === "photo" ? "Choose a photo, then confirm the extracted details" : "Speak the assignment details"}</h3>{captureMode === "photo" ? <label className="upload-zone">Choose a photo or screenshot<input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) setRaw(`${file.name} — add the visible assignment text here before extracting.`); }} /></label> : captureMode === "voice" ? <button className="voice-button" onClick={startVoice}><span className={listening ? "listening" : ""}>●</span>{listening ? "Listening…" : "Start voice capture"}</button> : null}<textarea className="capture-text" value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Chemistry problem set due 8/21, about 90 minutes" /><button className="primary-button" onClick={parse} disabled={!raw.trim()}>Create review draft</button><p className="capture-safety">Files are not saved by this local extractor. Only the confirmed assignment record is stored.</p></section><section className="draft-panel"><p className="eyebrow">Review required</p><h3>Extraction draft</h3>{draft ? <div className="draft-fields"><label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><span>{Math.round(draft.confidence.title * 100)}% confidence</span></label><label>Class<select value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>{workspace.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select><span>{Math.round(draft.confidence.course * 100)}% confidence</span></label><label>Due<input type="datetime-local" value={localDateTimeValue(draft.dueAt)} onChange={(event) => setDraft({ ...draft, dueAt: new Date(event.target.value).toISOString() })} /><span>{Math.round(draft.confidence.dueAt * 100)}% confidence</span></label><label>Effort<input type="number" value={draft.estimatedMinutes} onChange={(event) => setDraft({ ...draft, estimatedMinutes: Number(event.target.value) })} /><span>{Math.round(draft.confidence.effort * 100)}% confidence</span></label><button className="primary-button" onClick={saveDraft} disabled={!draft.courseId}>Confirm and save</button></div> : <div className="draft-placeholder"><span>↗</span><p>Nothing saves automatically. Extract a draft, check each field, then confirm it.</p></div>}</section></div></ModalFrame>;
}

function PlannerModal({ workspace, onClose, onAccept }: { workspace: WorkspaceSnapshot; onClose: () => void; onAccept: (proposal: ScheduleProposal) => void }) {
  const [proposal, setProposal] = useState<ScheduleProposal>(() => proposeSchedule(workspace.assignments, workspace.commitments, workspace.profile));
  const totalMinutes = proposal.blocks.reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
  const editBlock = (id: string, field: "startAt" | "endAt", value: string) => setProposal((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === id ? { ...block, [field]: new Date(value).toISOString() } : block) }));
  return <ModalFrame title="Review your study-block proposal" eyebrow="Nothing changes until you accept" onClose={onClose} wide><div className="proposal-summary"><div><strong>{proposal.blocks.length}</strong><span>editable blocks</span></div><div><strong>{Math.round(totalMinutes / 60 * 10) / 10}h</strong><span>planned</span></div><div><strong>{proposal.unscheduled.length}</strong><span>overload risks</span></div><button className="ghost-button" onClick={() => setProposal(proposeSchedule(workspace.assignments, workspace.commitments, workspace.profile))}>Recalculate</button></div><div className="proposal-list">{proposal.blocks.map((block) => { const assignment = workspace.assignments.find((item) => item.id === block.assignmentId); const course = workspace.courses.find((item) => item.id === assignment?.courseId); return <article key={block.id}><span className="course-line" style={{ background: course?.color ?? "#68758a" }} /><div><b>{assignment?.title}</b><small>{block.reason}</small><div className="proposal-time"><input type="datetime-local" value={localDateTimeValue(block.startAt)} onChange={(event) => editBlock(block.id, "startAt", event.target.value)} /><span>to</span><input type="datetime-local" value={localDateTimeValue(block.endAt)} onChange={(event) => editBlock(block.id, "endAt", event.target.value)} /></div></div><span className="confidence-badge">{block.confidence}% confidence</span><button className="icon-button" onClick={() => setProposal((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))} aria-label="Remove proposed block">×</button></article>; })}{!proposal.blocks.length && <p className="muted-empty">There is no unfinished work with schedulable time remaining.</p>}</div>{proposal.unscheduled.length ? <div className="overload-box"><b>Some work could not fit safely</b>{proposal.unscheduled.map((item) => <p key={item.assignmentId}>{workspace.assignments.find((assignment) => assignment.id === item.assignmentId)?.title}: {item.minutes} min unscheduled. {item.reason}</p>)}</div> : <div className="safe-plan-box">✓ This proposal respects commitments, preferred hours, breaks, and the {workspace.profile.maxDailyMinutes}-minute daily limit.</div>}<div className="modal-actions"><button className="ghost-button" onClick={onClose}>Keep calendar unchanged</button><button className="primary-button" onClick={() => onAccept(proposal)} disabled={!proposal.blocks.length}>Accept {proposal.blocks.length} blocks</button></div></ModalFrame>;
}

function CommitmentModal({ onClose, onSave }: { onClose: () => void; onSave: (commitment: Commitment) => void }) {
  const startDate = new Date(new Date().getTime() + 3_600_000); startDate.setMinutes(0, 0, 0);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(localDateTimeValue(startDate.toISOString()));
  const [endAt, setEndAt] = useState(localDateTimeValue(new Date(startDate.getTime() + 60 * 60_000).toISOString()));
  const [recurrence, setRecurrence] = useState<Commitment["recurrence"]>("none");
  return <ModalFrame title="Add busy time" eyebrow="Protect fixed commitments first" onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave({ id: crypto.randomUUID(), title, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), color: "#68758a", recurrence }); }}><label className="full-span">Commitment<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Work shift" autoFocus required /></label><label>Starts<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></label><label>Ends<input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} required /></label><label>Repeats<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Commitment["recurrence"])}><option value="none">Does not repeat</option><option value="weekly">Weekly</option></select></label><div className="modal-actions full-span"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save busy time</button></div></form></ModalFrame>;
}

function MaterialModal({ workspace, onClose, onSave }: { workspace: WorkspaceSnapshot; onClose: () => void; onSave: (courseId: string, material: CourseMaterial) => void }) {
  const [courseId, setCourseId] = useState(workspace.courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CourseMaterial["kind"]>("note");
  const [content, setContent] = useState("");
  return <ModalFrame title="Add class material" eyebrow="Private source context" onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave(courseId, { id: crypto.randomUUID(), title, kind, content, createdAt: new Date().toISOString() }); }}><label>Class<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{workspace.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></label><label>Material type<select value={kind} onChange={(event) => setKind(event.target.value as CourseMaterial["kind"])}><option value="note">Notes</option><option value="syllabus">Syllabus</option><option value="rubric">Rubric</option><option value="study-guide">Study guide</option><option value="other">Other</option></select></label><label className="full-span">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Unit 2 review guide" required /></label><label className="full-span">Paste material text<textarea className="tall-textarea" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste the section you want the tutor to cite…" required /></label><p className="capture-safety full-span">Only this confirmed text is stored. It stays isolated to the selected class.</p><div className="modal-actions full-span"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!courseId}>Save material</button></div></form></ModalFrame>;
}
