# A3. Published memory benchmark results

Research date: 2026-10-26. Every row was read from the URL given (fetched or API-called this run). Nothing here was
re-run by us. Where a source did not say the model, judge, split or date, the cell says `not stated`.

Labels:

- `vendor-claimed`: the product's own authors or marketing, including vendor-authored arXiv preprints and a rival
  vendor's rerun of someone else's product (named in "Who ran").
- `third-party`: a person or group with no product in the comparison (GitHub issue reproductions).
- `peer-reviewed`: a paper at a venue. Only the benchmark papers qualify here, and the venue status is noted per row.

Scores from different rows are NOT comparable. Metrics differ (LLM-judge accuracy, F1, Recall@k, hit@1, rubric
score), as do judges, models and question subsets. Conflicts are shown in section 3 and not resolved.

## 1. The benchmarks themselves

| Benchmark | What it is | Source | Venue status as seen this run |
|---|---|---|---|
| LoCoMo | Very long conversations, about 9K tokens and 300 turns each, up to 35 sessions | https://arxiv.org/abs/2402.17753 | arXiv page names no venue. UNVERIFIED as peer-reviewed from this page |
| LongMemEval | 500 curated questions in scalable chat histories; commercial assistants and long-context LLMs show a 30% accuracy drop | https://arxiv.org/abs/2410.10813 | arXiv comments field says ICLR 2025 |
| BEAM | 100 conversations, 2,000 questions, 100K to 10M tokens | https://arxiv.org/html/2510.27246v1 | A search result for iclr.cc lists it as an ICLR 2026 poster (https://iclr.cc/virtual/2026/poster/10006595); I did not open that page |
| MemoryAgentBench | Four competencies: accurate retrieval, test-time learning, long-range understanding, selective forgetting / conflict resolution | https://arxiv.org/html/2507.05257v3 | Page text does not confirm acceptance; a search snippet says ICLR 2026. UNVERIFIED |
| DMR (Deep Memory Retrieval) | From the MemGPT work. Only used here through the Zep paper | https://arxiv.org/abs/2501.13956 | not applicable |
| LoCoMo-10 subset | The 10-conversation set with about 1,540 scored questions (categories 1 to 4) that vendors use; category 5 is excluded by Mem0 and Zep | https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ | not applicable |

