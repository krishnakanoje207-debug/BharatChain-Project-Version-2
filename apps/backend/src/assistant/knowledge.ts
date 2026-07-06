/**
 * BharatChain platform knowledge base for the assistant. Used two ways:
 *  - injected into the LLM system prompt (PLATFORM_OVERVIEW) so real-model answers
 *    about the platform are accurate and grounded, not hallucinated;
 *  - keyword-matched by the deterministic responder (PLATFORM_KB) so the $0/no-LLM
 *    demo can still explain what the site is and how it works.
 * Content reflects how the system actually behaves (no PII on-chain, ZK eligibility,
 * category-gated payments, proof-of-delivery, RBI redemption).
 */

export interface KbEntry {
  id: string;
  keywords: string[];
  answer: string;
}

export const PLATFORM_KB: KbEntry[] = [
  {
    id: "about",
    keywords: ["what is bharatchain", "what is this", "about this", "this website", "this platform", "what does this", "purpose of", "what's this"],
    answer:
      "BharatChain is a blockchain-based welfare-distribution platform that delivers government benefits transparently and corruption-free. Government funds flow RBI → citizens → approved vendors → back to cash, but on-chain every rupee moves only as a digital-rupee token (e₹), so every step is publicly auditable. You apply to a scheme, prove eligibility privately, receive benefits to your account, and spend them only at approved vendors for that scheme.",
  },
  {
    id: "how-it-works",
    keywords: ["how does it work", "how it works", "how does this work", "overall process", "the process", "the steps", "the flow", "end to end"],
    answer:
      "The journey: 1) sign up with phone + OTP; 2) pick a scheme and submit your document IDs; 3) your eligibility is checked against the government registry and confirmed with a zero-knowledge proof; 4) you're enrolled on-chain; 5) the government disburses installments to your scheme balance; 6) you pay approved, category-matched vendors from that balance; 7) you confirm delivery; 8) the vendor redeems delivered payments to cash after an RBI check.",
  },
  {
    id: "e-rupee",
    keywords: ["e-rupee", "e₹", "erupee", "digital rupee", "what is the token", "what currency", "what money", "digital currency"],
    answer:
      "e₹ is a digital rupee where 1 e₹ = ₹1. It is transfer-restricted: you can only spend it at approved vendors whose category matches your scheme, through the app — there is no free person-to-person transfer. This guarantees welfare money is used only for its intended purpose.",
  },
  {
    id: "apply",
    keywords: ["how to apply", "how do i apply", "how can i apply", "applying", "eligibility", "am i eligible", "qualify", "verify my documents", "document"],
    answer:
      "To apply: choose a scheme, then submit your document IDs (e.g. PAN, Kissan card, land record). They are matched against the fixed government registry, and a zero-knowledge proof confirms you qualify WITHOUT exposing your personal details. If eligible, you're enrolled on-chain. You cannot apply twice to the same scheme.",
  },
  {
    id: "register-citizen",
    keywords: [
      "register", "registration", "sign up", "signup", "create account", "create an account",
      "open account", "new account", "how do i join", "how to join", "get started", "enroll myself",
      "register as a citizen", "citizen account",
    ],
    answer:
      "Registering as a citizen is free and takes a minute:\n" +
      "1. Open [Create account](/signup) and choose **Citizen**.\n" +
      "2. Enter your name and mobile number, set a password.\n" +
      "3. Verify the OTP sent to your phone — your account is ready.\n" +
      "4. [Sign in](/login), open **Apply** in your dashboard, pick a scheme and submit your document IDs (e.g. PAN, Kissan card, land record). Eligibility is confirmed privately with a zero-knowledge proof, and once enrolled your installments arrive in your scheme balance.",
  },
  {
    id: "register-vendor",
    keywords: [
      "become a vendor", "become an approved vendor", "vendor registration", "register as a vendor",
      "register my shop", "register my business", "vendor account", "sell", "my shop", "my store",
      "accept payments", "vendor signup", "vendor sign up", "join as vendor", "merchant", "shopkeeper",
    ],
    answer:
      "Any legitimate business can become an approved BharatChain vendor:\n" +
      "1. Open [Create account](/signup) and choose **Vendor**, then verify your phone with the OTP.\n" +
      "2. [Sign in](/login) — you'll land in the vendor portal. Open **Enrollment** and submit your business details: business name, registration/licence ID, category (e.g. agriculture, education, housing) and city.\n" +
      "3. Your business is checked against the government vendor registry with a zero-knowledge proof, and the government reviews the application.\n" +
      "4. On approval you are enrolled on-chain and can accept e₹ payments from citizens in your category's schemes. Delivered payments are redeemable to your bank after an RBI check.",
  },
  {
    id: "payment",
    keywords: ["how does payment", "how do payments", "how do i pay", "how to pay", "how payment works", "pay a vendor", "spend my", "use my balance", "make a payment"],
    answer:
      "Payments are category-gated. From your scheme balance you pay an approved vendor whose category matches the scheme — for example an agriculture scheme pays only approved agri-input shops. You hold no crypto keys: a secure server-side relayer moves the e₹ on your behalf. After you receive the goods or service, you confirm delivery.",
  },
  {
    id: "delivery",
    keywords: ["confirm delivery", "proof of delivery", "delivered", "after i pay", "after paying", "receive the goods", "delivery work"],
    answer:
      "After paying, you confirm delivery once you've received the goods or service. Only delivered (citizen-confirmed) payments become redeemable by the vendor. This proof-of-delivery step blocks fake transactions and ensures value really reached you.",
  },
  {
    id: "redemption",
    keywords: ["redeem", "redemption", "vendor get paid", "vendor get money", "vendor cash", "how vendors", "cash out", "convert to cash", "itr"],
    answer:
      "Vendors redeem only delivered payments. A vendor files a redemption request; the RBI reviews the vendor's legitimacy (ITR / tax filing) and, on approval, the e₹ is burned and a bank payout is issued. Undelivered or unverified value cannot be redeemed.",
  },
  {
    id: "disbursal",
    keywords: ["disbursal", "disburse", "installment", "when do i get", "when will i receive", "how am i credited", "how do i receive money", "get the money"],
    answer:
      "The government opens an installment for a scheme and credits each eligible beneficiary their installment amount to their scheme balance — drawing the money down from the scheme's fund. You receive a notification whenever an installment is disbursed to you.",
  },
  {
    id: "privacy",
    keywords: ["privacy", "is it secure", "is it safe", "security", "my data safe", "personal data", "personal information", "is my data", "data protected", "steal my data", "hack", "private"],
    answer:
      "Your personal data never goes on the blockchain — only cryptographic commitments and one-time nullifiers do. Eligibility uses zero-knowledge proofs, so you prove you qualify without revealing your details. You hold no keys; a secure server-side relayer acts for you, and sensitive records stay in access-controlled databases. The platform can also run entirely on government-hosted AI models so no data leaves national infrastructure.",
  },
  {
    id: "anti-corruption",
    keywords: ["corruption", "fraud", "transparent", "transparency", "audit", "anomaly", "how does it stop", "prevent fraud", "tamper"],
    answer:
      "Every transaction is recorded on a tamper-evident, publicly auditable ledger, so funds can be traced end-to-end. An automated monitor also flags suspicious patterns — for example one vendor receiving payments from an abnormal number of citizens, or a sudden burst of payments — and surfaces them to the government's oversight teams. Together these make diversion of welfare funds very hard to hide.",
  },
  {
    id: "roles",
    keywords: ["who can use", "who uses", "what roles", "vendor account", "what is admin", "what is rbi", "different users", "types of users", "types of accounts", "kinds of users", "become a vendor"],
    answer:
      "BharatChain has two kinds of accounts: citizens, who apply for schemes and receive benefits, and vendors — government-approved businesses that accept category-matched payments. Scheme administration, vendor approval and redemption oversight are carried out internally by the government and the Reserve Bank as part of the platform's controls.",
  },
  {
    id: "assistant",
    keywords: ["who are you", "what are you", "what can you do", "help me", "what do you do", "which languages", "speak hindi", "speak tamil"],
    answer:
      "I'm the BharatChain Assistant. I can explain what this platform is and how it works (eligibility, payments, delivery, redemption), and answer questions about your own applications, balances, and payments. I can reply in several Indian languages.",
  },
];

