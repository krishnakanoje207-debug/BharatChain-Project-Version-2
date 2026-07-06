import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { formatEther } from "ethers";
import { ApplicationStatus } from "@bharatchain/shared";
import { Application, Notification, Payment, User } from "../entities";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";
import { LlmService } from "./llm.service";
import { BhashiniService } from "./bhashini.service";
import { PLATFORM_KB, PLATFORM_OVERVIEW } from "./knowledge";

interface AssistantContext {
  name: string;
  hasIdentity: boolean;
  applications: { scheme: string; schemeId: number; status: string; reason?: string }[];
  entitlements: { scheme: string; amount: string }[];
  payments: { vendor: string; amount: string; status: string; scheme: string }[];
  notifications: { title: string; body: string }[];
  activeSchemes: { name: string; category: string; installment: string; description?: string }[];
}

export interface ChatResult {
  answer: string;
  provider: string;
  language: string;
  grounded: true;
}

/** Context for the anonymous (not-signed-in) assistant: public catalog only, zero personal data. */
interface PublicContext {
  activeSchemes: { name: string; category: string; installment: string; description?: string }[];
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Application) private readonly applications: Repository<Application>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
    private readonly llm: LlmService,
    private readonly bhashini: BhashiniService,
  ) {}

  /** Starter prompts for the signed-in citizen's chat widget. */
  suggestions(): string[] {
    return [
      "What is the status of my applications?",
      "How much balance do I have and in which schemes?",
      "Which government schemes can I apply for?",
      "Show my recent payments.",
      "Why was my application rejected?",
    ];
  }

  /** Starter prompts for anonymous visitors on the public website. */
  publicSuggestions(): string[] {
    return [
      "What is BharatChain and how does it work?",
      "Which schemes are open right now?",
      "How do I register as a citizen?",
      "How do I become an approved vendor?",
    ];
  }

  /**
   * Answer an anonymous visitor's question. Grounded ONLY in public information —
   * the platform knowledge base and the public scheme catalog. Personal questions
   * get a sign-in invitation; no citizen data is ever loaded on this path.
   */
  async publicChat(message: string, language = "en"): Promise<ChatResult> {
    const ctx = await this.buildPublicContext();

    const llmAnswer = await this.llm.complete(this.publicSystemPrompt(language), this.userPrompt(message, ctx));
    if (llmAnswer) {
      return { answer: llmAnswer, provider: this.llm.activeProvider, language, grounded: true };
    }

    const english = this.simulatedPublicAnswer(message, ctx);
    const answer = await this.bhashini.translate(english, "en", language);
    return { answer, provider: "simulated", language, grounded: true };
  }

  /**
   * Answer a citizen's question, grounded in their OWN data (RAG). Uses a free-tier
   * LLM when configured (responding in the requested language), otherwise a
   * deterministic grounded responder. No hallucinated entitlements — every figure
   * comes from the retrieved context.
   */
  async chat(userId: string, message: string, language = "en"): Promise<ChatResult> {
    const ctx = await this.buildContext(userId);

    const llmAnswer = await this.llm.complete(this.systemPrompt(language), this.userPrompt(message, ctx));
    if (llmAnswer) {
      return { answer: llmAnswer, provider: this.llm.activeProvider, language, grounded: true };
    }

    // No LLM configured/available → deterministic grounded answer, then best-effort translate.
    const english = this.simulatedAnswer(message, ctx);
    const answer = await this.bhashini.translate(english, "en", language);
    return { answer, provider: "simulated", language, grounded: true };
  }

  // ------------------------------------------------------------------ retrieval

  private async buildContext(userId: string): Promise<AssistantContext> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found.");

    const allSchemes = await this.schemes.listFromChain();
    const nameOf = (id: number) => allSchemes.find((s) => s.schemeId === id)?.name ?? `Scheme #${id}`;

    const apps = await this.applications.find({ where: { user: { id: userId } }, order: { createdAt: "DESC" } });
    const applications = apps.map((a) => ({
      scheme: nameOf(a.schemeId),
      schemeId: a.schemeId,
      status: a.status,
      reason: a.rejectionReason,
    }));

    const entitlements: { scheme: string; amount: string }[] = [];
    if (user.chainAddress) {
      for (const a of apps.filter((x) => x.status === ApplicationStatus.APPROVED)) {
        const wei: bigint = await this.chain.paymentRouter.entitlement(a.schemeId, user.chainAddress);
        entitlements.push({ scheme: nameOf(a.schemeId), amount: formatEther(wei) });
      }
    }

    const pays = await this.payments.find({ where: { userId }, order: { createdAt: "DESC" }, take: 8 });
    const payments = pays.map((p) => ({
      vendor: p.vendorName ?? p.vendorAddress,
      amount: formatEther(p.amount),
      status: p.status,
      scheme: nameOf(p.schemeId),
    }));

    const notifs = await this.notifications.find({ where: { userId }, order: { createdAt: "DESC" }, take: 5 });
    const notifications = notifs.map((n) => ({ title: n.title, body: n.body }));

    const activeSchemes = allSchemes
      .filter((s) => s.active)
      .map((s) => ({
        name: s.name,
        category: s.category,
        installment: s.installmentFormatted,
        description: s.description,
      }));

    return {
      name: user.fullName ?? "Citizen",
      hasIdentity: Boolean(user.chainAddress),
      applications,
      entitlements,
      payments,
      notifications,
      activeSchemes,
    };
  }

  /** Public catalog only — used for the anonymous assistant. */
  private async buildPublicContext(): Promise<PublicContext> {
    const allSchemes = await this.schemes.listFromChain();
    return {
      activeSchemes: allSchemes
        .filter((s) => s.active)
        .map((s) => ({
          name: s.name,
          category: s.category,
          installment: s.installmentFormatted,
          description: s.description,
        })),
    };
  }

  // --------------------------------------------------------------------- prompts

  private systemPrompt(language: string): string {
    return [
      "You are the BharatChain Assistant, a helpful guide for citizens using a government welfare-distribution platform (e-Rupee benefits).",
      "You can explain what the platform is and how it works (using the ABOUT section below), and answer questions about THIS citizen using the JSON context.",
      "Never invent balances, statuses, or schemes — those must come from the JSON context. For figures, use only the retrieved data.",
      "If something is outside the ABOUT section and the context, say so and suggest what the citizen can do.",
      "Be concise, warm, and clear. Amounts are in rupees (₹).",
      `Reply in ${this.bhashini.languageName(language)}.`,
      "",
      PLATFORM_OVERVIEW,
    ].join("\n");
  }

  private publicSystemPrompt(language: string): string {
    return [
      "You are the BharatChain Assistant on the PUBLIC website, talking to a visitor who is NOT signed in.",
      "You can explain what the platform is and how it works (using the ABOUT section below), describe the active schemes in the JSON context, and walk visitors through registration — both citizen and vendor.",
      "You have NO access to any personal data. If the visitor asks about their own applications, balances, payments or notifications, invite them to [Sign in](/login) or [Create account](/signup) first — never guess or invent such details.",
      "Never invent schemes or amounts — schemes must come from the JSON context.",
      "When pointing to a page, use markdown links: [Create account](/signup), [Sign in](/login), [Browse schemes](/schemes), [Public ledger](/ledger).",
      "Be concise, warm, and clear. Amounts are in rupees (₹).",
      `Reply in ${this.bhashini.languageName(language)}.`,
      "",
      PLATFORM_OVERVIEW,
    ].join("\n");
  }

  private userPrompt(message: string, ctx: AssistantContext | PublicContext): string {
    return `Citizen question: ${message}\n\nContext (JSON):\n${JSON.stringify(ctx, null, 2)}`;
  }

  // ----------------------------------------------- deterministic grounded answer

  private simulatedAnswer(message: string, ctx: AssistantContext): string {
    const q = message.toLowerCase();
    const has = (...words: string[]) => words.some((w) => q.includes(w));

    if (has("hello", "hi ", "namaste", "hey", "what can you do")) {
      return (
        `Namaste ${ctx.name}! I can explain how BharatChain works — eligibility, payments, delivery, ` +
        `redemption — and answer questions about your own applications, balances, and recent payments. What would you like to know?`
      );
    }

    // Conceptual "how/what/why" questions about the platform → knowledge base.
    const conceptual = has(
      "how", "what is", "what's", "whats", "what are", "what does", "explain",
      "tell me", "guide", " work", "about", "why", "do you", "can i", "is it", "is my",
    );
    if (conceptual) {
      const kb = this.kbAnswer(q);
      if (kb) return kb;
    }

    if (has("status", "application", "applied", "rejected", "approved")) {
      if (ctx.applications.length === 0) {
        return "You have not applied to any scheme yet. Ask me which schemes you can apply for to get started.";
      }
      const lines = ctx.applications.map((a) => {
        const base = `• ${a.scheme}: ${a.status}`;
        return a.status === "REJECTED" && a.reason ? `${base} — reason: ${a.reason}` : base;
      });
      return `Here is the status of your applications:\n${lines.join("\n")}`;
    }

    if (has("balance", "entitlement", "wallet", "money", "how much", "credit")) {
      if (ctx.entitlements.length === 0) {
        return "You have no spendable balance yet. Balances appear here once you are enrolled and an installment is disbursed.";
      }
      const lines = ctx.entitlements.map((e) => `• ${e.scheme}: ₹${e.amount}`);
      const total = ctx.entitlements.reduce((s, e) => s + Number(e.amount), 0);
      return `Your spendable balances:\n${lines.join("\n")}\nTotal: ₹${total}.`;
    }

    if (has("payment", "paid", "spent", "vendor", "history", "transaction")) {
      if (ctx.payments.length === 0) {
        return "You have not made any payments yet. You can pay an approved vendor from your scheme balance in the token app.";
      }
      const lines = ctx.payments.map((p) => `• ₹${p.amount} to ${p.vendor} (${p.scheme}) — ${p.status}`);
      return `Your recent payments:\n${lines.join("\n")}`;
    }

    if (has("scheme", "apply", "eligible", "eligibility", "benefit", "which")) {
      if (ctx.activeSchemes.length === 0) return "There are no active schemes right now. Please check back later.";
      const applied = new Set(ctx.applications.map((a) => a.scheme));
      const open = ctx.activeSchemes.filter((s) => !applied.has(s.name));
      const list = (open.length ? open : ctx.activeSchemes)
        .map((s) => `• ${s.name} (${s.category}) — installment ₹${s.installment}${s.description ? `: ${s.description}` : ""}`)
        .join("\n");
      const note = open.length
        ? "You can apply to these schemes (pick a scheme, then upload your documents to verify eligibility):"
        : "You already have applications for the active schemes. Their details:";
      return `${note}\n${list}`;
    }

    if (has("notification", "alert", "update", "message")) {
      if (ctx.notifications.length === 0) return "You have no notifications right now.";
      return `Your latest updates:\n${ctx.notifications.map((n) => `• ${n.title}: ${n.body}`).join("\n")}`;
    }

    // Last resort: try the knowledge base even without a conceptual cue, then a grounded summary.
    const kb = this.kbAnswer(q);
    if (kb) return kb;

    const parts = [
      `${ctx.applications.length} application(s)`,
      `${ctx.entitlements.length} scheme balance(s)`,
      `${ctx.payments.length} recent payment(s)`,
    ];
    return (
      `I can explain how BharatChain works (eligibility, payments, delivery, redemption) or look up your details. ` +
      `Right now you have ${parts.join(", ")}. ` +
      `Try: "How does payment work?", "What is my application status?", or "Which schemes can I apply for?"`
    );
  }

  /**
   * Deterministic answer for anonymous visitors: platform KB + public scheme
   * catalog only. Personal questions get a sign-in invitation.
   */
  private simulatedPublicAnswer(message: string, ctx: PublicContext): string {
    const q = message.toLowerCase();
    const has = (...words: string[]) => words.some((w) => q.includes(w));

    if (has("hello", "hi ", "namaste", "hey", "what can you do")) {
      return (
        "Namaste! I can explain how BharatChain works — schemes, eligibility, payments, delivery, redemption — " +
        "and how to register as a citizen or an approved vendor. [Sign in](/login) to ask about your own applications and balances."
      );
    }

    // Personal-data questions cannot be answered anonymously → invite sign-in.
    if (
      has(
        "my application", "my balance", "my wallet", "my payment", "my account", "my status",
        "my scheme", "my money", "my notification", "status of my", "am i enrolled", "did i get",
      )
    ) {
      return (
        "I can only see applications, balances and payments after you sign in — nothing personal is available here. " +
        "Please [Sign in](/login) (or [Create account](/signup) if you're new) and ask me again from your dashboard."
      );
    }

    // Login trouble.
    if (has("forgot", "password", "can't log", "cannot log", "log in", "login", "sign in")) {
      return (
        "To sign in, open [Sign in](/login) and use your registered mobile number and password. " +
        "Forgot your password? Reset it with an OTP at [Reset password](/forgot-password). " +
        "New to BharatChain? [Create account](/signup) as a citizen or a vendor."
      );
    }

    const kb = this.kbAnswer(q);
    if (kb) return kb;

    if (has("scheme", "apply", "eligible", "eligibility", "benefit", "which", "active", "open", "available")) {
      if (ctx.activeSchemes.length === 0) return "There are no active schemes right now. Please check back later.";
      const list = ctx.activeSchemes
        .map((s) => `• ${s.name} (${s.category}) — installment ₹${s.installment}${s.description ? `: ${s.description}` : ""}`)
        .join("\n");
      return (
        `These schemes are open right now:\n${list}\n` +
        `See details on [Browse schemes](/schemes). To apply, [Create account](/signup) and apply from your dashboard.`
      );
    }

    return (
      "I can explain how BharatChain works (schemes, eligibility, payments, delivery, redemption) and how to " +
      `register as a citizen or an approved vendor. Try: "Which schemes are open right now?", ` +
      `"How do I register as a citizen?", or "How do I become an approved vendor?"`
    );
  }

  /** Best knowledge-base match for a question by keyword overlap, or null. */
  private kbAnswer(q: string): string | null {
    let best: string | null = null;
    let bestScore = 0;
    for (const entry of PLATFORM_KB) {
      let score = 0;
      for (const k of entry.keywords) if (q.includes(k)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = entry.answer;
      }
    }
    return bestScore > 0 ? best : null;
  }
}
