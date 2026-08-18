import { getRuntimeEnv, getSession } from "@/db/workspace-store";
import type { CourseMaterial, TutorMemoryItem, TutorMode } from "@/app/lib/types";

export const dynamic = "force-dynamic";

type TutorInput = {
  question?: string;
  courseName?: string;
  mode?: TutorMode;
  materials?: CourseMaterial[];
  memory?: TutorMemoryItem[];
};

function localTutor(input: Required<Pick<TutorInput, "question" | "courseName" | "mode">> & TutorInput) {
  const words = new Set(input.question.toLowerCase().split(/\W+/).filter((word) => word.length > 3));
  const ranked = [...(input.materials ?? [])]
    .map((material) => ({
      material,
      score: material.content
        .toLowerCase()
        .split(/\W+/)
        .reduce((total, word) => total + (words.has(word) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const source = ranked[0]?.material;
  const sourceIdea = source?.content.split(/(?<=[.!?])\s+/)[0];
  const modeLead = {
    hint: "Here is a nudge without giving away the whole solution:",
    explain: "Let’s make the idea concrete:",
    "worked-example": "Here is a parallel worked example you can adapt:",
    "check-work": "Use this check to audit your work step by step:",
    "direct-answer": "Here is a direct response, followed by the reasoning you should verify:",
  }[input.mode];
  const grounded = sourceIdea
    ? `${sourceIdea} [1]`
    : "No matching class material was available, so this response uses general study guidance and should be checked against your course resources.";
  return {
    answer: `${modeLead}\n\n${grounded}\n\nFor “${input.question}”, first name what is known, what is being asked, and the rule or evidence that connects them. Then do one step at a time and explain why that step is valid. If you share your next step, I can check it without taking over the assignment.`,
    provider: "local" as const,
    citations: ranked.map(({ material }, index) => ({
      id: material.id,
      title: `${index + 1}. ${material.title}`,
      excerpt: material.content.slice(0, 220),
    })),
  };
}

function outputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown[] }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((item) => (item && typeof item === "object" ? (item as { text?: unknown }).text : ""))
    .filter((item): item is string => typeof item === "string")
    .join("\n");
}

export async function POST(request: Request) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const input = (await request.json()) as TutorInput;
  const question = input.question?.trim() ?? "";
  const courseName = input.courseName?.trim() || "this class";
  const mode = input.mode ?? "hint";
  if (!question || question.length > 4_000) {
    return Response.json({ error: "Enter a question under 4,000 characters." }, { status: 400 });
  }

  const fallback = localTutor({ ...input, question, courseName, mode });
  const runtime = getRuntimeEnv();
  if (!runtime.OPENAI_API_KEY) return Response.json(fallback);

  const materials = (input.materials ?? []).slice(0, 8);
  const sourceText = materials
    .map((item, index) => `[${index + 1}] ${item.title}\n${item.content.slice(0, 6_000)}`)
    .join("\n\n");
  const memory = (input.memory ?? [])
    .filter((item) => item.enabled)
    .map((item) => `${item.label}: ${item.value}`)
    .join("; ");
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: runtime.OPENAI_MODEL || "gpt-5.6-terra",
        instructions: `You are an academic-integrity-minded tutor for ${courseName}. Tutor mode: ${mode}. Clearly label uncertainty. When class materials are supplied, ground factual claims only in them and cite with bracketed source numbers like [1]. Do not claim to have checked a source you did not receive. Adapt to this optional student preference: ${memory || "none supplied"}.`,
        input: `Student question:\n${question}\n\nSelected class materials:\n${sourceText || "No class materials supplied."}`,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with ${response.status}`);
    const payload = await response.json();
    const answer = outputText(payload);
    if (!answer) throw new Error("OpenAI returned no text output");
    return Response.json({
      answer,
      provider: "openai",
      citations: materials.map((material, index) => ({
        id: material.id,
        title: `${index + 1}. ${material.title}`,
        excerpt: material.content.slice(0, 220),
      })),
    });
  } catch {
    return Response.json({ ...fallback, notice: "The configured AI provider was unavailable, so the private local study coach answered instead." });
  }
}
