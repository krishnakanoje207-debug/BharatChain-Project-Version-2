# Export the fine-tuned adapter → GGUF → Ollama (self-hosted)

After `train_lora.py` produces a LoRA adapter, merge it into the base, convert to
GGUF, and register it with Ollama so it serves locally (data never leaves your box).

> **Disk space:** all of this is multi-GB. On this laptop keep everything on **D:**
> (`HF_HOME`, the merged model, the `.gguf`, and `OLLAMA_MODELS`). C: is full.
> PowerShell: `$env:OLLAMA_MODELS="D:\bharatchain-ai\ollama-models"` before `ollama serve`.

## 1. Merge adapter into the base

```python
from peft import AutoPeftModelForCausalLM
from transformers import AutoTokenizer
m = AutoPeftModelForCausalLM.from_pretrained("out/bharatchain-lora")
m = m.merge_and_unload()
m.save_pretrained("out/bharatchain-merged")
AutoTokenizer.from_pretrained("out/bharatchain-lora").save_pretrained("out/bharatchain-merged")
```

## 2. Convert to GGUF (llama.cpp)

```bash
git clone https://github.com/ggerganov/llama.cpp
python llama.cpp/convert_hf_to_gguf.py out/bharatchain-merged \
  --outfile D:/bharatchain-ai/bharatchain.gguf --outtype q4_k_m
```

## 3. Register with Ollama

`Modelfile.tuned`:
```
FROM D:/bharatchain-ai/bharatchain.gguf
PARAMETER temperature 0.2
SYSTEM """<paste ai-model/data/system_prompt.txt>"""
```

```bash
ollama create bharatchain-assistant -f Modelfile.tuned
ollama run bharatchain-assistant "How does payment work in BharatChain?"
```

## 4. Wire into the website (later, when approved)

The backend already supports Ollama. In `.env`:
```
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
```
Then change the model id used in `apps/backend/src/assistant/llm.service.ts` (`ollama()`)
from `llama3.1` to `bharatchain-assistant`. No other code changes.
