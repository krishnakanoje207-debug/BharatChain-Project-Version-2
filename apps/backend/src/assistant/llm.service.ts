import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Pluggable free-tier LLM client. Uses whichever provider has credentials
 * configured (Groq → Gemini → Ollama), honouring LLM_PROVIDER as a preference.
 * If none is available it returns null so the caller falls back to the
 * deterministic grounded responder — keeping the $0/no-keys demo fully working.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly groqKey?: string;
  private readonly geminiKey?: string;
  private readonly ollamaUrl?: string;
  private readonly ollamaModel: string;
  private readonly preference: string;

  constructor(config: ConfigService) {
    this.groqKey = config.get<string>("GROQ_API_KEY") || undefined;
    this.geminiKey = config.get<string>("GEMINI_API_KEY") || undefined;
    this.ollamaUrl = config.get<string>("OLLAMA_URL") || undefined;
    // Defaults to the sovereign model built from ai-model/ (Modelfile or QLoRA export).
    this.ollamaModel = config.get<string>("OLLAMA_MODEL") || "bharatchain-assistant";
    this.preference = config.get<string>("LLM_PROVIDER", "groq");
  }

  /** The provider that will actually be used, or "simulated" if none is configured. */
  get activeProvider(): string {
    for (const p of this.providerOrder()) {
      if (p === "groq" && this.groqKey) return "groq";
      if (p === "gemini" && this.geminiKey) return "gemini";
      if (p === "ollama" && this.ollamaUrl) return "ollama";
    }
    return "simulated";
  }

  private providerOrder(): string[] {
    return [...new Set([this.preference, "groq", "gemini", "ollama"])];
  }

  /** Returns the model's answer, or null to signal the simulated fallback. */
  async complete(system: string, user: string): Promise<string | null> {
    const provider = this.activeProvider;
    try {
      if (provider === "groq") return await this.groq(system, user);
      if (provider === "gemini") return await this.gemini(system, user);
      if (provider === "ollama") return await this.ollama(system, user);
    } catch (err) {
      this.logger.warn(`LLM (${provider}) failed, using simulated answer: ${(err as Error).message}`);
    }
    return null;
  }

  private async groq(system: string, user: string): Promise<string> {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.groqKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`groq ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0].message.content.trim();
  }

  private async gemini(system: string, user: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const json = (await res.json()) as { candidates: { content: { parts: { text: string }[] } }[] };
    return json.candidates[0].content.parts.map((p) => p.text).join("").trim();
  }

  private async ollama(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.ollamaModel,
        system,
        prompt: user,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const json = (await res.json()) as { response: string };
    return json.response.trim();
  }
}