/** Compact platform summary injected into the LLM system prompt for grounded explanations. */
export const PLATFORM_OVERVIEW = [
  "ABOUT BHARATCHAIN (use this to explain the platform; do not contradict it):",
  "- Purpose: transparent, corruption-free distribution of government welfare. Funds flow RBI → citizens → approved vendors → back to cash; on-chain value moves only as a digital-rupee token e₹ (1 e₹ = ₹1).",
  "- Register (citizen): create an account at /signup choosing Citizen (name + phone + password, OTP-verified), sign in at /login, then apply from the dashboard.",
  "- Register (vendor): create an account at /signup choosing Vendor, verify OTP, sign in, then submit business details (name, licence ID, category, city) under Enrollment; a ZK vendor-registry check + government approval enrolls the business on-chain.",
  "- Accounts: the platform's public account types are CITIZEN and VENDOR only. Scheme administration and redemption oversight are internal government/RBI functions — NEVER describe them as user roles, accounts, portals, or sign-in options, and never explain how they are accessed.",
  "- Apply: pick a scheme, submit document IDs (PAN/Kissan/land); eligibility is matched against a fixed government registry and confirmed by a zero-knowledge proof (no personal data revealed). One application per scheme; enrolment is recorded on-chain.",
  "- When helpful, give links as markdown: [Create account](/signup), [Sign in](/login), [Browse schemes](/schemes), [Public ledger](/ledger).",
  "- Disbursal: government opens installments and credits eligible citizens' scheme balances, drawing down the scheme fund.",
  "- Payments: category-gated — a citizen pays only approved vendors whose category matches the scheme. Citizens are keyless; a server-side relayer signs. e₹ is transfer-restricted (no peer-to-peer).",
  "- Proof-of-delivery: the citizen confirms receipt; only delivered payments are redeemable.",
  "- Redemption: vendor requests redemption of delivered value; RBI checks legitimacy (ITR) and approves → e₹ burned + simulated bank payout.",
  "- Privacy/security: no PII on-chain (only commitments/nullifiers); ZK eligibility; access-controlled off-chain ledgers; public ledger + automated fraud/anomaly monitoring. Can run on self-hosted/sovereign AI models so data stays on national infrastructure.",
].join("\n");