Not found this run: a published result for DMR beyond the Zep paper, and any official LongMemEval-V2 scores
(a repo exists: https://github.com/xiaowu0162/LongMemEval-V2, listed in the LongMemEval README; I did not read it).

## 2. Results table

Columns: Product | Benchmark | Metric | Score | Model / judge | Split, n | Who ran | Date | Label | URL.

### 2.1 Benchmark papers (peer-reviewed or paper-reported)

| # | Product | Benchmark | Metric | Score | Model / judge | Split, n | Who ran | Date | Label | URL |
|--:|---|---|---|---|---|---|---|---|---|---|
| B1 | Qwen 2.5: Vanilla / RAG / LIGHT | BEAM | average of 10 abilities, 0 to 1 | 100K: .280/.269/.311; 500K: .200/.291/.316; 1M: .193/.285/.309; 10M: .133/.211/.238 | Qwen 2.5; 128K window for Vanilla, 32K for RAG and LIGHT | 100 convs, 2,000 q | BEAM authors | 2025-10 (v1) | peer-reviewed (venue per search result only) | https://arxiv.org/html/2510.27246v1 |
| B2 | Llama 4 Maverick: Vanilla / RAG / LIGHT | BEAM | same | 100K: .240/.323/.358; 500K: .283/.330/.359; 1M: .259/.307/.336; 10M: .104/.249/.266 | Llama 4 Maverick | same | BEAM authors | 2025-10 | peer-reviewed (same caveat) | same |
| B3 | Gemini 2.0 Flash: Vanilla / RAG / LIGHT | BEAM | same | 100K: .242/.280/.294; 500K: .257/.267/.292; 1M: .199/.271/.284; 10M: .122/.216/.192 | Gemini 2.0 Flash | same | BEAM authors | 2025-10 | peer-reviewed (same caveat) | same |
| B4 | GPT-4.1-nano: Vanilla / RAG / LIGHT | BEAM | same | 100K: .239/.309/.345; 500K: .194/.314/.335; 1M: .191/.302/.336; 10M: .109/.218/.226 | GPT-4.1-nano | same | BEAM authors | 2025-10 | peer-reviewed (same caveat) | same |
| B5 | GPT-4o (long-context) | MemoryAgentBench | AR / TTL / LRU / SF / overall | 58.1 / 50.0 / 54.9 / 32.5 / 48.8 | GPT-4o | not stated here | MAB authors | v3 2026-03-17 | peer-reviewed (acceptance unconfirmed) | https://arxiv.org/html/2507.05257v3 |
| B6 | GPT-4o-mini (long-context) | MemoryAgentBench | same | 49.2 / 48.6 / 46.2 / 25.0 / 42.2 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B7 | BM25 (simple RAG) | MemoryAgentBench | same | 60.5 / 44.5 / 35.6 / 25.5 / 41.5 | GPT-4o-mini backbone | same | MAB authors | same | peer-reviewed (same) | same |
| B8 | Text-Embed-3-Large RAG | MemoryAgentBench | same | 54.6 / 44.3 / 37.3 / 16.0 / 38.0 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B9 | HippoRAG-v2 | MemoryAgentBench | same | 65.1 / 35.8 / 36.2 / 29.5 / 41.6 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B10 | Zep | MemoryAgentBench | same | 37.5 / 37.5 / 16.2 / 5.0 / 24.0 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B11 | Mem0 | MemoryAgentBench | same | 32.6 / 21.2 / 20.7 / 10.0 / 21.1 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B12 | MemGPT | MemoryAgentBench | same | 34.3 / 40.8 / 22.4 / 15.5 / 28.3 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B13 | MIRIX | MemoryAgentBench | same | 47.5 / 24.1 / 25.4 / 8.0 / 26.2 | GPT-4o-mini | same | MAB authors | same | peer-reviewed (same) | same |
| B14 | MIRIX (GPT-4.1-mini) | MemoryAgentBench | same | 63.0 / 35.7 / 40.5 / 11.5 / 37.7 | GPT-4.1-mini | same | MAB authors | same | peer-reviewed (same) | same |

The MemoryAgentBench paper's own summary, as returned by the fetch: all methods score poorly (at most about 7%) on
multi-hop selective forgetting.

### 2.2 Mem0 versus Zep versus Letta, LoCoMo (the dispute)

| # | Product | Benchmark | Metric | Score | Model / judge | Split, n | Who ran | Date | Label | URL |
|--:|---|---|---|---|---|---|---|---|---|---|
| B15 | Mem0 base | LoCoMo | J score | 66.88 | judge not stated | cat 1 to 4 (cat 5 excluded) | Mem0 paper, as quoted by Zep | 2025-04 | vendor-claimed | https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ |
| B16 | Mem0 graph | LoCoMo | J score | 68.44 | not stated | same | Mem0 paper, as quoted by Zep | 2025-04 | vendor-claimed | same |
| B17 | Full-context baseline | LoCoMo | J score | 72.90 | GPT-4o-mini | same | Mem0 paper, as quoted by Zep | 2025-04 | vendor-claimed | same |
| B18 | Zep (as run by Mem0) | LoCoMo | J score | 65.99 | not stated | same | Mem0 (rival) | 2025-04 | vendor-claimed | same |
| B19 | Zep (as run by Mem0, rerun) | LoCoMo | accuracy | 58.44 +/- 0.20 | not stated | not stated | Mem0 (rival), issue opened by Mem0's CTO | 2025-05-08 | vendor-claimed | https://github.com/getzep/zep-papers/issues/5 |
| B20 | Zep (original claim) | LoCoMo | accuracy | 84% | not stated | included category 5 per Mem0 | Zep | before 2025-05 | vendor-claimed | https://github.com/getzep/zep-papers/issues/5 |
| B21 | Zep (corrected) | LoCoMo | J score | 75.14 +/- 0.17 (10 runs) | not stated | cat 5 excluded | Zep | 2025-05-12 | vendor-claimed | https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ |
| B22 | Letta (files + grep) | LoCoMo | accuracy | 74.0% | GPT-4o mini | full history in one file; not a direct Letta-store test | Letta | 2025-08-12 | vendor-claimed | https://www.letta.com/blog/benchmarking-ai-agent-memory |
| B23 | Mem0 graph (as cited by Letta) | LoCoMo | accuracy | 68.5% | not stated | not stated | Mem0, via a Reddit post per Letta | 2025 | vendor-claimed | https://www.letta.com/blog/benchmarking-ai-agent-memory |
| B24 | Mem0 (current) | LoCoMo | score | 92.5 (single-hop 94.6, multi-hop 95.4, open-domain 82.3, temporal 92.5; labels partly garbled on the page) | not stated | 1,540 q; about 6,956 tokens per retrieval | Mem0 | page dated 2026-10-23 | vendor-claimed | https://mem0.ai/research |
| B25 | Mem0 (current) | LongMemEval | score | 94.4 | not stated | 500 q | Mem0 | 2026-10 | vendor-claimed | https://mem0.ai/research |
| B26 | Mem0 | BEAM-1M | score | 64.1 | not stated | 700 q | Mem0 | 2026 | vendor-claimed | https://mem0.ai/library/agent-memory/ai-memory-benchmarks-in-2026 |
| B27 | Mem0 | BEAM-10M | score | 48.6 | not stated | 200 q | Mem0 | 2026 | vendor-claimed | same |
| B28 | Mem0 (prior version) | LoCoMo / LongMemEval | score | 71.4 / 67.8 | not stated | not stated | Mem0 | not stated | vendor-claimed | same |
| B29 | Zep | LoCoMo | score | 94.7 (claimed) | not stated | not stated | Zep, as listed on Mem0's page | not stated | vendor-claimed | same |
| B30 | Zep | LoCoMo | score | 75.1 | not stated | not stated | ByteRover's comparison, as listed on Mem0's page | not stated | vendor-claimed (rival-run, second-hand) | same |
| B31 | Mem0 (older version) | LoCoMo | score | 66.9 | not stated | not stated | ByteRover's comparison, via Mem0's page | not stated | vendor-claimed (rival-run, second-hand) | same |
| B32 | Mem0 (platform) | LoCoMo | LLM score | about 0.20 | GPT-4o-mini | one user's run of the repo script | GitHub user Donghua-Cai | opened 2026-01-28, closed 2026-03-27 | third-party | https://github.com/mem0ai/mem0/issues/3944 |
| B33 | Zep | DMR | accuracy | 94.8% | not stated | not stated | Zep authors (arXiv preprint) | 2025-01-20 | vendor-claimed | https://arxiv.org/abs/2501.13956 |
| B34 | MemGPT | DMR | accuracy | 93.4% | not stated | not stated | as reported in Zep's paper | 2025-01-20 | vendor-claimed | same |
| B35 | Zep | LongMemEval | accuracy | up to +18.5% over baseline, 90% lower latency (no absolute score on the page) | not stated | not stated | Zep authors | 2025-01-20 | vendor-claimed | same |

### 2.3 LongMemEval-S leaderboards (vendor pages)

| # | Product | Benchmark | Metric | Score | Model / judge | Split, n | Who ran | Date | Label | URL |
|--:|---|---|---|---|---|---|---|---|---|---|
| B36 | Supermemory | LongMemEval-S | accuracy | 97% overall | gpt-4o answer, gpt-4o judge | 500 q | Supermemory | no date on page | vendor-claimed | https://supermemory.ai/research/longmembench |
| B37 | Supermemory | LongMemEval-S | accuracy | 84.6% | gpt-5 | 500 q | Supermemory | same | vendor-claimed | same |
| B38 | Supermemory | LongMemEval-S | accuracy | 85.2% | gemini-3-pro | 500 q | Supermemory | same | vendor-claimed | same |
| B39 | Supermemory | LongMemEval-S | accuracy | 81.6% | gpt-4o | 500 q | listed on Mastra's page | page updated 2026-02-17 | vendor-claimed (rival-run, second-hand) | https://mastra.ai/research/observational-memory |
| B40 | Zep | LongMemEval-S | accuracy | 71.2% | gpt-4o | 500 q | Zep; repeated on Supermemory, Mastra and Mem0 pages | not stated | vendor-claimed | https://supermemory.ai/research/longmembench |
| B41 | Full context | LongMemEval-S | accuracy | 60.2% | gpt-4o | 500 q | Supermemory and Mastra pages | not stated | vendor-claimed | same |
| B42 | Mastra Observational Memory | LongMemEval-S | accuracy | 94.87% | actor gpt-5-mini; observer gemini-2.5-flash; judge gpt-4o | 500 q, unweighted mean of 6 categories | Mastra | 2026-02-17 | vendor-claimed | https://mastra.ai/research/observational-memory |
| B43 | Mastra OM | LongMemEval-S | accuracy | 93.27% | gemini-3-pro-preview | same | Mastra | same | vendor-claimed | same |
| B44 | Mastra OM | LongMemEval-S | accuracy | 89.20% | gemini-3-flash-preview | same | Mastra | same | vendor-claimed | same |
| B45 | Mastra OM | LongMemEval-S | accuracy | 84.23% | gpt-4o | same | Mastra | same | vendor-claimed | same |
| B46 | Mastra RAG (topK 20) | LongMemEval-S | accuracy | 80.05% | gpt-4o | same | Mastra | same | vendor-claimed | same |
| B47 | Oracle | LongMemEval-S | accuracy | 82.40% | gpt-4o | same | Mastra | same | vendor-claimed | same |
| B48 | EmergenceMem Internal | LongMemEval-S | accuracy | 86.00% (page says not publicly reproducible) | gpt-4o | same | listed on Mastra's page | same | vendor-claimed | same |
| B49 | EmergenceMem Simple | LongMemEval-S | accuracy | 82.40% | gpt-4o | same | listed on Mastra's page | same | vendor-claimed | same |
| B50 | Hindsight | LongMemEval | accuracy | 91.4% | gemini-3-pro-preview per Mastra's page; paper says "larger backbone" | not stated | Hindsight authors (arXiv); listed on Mastra's page | 2025-12-14 | vendor-claimed | https://arxiv.org/abs/2512.12818 |
| B51 | Hindsight | LongMemEval | accuracy | 83.6% (20B open model; base 39% with full context) | open 20B | not stated | Hindsight authors | 2025-12-14 | vendor-claimed | https://arxiv.org/abs/2512.12818 |
| B52 | Hindsight | LongMemEval | accuracy | 89.0% | GPT-OSS 120B | not stated | listed on Mastra's page | 2026-02-17 | vendor-claimed | https://mastra.ai/research/observational-memory |
| B53 | Hindsight | LoCoMo | accuracy | 89.61% vs 75.78% for strongest prior open system | larger backbone, not named | not stated | Hindsight authors | 2025-12-14 | vendor-claimed | https://arxiv.org/abs/2512.12818 |
| B54 | Honcho | LongMemEval S | accuracy | 90.4% (Haiku 4.5 alone: 62.6%); 92.6% with Gemini 3 Pro | deriver gemini-2.5-flash-lite; dreamer and dialectic claude-haiku-4.5 | 500 q, about 115K tokens each | Honcho | page says Dec 2025; JSON-LD modified 2026-09-01 | vendor-claimed | https://honcho.dev/evals/ |
| B55 | Honcho | LoCoMo | LLM-judge accuracy | 89.9% (Haiku 4.5 alone: 75.6%) | same | 1,540 q | Honcho | same | vendor-claimed | same |
| B56 | EverMemOS / EverOS | LongMemEval-S | accuracy | 82% (subset) | not stated | subset | EverMind, as listed on Mem0's page | not stated | vendor-claimed | https://mem0.ai/library/agent-memory/ai-memory-benchmarks-in-2026 |
| B57 | ByteRover | LongMemEval-S | accuracy | 92.8% | not stated | not stated | ByteRover, as listed on Mem0's page | not stated | vendor-claimed | same |
| B58 | KITE (Memoket) | LongMemEval-S | overall accuracy | 85.60%, 1.65K tokens reader context | gpt-4.1-mini at all stages | not stated | Memoket | not stated | vendor-claimed | https://github.com/memoket/memoket-kite |

### 2.4 BEAM leaderboards (vendor pages)

| # | Product | Benchmark | Metric | Score | Model / judge | Split, n | Who ran | Date | Label | URL |
|--:|---|---|---|---|---|---|---|---|---|---|
| B59 | Hindsight | BEAM | tier score | 100K 73.4%, 500K 71.1%, 1M 73.9%, 10M 64.1% | not stated for Hindsight | per tier | Vectorize (Hindsight's company) | 2026-04-02 | vendor-claimed | https://hindsight.vectorize.io/blog/2026/04/02/beam-sota |
| B60 | Honcho | BEAM | tier score | 100K 63.0%, 500K 64.9%, 1M 63.1%, 10M 40.6% | not stated | per tier | listed on Hindsight's page, source not given | 2026-04-02 | vendor-claimed (rival-run, second-hand) | same |
| B61 | Honcho | BEAM | rubric score 0 to 1 | 100K 0.630, 500K 0.646, 1M 0.618, 10M 0.409 (Haiku 4.5 alone at 100K: 0.533) | as in B54 | 400 q at 100K, 20 convs | Honcho | as B54 | vendor-claimed | https://honcho.dev/evals/ |
| B62 | Exabase M-1 | BEAM | tier score | 100K 76.9%, 1M 75.0%, 10M 68.0% | Gemini 3 Flash | per tier | Exabase (press release) | 2026-07-28 | vendor-claimed | https://www.webull.com/news/15304952493908992 |
| B63 | LIGHT and RAG baselines at 10M | BEAM | tier score | LIGHT 26.6%, RAG 24.9% | Llama-4-Maverick | 10M | quoted by Hindsight from the BEAM paper | 2026-04-02 | vendor-claimed (quoting the paper) | https://hindsight.vectorize.io/blog/2026/04/02/beam-sota |

### 2.5 Small projects' README claims

| # | Product | Benchmark | Metric | Score | Model / judge | Split, n | Who ran | Date | Label | URL |
|--:|---|---|---|---|---|---|---|---|---|---|
| B64 | M-flow | LoCoMo-10 | LLM-judge | 81.8% (top-k 10) | answer gpt-5-mini, judge gpt-4o-mini | cat 5 excluded | M-flow | not stated | vendor-claimed | https://github.com/FlowElement-xinliuyuansu/m_flow |
| B65 | Cognee Cloud (run by M-flow) | LoCoMo-10 | LLM-judge | 79.4% | same | same | M-flow (rival) | not stated | vendor-claimed | same |
| B66 | Zep Cloud (run by M-flow) | LoCoMo-10 | LLM-judge | 73.4% at 7 edges+3 nodes; 78.4% at 20+20 | same | same | M-flow (rival) | not stated | vendor-claimed | same |
| B67 | Supermemory Cloud (run by M-flow) | LoCoMo-10 | LLM-judge | 64.4% | same | same | M-flow (rival) | not stated | vendor-claimed | same |
| B68 | Mem0 Cloud (tested by M-flow) | LoCoMo-10 | LLM-judge | 50.4% (top-k 30); published 67.1% and 68.5% for graph variant cited | same | same | M-flow (rival) | not stated | vendor-claimed | same |
| B69 | M-flow | LongMemEval | LLM-judge | 89% (temporal 93%, multi-session 82%) | same | temporal 60 q, multi-session 40 q subset | M-flow | not stated | vendor-claimed | same |
| B70 | Supermemory / Mem0 / Zep / Cognee (run by M-flow) | LongMemEval | LLM-judge | 74% / 71% / 61% / 57% | same | same subset | M-flow (rival) | not stated | vendor-claimed | same |
| B71 | KITE (Memoket) | LoCoMo | overall accuracy | 93.51%, 1.51K tokens reader context | gpt-4.1-mini | not stated | Memoket | not stated | vendor-claimed | https://github.com/memoket/memoket-kite |
| B72 | EverOS / EverMemOS | LoCoMo | accuracy | 93.0% (1,986 q "paper"); 92.3% as listed on Mem0's page | gpt-4.1-mini via OpenRouter in the reproduction | all conversations | EverMind | not stated | vendor-claimed | https://github.com/EverMind-AI/EverMemOS/issues/73 |
| B73 | EverOS reproduction | LoCoMo | accuracy | 52.22% on a 30-question smoke test; 38.38% on conversation 26 (152 q) | gpt-4.1-mini, Qwen3 embedding and reranker, agentic search | 1 of 10 conversations | GitHub user wangyu-ustc | 2026-02-05 (closed 2026-06-06, old eval path) | third-party | same |
| B74 | MemPalace | LongMemEval | Recall@5, raw | 96.6% | no LLM; ChromaDB default embeddings | 500 q | MemPalace | 2026-04 | vendor-claimed | https://github.com/MemPalace/mempalace |
| B75 | MemPalace reproduction | LongMemEval-S cleaned | Recall@5 | raw 0.966, rooms 0.894, AAAK 0.842 (R@1: 0.806 / 0.686 / 0.602) | all-MiniLM-L6-v2 | 500 q, Mac Studio M2 Ultra | GitHub user gizmax | 2026-04-07 | third-party | https://github.com/MemPalace/mempalace/issues/39 |
| B76 | MemPalace reproduction | LongMemEval-S | end-to-end accuracy | raw 0.668, rooms 0.672, AAAK 0.532 | reader gpt-4o-mini-2024-07-18, judge GPT-4o-2024-08-06, top-k 5 | 500 q | gizmax | 2026-04-08 | third-party | same |
| B77 | MemPalace reproduction (retracted) | LongMemEval-S | accuracy | 0.826, retracted by the author | Claude Sonnet as reader and judge; no MemPalace code in the path | 500 q | gizmax | retracted 2026-04-08 | third-party | same |
| B78 | Memanto | LongMemEval / LoCoMo | accuracy | 89.8% / 87.1% | reader, judge and subset: the README has an unfilled TODO | not stated | Memanto | not stated | vendor-claimed | https://github.com/moorcheh-ai/memanto |
| B79 | SuperLocalMemory | LoCoMo | accuracy | 74.8% (with GPT-4.1-mini answers) / 60.4% (no LLM) | GPT-4.1-mini | 10 convs, 1,276 q | SLM author (paper), "not a fresh run of the current package" | not stated | vendor-claimed | https://github.com/qualixar/superlocalmemory |
| B80 | SuperLocalMemory | LoCoMo | accuracy | 87.7% (cloud embeddings) | GPT-4.1-mini | 1 conversation (Conv-30), 81 q | SLM author | not stated | vendor-claimed | same |
| B81 | YourMemory | LoCoMo-10 | Recall@5 | 59% vs Mem0 18, Zep Cloud 28, Supermemory 31 (README notes Mem0 and Supermemory hit free-tier quotas mid-run) | none | 1,534 pairs | YourMemory | not stated | vendor-claimed | https://github.com/sachitrafa/YourMemory |
| B82 | YourMemory | LongMemEval | Recall@5 | 89.4% (badge) | none | not stated | YourMemory | not stated | vendor-claimed | same |
| B83 | Engram (tstockham96) | LoCoMo | accuracy | 80.0% at 776 tokens/query; file append 28.8%; manual memory files 74.5% at 1,373 tokens | not stated | not stated | Engram author | not stated | vendor-claimed | https://github.com/tstockham96/engram |
| B84 | agent-memory (tigerless) | LongMemEval-S, bounded haystack | pooled accuracy | 52.9% (127/240) vs MemCore 35.8% vs no memory 5.8% | Haiku 4.5 host, Sonnet 5 judge | 120 episodes, 2 replays | the author; README says not comparable to published scores | not stated | vendor-claimed | https://github.com/tigerless-labs/agent-memory |
| B85 | deja-vu | LongMemEval-S | Recall@5 / hit@1 | 97.2% R@5; hit@1 88.1% on 470-q cleaned set, 87.4% on all 500; LoCoMo retrieval hit@1 70.5% | no LLM | 470 / 500 q | deja-vu author | not stated | vendor-claimed | https://github.com/vshulcz/deja-vu |
| B86 | Hippo | LongMemEval oracle | Recall@5 | 74.0% (BM25 only, one pooled store) | none | 500 q | Hippo author | not stated | vendor-claimed | https://github.com/kitfunso/hippo-memory |
| B87 | TeleMem | ZH-4O (MOOM paper dataset) | QA accuracy | 86.33%, "19% higher" than Mem0 | not stated | about 600 turns per conversation | TeleMem authors | not stated | vendor-claimed | https://github.com/TeleAI-UAGI/telemem |
| B88 | SimpleMem | LoCoMo | F1 | +26.4% average over prior systems; Omni version F1 0.613 (+47%); 531 tokens/query questioned in an open issue | GPT-4.1-mini | not stated | SimpleMem authors | 2026-04 to 2026-05 | vendor-claimed | https://github.com/aiming-lab/SimpleMem |
| B89 | MIRIX | LoCoMo | LLM score | 0.6234 (single-hop .6250, multi-hop .5135, open-domain .7692, temporal .6429); BLEU 0.0996, F1 0.1519 | repo defaults | 154 q (first conversation only) | GitHub user Ashley-Tung | 2025-07-17 | third-party | https://github.com/Mirix-AI/MIRIX/issues/6 |
| B90 | OwnMem | own CC0 corpus | Recall@1, MRR | 100% R@1 on 128 queries in 40 languages vs 3.9% for grep; MRR 1.000 | none | 128 q | OwnMem author | not stated | vendor-claimed | https://github.com/grpcer/ownmem |
| B91 | mimirs | four real codebases | Recall@10, MRR | 89 to 97% R@10; MRR 0.69 to 0.77 | none | 72 to 120 q each | mimirs author | re-measured 2026-06-04 | vendor-claimed | https://github.com/TheWinci/mimirs |
| B92 | ByteRover | LoCoMo | score | 92.2% or 96.1% (two different posts) | not stated | not stated | ByteRover, as listed on Mem0's page | not stated | vendor-claimed | https://mem0.ai/library/agent-memory/ai-memory-benchmarks-in-2026 |
| B93 | Dakera / ZeroMemory | LoCoMo | score | 88.2% (no LLM reranking) / 96.1% | not stated | not stated | self-reported, as listed on Mem0's page | not stated | vendor-claimed | same |
| B94 | claude-smart | own EXPERIMENT.md | correction retention | "~3x better" than claude-mem; "~50% more guidance retained" | not stated in README | not stated | claude-smart authors | not stated | vendor-claimed | https://github.com/ReflexioAI/claude-smart |

Row count: 94 rows (B1 to B94). B1 to B4 are four-backbone matrices with 12 scores each.

Products with a benchmark claim in docs/21 that I did not re-fetch this run (Supermemory "95% Recall@15", Memvid, OpenViking,
MemOS, ReMe, MemoryOS, agentmemory 68.5% LoCoMo, Context Mode) are not repeated here. See docs/21 section 21.3.

## 3. Conflicts (shown, not resolved)

1. **Mem0 on LoCoMo.** 66.88 / 68.44 (Mem0 paper, B15-B16), 68.5 (cited by Letta, B23), 92.5 (Mem0 now, B24),
   71.4 for the "prior version" (B28), 66.9 (ByteRover, B31), 50.4 (M-flow's own test, B68), about 0.20 in a user
   rerun on the platform (B32). Same product, same benchmark, scores from about 20 (a user rerun, 0-1 scale converted) to 92.5.
2. **Zep on LoCoMo.** 84% (Zep original), 65.99 (Mem0's first run), 58.44 (Mem0's rerun), 75.14 (Zep corrected), 94.7
   (claimed, B29), 75.1 (ByteRover, B30), 73.4 or 78.4 (M-flow, B66).
3. **Supermemory on LongMemEval-S with gpt-4o.** 97% on Supermemory's page (B36) versus 81.6% listed on Mastra's
   page updated 2026-02-17 (B39). Supermemory's page gives no date and no change note, so I cannot say whether the number moved.
4. **Mem0 on LongMemEval.** 94.4 (Mem0, B25), 71 (M-flow's run, B70), 67.8 (Mem0's prior version, B28). A search
   summary also reported 49% from a third source (Atlan); I did not open it, so it is `UNVERIFIED`.
5. **MemPalace.** 96.6% Recall@5 reproduces (B75), but end-to-end accuracy with gpt-4o-mini is 0.668 (B76). These are
   different metrics. The retrieval number is Recall@k; the QA number is judge accuracy. A 0.826 figure was retracted (B77).
6. **EverMemOS.** 93.0% LoCoMo claimed versus 52.22% and 38.38% on a user's rerun (B72, B73). The maintainer closed
   the issue as an old code path and asked for a new issue; no new result was posted in the thread.
7. **Honcho BEAM.** Same numbers within rounding on Honcho's own page (B61) and on Hindsight's page (B60). Honcho
   100K = 0.630 versus 63.0%: one is a 0-1 rubric score and the other is shown as a percent, so they agree, but the
   scales differ from the LongMemEval pass/fail rows.
8. **Hindsight vs Exabase on BEAM.** Exabase says it beat Hindsight at each tier (B62 versus B59). Both are vendor runs.
   Exabase's full paper was not reachable (the page I could read did not include it).

## 4. Evaluation pitfalls reported in public

| # | Pitfall | Source | Notes |
|--:|---|---|---|
| P1 | Zep says Mem0 ran LoCoMo with a prompt and settings that disadvantaged Zep; Mem0 says Zep counted adversarial category 5 and inflated by about 25.56 points | https://github.com/getzep/zep-papers/issues/5 and the Zep blog above | Zep accepted the arithmetic error and corrected to 75.14%. Both still dispute prompts, run counts and latency method (sequential vs parallel searches) |
| P2 | Category 5 of LoCoMo has no ground-truth answers; some multimodal questions rely on missing image detail; some assign actions to the wrong speaker; some have several valid answers | Zep blog | Zep is a competitor of Mem0 |
| P3 | Audit claims 99 score-corrupting errors in 1,540 LoCoMo questions (6.4%) and a gpt-4o-mini judge that accepts 62.81% of intentionally wrong answers | https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg ; repo https://github.com/dial481/locomo-audit | Written by a company with its own memory product. I did not open the audit repo, so the counts are unchecked |
| P4 | Reproduction failures: Mem0 platform about 0.20 (maybe wrong date handling, fixed by maintainers); EverOS 38 to 52% against 93%; MIRIX first run needed a config flag | https://github.com/mem0ai/mem0/issues/3944 ; https://github.com/EverMind-AI/EverMemOS/issues/73 ; https://github.com/Mirix-AI/MIRIX/issues/6 | Mem0's cause is the reporter's guess; the maintainer only said it was fixed |
| P5 | Retrieval recall is reported next to end-to-end accuracy as if equal | https://github.com/MemPalace/mempalace/issues/39 ; https://github.com/MemPalace/mempalace/issues/27 | Issue #27 also lists "lossless" compression that drops R@5 from 96.6% to 84.2%, token counts by `len(text)//3`, and an unreproducible "100% with Haiku rerank". These are one reporter's claims. Maintainers changed docs on 2026-10-12 (items 2 and 8); code-level items not shown as fixed |
| P6 | Tuning on the test set | A search summary of vectorize.io articles says MemPalace's 100% LongMemEval came after fixing the three failing questions; held-out 98.4%. https://vectorize.io/articles/mempalace-benchmarks | `UNVERIFIED`: I saw only a search summary, and the source is a competing vendor |
| P7 | Results change with reader model, judge model, judge prompt and retrieval budget | Memanto README ("move results by several points"); Sibyl README says many published "LongMemEval" numbers are end-to-end QA, not retrieval recall | Both are projects stating it about the field |
| P8 | Missing conditions | Memanto README has a visible TODO for reader, judge and subset; Mem0's pages give no judge or model; Supermemory's page does not clearly split Recall@20 from judge accuracy | Cited rows above |
| P9 | Vendor's own prior claims withdrawn | Sibyl README: pre-1.0 headline run withdrawn, no number published. Hippo README: an earlier informal magnitude retracted. https://github.com/hyperb1iss/sibyl ; https://github.com/kitfunso/hippo-memory | Good practice, shown for contrast |
| P10 | Comparison arms starved of quota | YourMemory README: Mem0 and Supermemory exhausted free-tier quotas mid-benchmark | https://github.com/sachitrafa/YourMemory |
| P11 | A "memory" win by dumping history into files | Letta: GPT-4o mini plus grep over a file scored 74.0% against Mem0's 68.5%, and Letta says the comparison is not like-for-like (could not backfill LoCoMo into Letta) | https://www.letta.com/blog/benchmarking-ai-agent-memory. One secondary article says Mem0 later published 92.5 and Letta did not rerun; seen only in a search summary, `UNVERIFIED` |
| P12 | Token figures without a script | https://github.com/aiming-lab/SimpleMem/issues/94 asks how "531 tokens/query" was counted; no reply visible | Open |
| P13 | Poor performance of memory layers against plain baselines | MemoryAgentBench: Mem0 21.1 and Zep 24.0 overall versus BM25 RAG 41.5 and GPT-4o-mini long-context 42.2 (B5 to B11). MemoryAgentBench's README, per a search summary, blames fact extraction losing context | https://arxiv.org/html/2507.05257v3 |
| P14 | Same number, different scale | Honcho BEAM 0.630 vs 63.0%; Mem0 page is dated both Oct 23, 2026 and Sep 22, 2026 | https://honcho.dev/evals/ ; Mem0 page above |
| P15 | Cloud runs are not local runs | Letta and Zep results are for managed services or file setups; the local OSS may differ | No source states the size of the gap |
| P16 | Self-built test sets | OwnMem, mimirs, OKF latency table, tigerless: all use the project's own corpus or comparison ranges | Not comparable to LoCoMo or LongMemEval |

## 5. Which products can be installed with no account and run locally

"No account" means no sign-up with the memory vendor. Most still need an LLM key from some provider, or a local model.
I did not install or run anything. Versions and licences come from PyPI or npm metadata fetched 2026-10-26, install
commands from READMEs. I avoided any heavy install.

| Product | Install command (from README or registry) | Version / licence | Extra needs | Account needed? |
|---|---|---|---|---|
| MemPalace | `uv tool install mempalace` | PyPI 3.11.0, MIT | none for raw mode (ChromaDB default embeddings, README says zero API calls) | No |
| Hippo | `npm install -g hippo-memory && hippo init` | npm 2.1.0, MIT | Node 22.16+; BM25 needs no model | No |
| OwnMem | npm package `ownmem` (README quick start uses `npx` inside the repo; exact line not captured) | npm 0.8.2, Apache-2.0 | Node 20.6+; no model call by default | No |
| OMEGA | `pipx install "omega-memory[server]"` | PyPI 1.5.20, Apache-2.0 | Python 3.11+ | No |
| memsearch | `uv tool install "memsearch[onnx]"` | PyPI 0.4.22, MIT | ONNX embeddings option; README also lists Ollama and OpenAI | No |
| SuperLocalMemory | PyPI `superlocalmemory` (install line not captured) | 4.2.11, AGPL-3.0-or-later | Python 3.12 to 3.14; Mode A makes no model call | No |
| claude-smart | `npx claude-smart install` | npm 0.3.13, Apache-2.0 | local mode needs an agent CLI (`claude`, `codex` or `opencode`) on PATH | No for local mode |
| Magic Context | `npx @cortexkit/magic-context@latest setup` | npm 0.49.23, MIT | LLM models for the historian and dreamer | No |
| Mnemon | `npm install --global @mnemon-dev/mnemon` or `go install github.com/mnemon-dev/mnemon@latest` | Apache-2.0 | Ollama or OpenAI optional | No |
| deja-vu | `curl -fsSL https://raw.githubusercontent.com/vshulcz/deja-vu/main/install.sh \| sh`, then `deja install --auto` | MIT | none stated | No |
| TeleMem | `uvx telemem` | PyPI 1.10.1, Apache-2.0 | OpenAI or Ollama | No |
| YourMemory | `pip install yourmemory` | PyPI `yourmemory` (version not fetched), NOASSERTION | none stated | No |
| Hindsight | PyPI `hindsight-all` | 1.1.0, MIT | LLM provider | No (self-host) |
| Basic Memory | PyPI `basic-memory` | 0.24.1, AGPL-3.0-or-later | Python 3.12+ | No |
| Semantica | PyPI `semantica` | 0.7.0, MIT | graph store optional | No |
| agent-memory (tigerless) | install from a checkout (README); not on PyPI or npm by that name | MIT | none; no LLM client in the library | No |
| OKF Agent Memory | Go binary built from the repo (`./bin/okf` in README) | MIT | none | No |
| MARM, Memora | `pip install memora-mcp` (Memora); MARM via Docker or PyPI (line not captured) | MIT / Apache-2.0 | embeddings via fastembed or OpenAI | No |
| Honcho (self-host) | `pip install honcho-ai` is only the SDK; the server needs Postgres + pgvector and Docker | AGPL-3.0 server | LLM keys | No for self-host; managed needs one |

Need an account or a vendor API key (README quick start): memU (key from memu.so), Mengram (key from mengram.io),
Mem0 platform, Zep Cloud, Supermemory cloud, ByteRover cloud sync. Memanto: `UNVERIFIED` (README mentions an API key
and cloud, but I did not find whether a fully local path exists).

Name collisions to avoid when installing: PyPI `agentmemory` and `mnemon`, and npm `memora`, are unrelated libraries.
`lightmem` on PyPI is version 0.0.0 (a placeholder), so LightMem has to come from the repo.

## 6. Shortlist to measure ourselves later

Chosen for being free, local, no vendor account, and having a stated, runnable benchmark: MemPalace (raw mode),
deja-vu, Hippo, tigerless agent-memory, OwnMem, SuperLocalMemory (Mode A), memsearch, claude-mem (already baselined in
docs/14), plus the benchmark harness repos `snap-research/locomo` and `xiaowu0162/LongMemEval` (data and scripts).
Keep the harness fixed (same reader, same judge, same top-k) and report retrieval recall and judged accuracy as two separate columns.

## 7. UNVERIFIED in this file

- LoCoMo, MemoryAgentBench and BEAM venue status (see section 1).
- Atlan's 49% for Mem0 on LongMemEval (search summary only).
- The vectorize.io claims about MemPalace tuning on the test set and LoCoMo 100% with top_k=50 (search summary only).
- The Towards AI claim that Letta did not rerun against Mem0's 92.5 (search summary only).
- The Penfield audit counts (the post was read; the audit repo was not).
- Exabase's methodology (paper page not reachable; press release read).
- Reddit threads: not reachable by search.
- Mem0's `ai-memory-benchmarks` blog URL returned 404; its research and library pages were used instead.
