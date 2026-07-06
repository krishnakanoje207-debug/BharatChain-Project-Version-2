# BharatChain Sovereign AI Model (in-project, not wired into the website)

A **self-hosted, data-sovereign** assistant model for BharatChain. It exists so the
platform never has to send citizen data to an outsourced/third-party model — a real
concern for a country-level welfare system. Everything here runs on **your own (or
national) infrastructure**; no data leaves it.

> **Status:** side project, kept inside the repo on purpose. It is **NOT** imported by
> the backend or the website yet. When ready, it slots in behind the existing
> `LlmService` Ollama provider with zero website changes: set `OLLAMA_URL` and
> `OLLAMA_MODEL` (defaults to `bharatchain-assistant`, the name created below).

## Why not pretrain a brand-new model from scratch?

Pretraining a foundation model costs millions of dollars, large GPU clusters, and
trillions of tokens — not feasible at $0, and unnecessary. The actual goal
("no outsourced model can see our data") is fully achieved by **self-hosting an
open-weight base model and fine-tuning it** on BharatChain's domain. The model and
the data then both stay on national infrastructure.

Recommended bases (open weights, India-friendly, free to use):
- **Sarvam / AI4Bharat (Airavata, IndicTrans2)** — built for Indian languages.
- **Llama 3.2 (1B/3B), Qwen2.5 (1.5B/3B), Gemma 2 (2B)** — small, fine-tune on a free GPU.

## Two paths

### Path A — Quick sovereign model (no GPU): Ollama Modelfile
Bakes BharatChain's behavior + knowledge into a system prompt + few-shot examples on
top of a local base model. Runs fully offline.

```bash
# install Ollama (https://ollama.com), then:
ollama pull llama3.2:3b
ollama create bharatchain-assistant -f ai-model/Modelfile
ollama run bharatchain-assistant "What is BharatChain and how does payment work?"
```

### Path B — Fine-tune (LoRA/QLoRA): actually train the weights
Specializes the base model on the BharatChain instruction dataset. Runs free on a
Colab/Kaggle T4 (or any local GPU).

```bash
python ai-model/scripts/build_dataset.py        # -> data/bharatchain-instruct.jsonl
pip install -r ai-model/train/requirements.txt
python ai-model/train/train_lora.py             # -> out/bharatchain-lora/ (adapter)
# then merge + convert to GGUF and `ollama create` (see train/export_gguf.md)
```

## Layout

```
ai-model/
  Modelfile                       # Path A: Ollama system-prompt + few-shot model
  data/
    system_prompt.txt             # the assistant's grounding/behavior prompt
    seed_knowledge.json           # curated platform Q&A (source of truth)
    bharatchain-instruct.jsonl    # built training set (chat format) — generated
  scripts/
    build_dataset.py              # seed + synthetic grounded examples -> jsonl
    validate_dataset.py           # sanity-checks the jsonl
  train/
    requirements.txt
    train_lora.py                 # QLoRA SFT (transformers + peft + trl)
    export_gguf.md                # merge adapter -> GGUF -> ollama create
```

## Data sovereignty notes

- The training data here contains **no real citizen PII** — only platform knowledge and
  **synthetic** grounded examples. Real per-citizen answers happen at inference time via
  RAG (context passed in the prompt), exactly as the website already does.
- Once self-hosted, point the website at it by setting `OLLAMA_URL` + `OLLAMA_MODEL`
  (and optionally `LLM_PROVIDER=ollama`). The backend's `LlmService` already supports
  Ollama; no other change is needed. Until then, the website keeps using the
  deterministic grounded responder (also fully local).
