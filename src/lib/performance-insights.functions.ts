import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createOllamaAccessHeaders } from "@/lib/ollama-access";

const unitSchema = z.object({
  id: z.string().regex(/^unit-\d{1,3}$/),
  name: z.string().min(1).max(160),
  assessmentCount: z.number().int().min(1).max(100),
  attemptCount: z.number().int().min(1).max(5000),
  averagePercent: z.number().min(0).max(100),
  latestAveragePercent: z.number().min(0).max(100).nullable(),
  previousAveragePercent: z.number().min(0).max(100).nullable(),
});

const analysisInputSchema = z.object({
  courseName: z.string().min(1).max(160),
  levelName: z.string().min(1).max(160),
  units: z.array(unitSchema).min(1).max(40),
});

const ollamaResponseSchema = z.object({
  message: z.object({ content: z.string() }),
});

const analysisOutputSchema = z.object({
  summary: z.string().min(1).max(600),
  unitInsights: z
    .array(
      z.object({
        unitId: z.string(),
        concern: z.string().min(1).max(300),
        recommendation: z.string().min(1).max(500),
      }),
    )
    .max(40),
});

export const analyzeCatPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(analysisInputSchema)
  .handler(async ({ data, context }) => {
    const { data: isAcademicStaff, error: roleError } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["super_admin", "academic_admin"],
    });
    if (roleError) throw new Error(`Could not verify academic access: ${roleError.message}`);
    if (!isAcademicStaff) throw new Error("Only academic staff can analyze CAT performance.");

    const baseUrl = process.env["OLLAMA_BASE_URL"]?.trim();
    if (!baseUrl) {
      throw new Error(
        "AI analysis is not configured. Set OLLAMA_BASE_URL to the private Ollama server URL.",
      );
    }
    let endpoint: URL;
    try {
      endpoint = new URL(baseUrl);
    } catch {
      throw new Error("OLLAMA_BASE_URL must be a valid private HTTP(S) URL.");
    }
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new Error(
        "OLLAMA_BASE_URL must be a private HTTP(S) URL without embedded credentials.",
      );
    }
    const accessHeaders = createOllamaAccessHeaders(
      process.env["OLLAMA_ACCESS_CLIENT_ID"],
      process.env["OLLAMA_ACCESS_CLIENT_SECRET"],
      endpoint.protocol,
    );

    const unitIds = new Set(data.units.map((unit) => unit.id));
    if (unitIds.size !== data.units.length) {
      throw new Error("Performance data contains duplicate analysis identifiers.");
    }

    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/api/chat`;
    endpoint.search = "";
    endpoint.hash = "";
    const model = process.env["OLLAMA_MODEL"]?.trim() || "qwen2.5:7b";
    const requestBody = {
      model,
      stream: false,
      format: {
        type: "object",
        properties: {
          summary: { type: "string" },
          unitInsights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                unitId: { type: "string" },
                concern: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["unitId", "concern", "recommendation"],
            },
          },
        },
        required: ["summary", "unitInsights"],
      },
      messages: [
        {
          role: "system",
          content:
            "You are an academic performance analyst. Use only the supplied aggregate CAT scores and course-unit labels. Do not invent causes, topics, scores, or facts. Identify comparatively weaker units, note score changes only when prior scores exist, and give specific, practical study or teaching actions. Do not infer topic-level weaknesses from unit labels. Return concise JSON matching the requested schema; use only supplied unit IDs. Do not make pass/fail or high-stakes decisions.",
        },
        {
          role: "user",
          content: JSON.stringify({
            course: data.courseName,
            level: data.levelName,
            units: data.units,
          }),
        },
      ],
      options: { temperature: 0.2, num_predict: 2400 },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...accessHeaders },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        redirect: "error",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Ollama analysis timed out. Check that the model is loaded and try again.");
      }
      throw new Error(
        `Could not connect to Ollama. Check OLLAMA_BASE_URL and that the model server is running${error instanceof Error ? ` (${error.message})` : ""}.`,
      );
    }
    try {
      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}. Check the model server logs.`);
      }

      const responseBody = ollamaResponseSchema.parse(await response.json());
      let rawAnalysis: unknown;
      try {
        rawAnalysis = JSON.parse(responseBody.message.content);
      } catch {
        throw new Error(
          "Ollama returned invalid JSON. Retry the analysis or choose another model.",
        );
      }
      const analysis = analysisOutputSchema.parse(rawAnalysis);
      const returnedUnitIds = new Set(analysis.unitInsights.map((insight) => insight.unitId));
      if (
        returnedUnitIds.size !== analysis.unitInsights.length ||
        analysis.unitInsights.some((insight) => !unitIds.has(insight.unitId))
      ) {
        throw new Error("Ollama returned duplicate or unknown course units.");
      }
      return analysis;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Ollama analysis timed out. Check that the model is loaded and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
