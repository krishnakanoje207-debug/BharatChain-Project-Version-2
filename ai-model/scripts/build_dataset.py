#!/usr/bin/env python3
"""
Build the BharatChain instruction-tuning dataset (chat format) for fine-tuning a
self-hosted assistant model.

Three kinds of examples:
  1. KNOWLEDGE   - platform Q&A from data/seed_knowledge.json (one per paraphrase).
  2. GROUNDED    - synthetic citizen contexts (NO real PII) injected as JSON in the
                   user turn, exactly like the backend's RAG prompt, teaching the
                   model to answer from provided context and never invent figures.
  3. VISITOR     - anonymous public-website contexts (activeSchemes only, no personal
                   fields): personal questions must get a sign-in invitation, scheme
                   questions answer from the public catalog with markdown links.

Output: data/bharatchain-instruct.jsonl  (one JSON object per line)
  {"messages":[{"role":"system",...},{"role":"user",...},{"role":"assistant",...}]}

Pure standard library — no external packages needed to build the data.
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

SYSTEM = open(os.path.join(DATA, "system_prompt.txt"), encoding="utf-8").read().strip()
SEED = json.load(open(os.path.join(DATA, "seed_knowledge.json"), encoding="utf-8"))

NAMES = ["Ramesh", "Sunita", "Arjun", "Lakshmi", "Vijay", "Anita", "Mahesh", "Pooja",
         "Ravi", "Geeta", "Suresh", "Kavita", "Manoj", "Deepa", "Rajesh", "Sita"]
SCHEMES = [
    {"name": "PM-Kisan Samman Nidhi", "category": "AGRICULTURE", "installment": "10000.0",
     "description": "Income support for eligible farmer families, redeemable at approved agri-input vendors."},
    {"name": "Vidya Lakshmi Scholarship", "category": "EDUCATION", "installment": "50000.0",
     "description": "Scholarship support for students, redeemable at approved institutions and tech stores."},
    {"name": "PM Awas Yojana", "category": "HOUSING", "installment": "50000.0",
     "description": "Housing assistance, redeemable at approved building-material suppliers."},
]
VENDORS = ["Krishi Seva Kendra", "Annapurna Agri Inputs", "Bharat Institute of Technology",
           "DigiBharat Tech Store", "Shakti Cement & Building Materials"]


def msg(system, user, assistant):
    return {"messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
        {"role": "assistant", "content": assistant},
    ]}


def ctx_prompt(question, context):
    return f"Citizen question: {question}\n\nContext (JSON):\n{json.dumps(context, ensure_ascii=False, indent=2)}"


def base_context(name, hasIdentity=True):
    return {"name": name, "hasIdentity": hasIdentity, "applications": [], "entitlements": [],
            "payments": [], "notifications": [],
            "activeSchemes": [{"name": s["name"], "category": s["category"],
                               "installment": s["installment"], "description": s["description"]}
                              for s in SCHEMES]}


def knowledge_examples():
    out = []
    for entry in SEED:
        for q in entry["questions"]:
            out.append(msg(SYSTEM, q, entry["answer"]))
    return out


def grounded_examples(rng, n_per_intent=18):
    out = []

    # status
    status_qs = ["What is the status of my applications?", "Are my applications approved?",
                 "Show my application status.", "Did my application get accepted?"]
    for _ in range(n_per_intent):
        name = rng.choice(NAMES)
        ctx = base_context(name)
        chosen = rng.sample(SCHEMES, rng.randint(1, 2))
        lines = []
        for s in chosen:
            st = rng.choice(["APPROVED", "PENDING", "REJECTED"])
            app = {"scheme": s["name"], "schemeId": SCHEMES.index(s), "status": st}
            if st == "REJECTED":
                app["reason"] = "You are not eligible for this scheme based on government records."
            ctx["applications"].append(app)
            base = f"• {s['name']}: {st}"
            lines.append(base + (f" — reason: {app['reason']}" if st == "REJECTED" else ""))
        ans = "Here is the status of your applications:\n" + "\n".join(lines)
        out.append(msg(SYSTEM, ctx_prompt(rng.choice(status_qs), ctx), ans))

    # balance / entitlement
    bal_qs = ["How much balance do I have?", "What is my entitlement?",
              "How much money is in my account and in which scheme?", "Show my wallet balance."]
    for _ in range(n_per_intent):
        name = rng.choice(NAMES)
        ctx = base_context(name)
        chosen = rng.sample(SCHEMES, rng.randint(1, 2))
        total = 0.0
        lines = []
        for s in chosen:
            amt = float(rng.choice([2000, 3500, 5000, 6500, 8000, 10000]))
            ctx["entitlements"].append({"scheme": s["name"], "amount": str(amt)})
            ctx["applications"].append({"scheme": s["name"], "schemeId": SCHEMES.index(s), "status": "APPROVED"})
            total += amt
            lines.append(f"• {s['name']}: ₹{amt}")
        ans = "Your spendable balances:\n" + "\n".join(lines) + f"\nTotal: ₹{total}."
        out.append(msg(SYSTEM, ctx_prompt(rng.choice(bal_qs), ctx), ans))

    # payments
    pay_qs = ["Show my recent payments.", "What have I spent?", "List my payment history.",
              "Where did my money go?"]
    for _ in range(n_per_intent):
        name = rng.choice(NAMES)
        ctx = base_context(name)
        s = rng.choice(SCHEMES)
        lines = []
        for _ in range(rng.randint(1, 3)):
            amt = float(rng.choice([1000, 1500, 2000, 3500]))
            v = rng.choice(VENDORS)
            st = rng.choice(["PAID", "DELIVERED"])
            ctx["payments"].append({"vendor": v, "amount": str(amt), "status": st, "scheme": s["name"]})
            lines.append(f"• ₹{amt} to {v} ({s['name']}) — {st}")
        ans = "Your recent payments:\n" + "\n".join(lines)
        out.append(msg(SYSTEM, ctx_prompt(rng.choice(pay_qs), ctx), ans))

    # eligibility / which schemes
    elig_qs = ["Which schemes can I apply for?", "What government schemes are available?",
               "What can I apply to?", "Show me the schemes."]
    for _ in range(n_per_intent):
        name = rng.choice(NAMES)
        ctx = base_context(name)
        lines = [f"• {s['name']} ({s['category']}) — installment ₹{s['installment']}: {s['description']}"
                 for s in SCHEMES]
        ans = ("You can apply to these schemes (pick a scheme, then upload your documents to verify "
               "eligibility):\n" + "\n".join(lines))
        out.append(msg(SYSTEM, ctx_prompt(rng.choice(elig_qs), ctx), ans))

    # cold-start (no data)
    cold_qs = ["What is the status of my applications?", "How much balance do I have?"]
    for q in cold_qs:
        ctx = base_context(rng.choice(NAMES))
        if "status" in q:
            ans = "You have not applied to any scheme yet. Ask me which schemes you can apply for to get started."
        else:
            ans = "You have no spendable balance yet. Balances appear here once you are enrolled and an installment is disbursed."
        out.append(msg(SYSTEM, ctx_prompt(q, ctx), ans))

    return out


def public_context():
    """VISITOR mode — what the backend sends for anonymous public-website chat."""
    return {"activeSchemes": [{"name": s["name"], "category": s["category"],
                               "installment": s["installment"], "description": s["description"]}
                              for s in SCHEMES]}


def visitor_examples(rng, n_personal=24, n_schemes=10):
    out = []
    ctx = public_context()

    # Personal questions while anonymous -> sign-in invitation, never data.
    personal_qs = [
        "What is the status of my applications?", "How much balance do I have?",
        "Show my recent payments.", "Am I enrolled in PM-Kisan?", "Why was my application rejected?",
        "Show my notifications.", "How much money is in my wallet?", "Did I get this month's installment?",
    ]
    invite = ("I can only see applications, balances and payments after you sign in — nothing personal "
              "is available here. Please [Sign in](/login) (or [Create account](/signup) if you're new) "
              "and ask me again from your dashboard.")
    for _ in range(n_personal):
        out.append(msg(SYSTEM, ctx_prompt(rng.choice(personal_qs), ctx), invite))

    # Public scheme catalog questions -> grounded listing with links.
    scheme_qs = ["Which schemes are open right now?", "What schemes are active?",
                 "What benefits are available?", "Show me the current government schemes."]
    listing = "\n".join(f"• {s['name']} ({s['category']}) — installment ₹{s['installment']}: {s['description']}"
                        for s in SCHEMES)
    ans = (f"These schemes are open right now:\n{listing}\n"
           f"See details on [Browse schemes](/schemes). To apply, [Create account](/signup) "
           f"and apply from your dashboard.")
    for _ in range(n_schemes):
        out.append(msg(SYSTEM, ctx_prompt(rng.choice(scheme_qs), ctx), ans))

    return out


def main():
    rng = random.Random(20260621)
    examples = knowledge_examples() + grounded_examples(rng) + visitor_examples(rng)
    rng.shuffle(examples)
    out_path = os.path.join(DATA, "bharatchain-instruct.jsonl")
    with open(out_path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(f"Wrote {len(examples)} examples -> {out_path}")
    print(f"  knowledge: {sum(len(e['questions']) for e in SEED)}  |  grounded+cold: {len(examples) - sum(len(e['questions']) for e in SEED)}")


if __name__ == "__main__":
    main()
