#!/usr/bin/env python3
r"""
QLoRA fine-tune of a small open base model on the BharatChain instruction dataset.
Produces a LoRA adapter — the data-sovereign assistant: base weights + your adapter
both stay on your (national) infrastructure; nothing is sent to a third-party model.

Run on a free Colab/Kaggle T4 GPU, or any local CUDA GPU:
    python ai-model/train/train_lora.py

DISK SPACE: the base model + cache is several GB. On this laptop put it on D::
    set HF_HOME=D:\bharatchain-ai\hf-cache
    set OUT_DIR=D:\bharatchain-ai\out\bharatchain-lora
(C: is space-constrained.) Defaults below fall back to a repo-local ./out otherwise.

After training, merge + convert to GGUF and `ollama create` (see export_gguf.md),
then point the website at it via OLLAMA_URL — no website code changes.
"""
import os

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

# Small, open, fine-tunable on a free GPU. Swap for an Indian base (Sarvam / AI4Bharat) if preferred.
BASE_MODEL = os.environ.get("BASE_MODEL", "meta-llama/Llama-3.2-3B-Instruct")
HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.path.join(os.path.dirname(HERE), "data", "bharatchain-instruct.jsonl")
OUT_DIR = os.environ.get("OUT_DIR", os.path.join(os.path.dirname(HERE), "out", "bharatchain-lora"))


def main():
    if not os.path.exists(DATASET):
        raise SystemExit("Dataset missing — run scripts/build_dataset.py first.")

    use_gpu = torch.cuda.is_available()
    print(f"CUDA available: {use_gpu}  |  base: {BASE_MODEL}  |  out: {OUT_DIR}")

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quant = (
        BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )
        if use_gpu
        else None
    )
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=quant,
        device_map="auto" if use_gpu else None,
        torch_dtype=torch.bfloat16 if use_gpu else torch.float32,
    )

    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    dataset = load_dataset("json", data_files=DATASET, split="train")

    cfg = SFTConfig(
        output_dir=OUT_DIR,
        num_train_epochs=3,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=10,
        save_strategy="epoch",
        bf16=use_gpu,
        max_seq_length=2048,
        packing=False,
        report_to=[],
    )

    # TRL applies the tokenizer's chat template to the {"messages": [...]} rows automatically.
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=dataset, peft_config=lora, processing_class=tokenizer)
    trainer.train()
    trainer.save_model(OUT_DIR)
    tokenizer.save_pretrained(OUT_DIR)
    print(f"Saved LoRA adapter -> {OUT_DIR}")


if __name__ == "__main__":
    main()
