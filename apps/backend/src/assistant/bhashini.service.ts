import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Indian languages offered by the assistant (Bhashini ISO codes). Mirrors the website's 14 UI languages. */
export const LANGUAGES: Record<string, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  bn: "বাংলা (Bengali)",
  mr: "मराठी (Marathi)",
  te: "తెలుగు (Telugu)",
  ta: "தமிழ் (Tamil)",
  gu: "ગુજરાતી (Gujarati)",
  ur: "اردو (Urdu)",
  kn: "ಕನ್ನಡ (Kannada)",
  or: "ଓଡ଼ିଆ (Odia)",
  ml: "മലയാളം (Malayalam)",
  pa: "ਪੰਜਾਬੀ (Punjabi)",
  as: "অসমীয়া (Assamese)",
  mai: "मैथिली (Maithili)",
};

/**
 * Bhashini (national multilingual stack) hooks — translation + ASR/TTS. Best-effort:
 * real ULCA calls when BHASHINI creds are configured, otherwise simulated/passthrough
 * so the $0/no-keys demo runs. Real audio capture/playback is the frontend's job
 * (Phase 8); here we orchestrate the translate step and expose the voice pipeline shape.
 */
@Injectable()
export class BhashiniService {
  private readonly logger = new Logger(BhashiniService.name);
  private readonly userId?: string;
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.userId = config.get<string>("BHASHINI_USER_ID") || undefined;
    this.apiKey = config.get<string>("BHASHINI_API_KEY") || undefined;
  }

  get available(): boolean {
    return Boolean(this.userId && this.apiKey);
  }

  isSupported(lang: string): boolean {
    return lang in LANGUAGES;
  }

  languageName(lang: string): string {
    return LANGUAGES[lang] ?? lang;
  }

  /**
   * Translate text between Indian languages. Returns the input unchanged when
   * source == target or when Bhashini is not configured (simulated).
   */
  async translate(text: string, from: string, to: string): Promise<string> {
    if (from === to || !text.trim()) return text;
    if (!this.available) return text; // simulated passthrough
    try {
      // Bhashini ULCA NMT pipeline (only when credentials are present).
      const res = await fetch("https://dhruva-api.bhashini.gov.in/services/inference/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: this.apiKey as string },
        body: JSON.stringify({
          pipelineTasks: [
            { taskType: "translation", config: { language: { sourceLanguage: from, targetLanguage: to } } },
          ],
          inputData: { input: [{ source: text }] },
        }),
      });
      if (!res.ok) throw new Error(`bhashini ${res.status}`);
      const json = (await res.json()) as { pipelineResponse: { output: { target: string }[] }[] };
      return json.pipelineResponse[0].output[0].target;
    } catch (err) {
      this.logger.warn(`Bhashini translate failed (passthrough): ${(err as Error).message}`);
      return text;
    }
  }
}
