import { db } from "./client.js";
import {
  devices,
  paperAnalysis,
  paperReproductionRecords,
  papers,
  ragPapers,
} from "./schema.js";
import { logger } from "@/shared/logger.js";

async function seed() {
  await seedLegacyPapers();
  await seedRagPapers();
}

async function seedLegacyPapers() {
  const existing = await db.select({ id: papers.id }).from(papers).limit(1);
  if (existing.length > 0) {
    logger.info("Seed (papers) skipped: not empty");
    return;
  }

  // ---------- papers with local PDFs (used to verify local streaming) ----------
  const [paperAttention] = await db
    .insert(papers)
    .values({
      title: "Attention Is All You Need",
      authorsJson: JSON.stringify([
        "Ashish Vaswani",
        "Noam Shazeer",
        "Niki Parmar",
        "Jakob Uszkoreit",
        "Llion Jones",
        "Aidan N. Gomez",
        "Lukasz Kaiser",
        "Illia Polosukhin",
      ]),
      abstract:
        "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
      field: "Transformer",
      source: "NeurIPS",
      publishedYear: 2017,
      paperUrl: "https://papers.nips.cc/paper/7181-attention-is-all-you-need",
      pdfUrl: "https://papers.nips.cc/paper/7181-attention-is-all-you-need.pdf",
      pdfStoragePath: "NIPS-2017-attention-is-all-you-need-Paper.pdf",
    })
    .returning();

  const [paperConditionalMemory] = await db
    .insert(papers)
    .values({
      title: "Conditional Memory via Scalable Lookup",
      // Authors & metadata not verified from an authoritative source; kept as
      // placeholder so the local-PDF path can be exercised end-to-end.
      authorsJson: JSON.stringify([]),
      abstract: "Local-only sample; metadata not yet filled in.",
      field: null,
      source: null,
      publishedYear: null,
      paperUrl: null,
      pdfUrl: null,
      pdfStoragePath: "Conditional Memory via Scalable Lookup.pdf",
    })
    .returning();

  // ---------- papers without local PDFs (used to verify 302 redirect path) ----------
  const [paperCoT] = await db
    .insert(papers)
    .values({
      title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
      authorsJson: JSON.stringify(["Jason Wei", "Xuezhi Wang", "Dale Schuurmans"]),
      abstract:
        "We explore how chain-of-thought prompting can improve the reasoning ability of large language models...",
      field: "LLM Reasoning",
      source: "NeurIPS",
      publishedYear: 2022,
      paperUrl: "https://arxiv.org/abs/2201.11903",
      pdfUrl: "https://arxiv.org/pdf/2201.11903.pdf",
    })
    .returning();

  const [paperRag] = await db
    .insert(papers)
    .values({
      title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
      authorsJson: JSON.stringify(["Patrick Lewis", "Ethan Perez", "Aleksandra Piktus"]),
      abstract:
        "We introduce RAG models, a general-purpose fine-tuning recipe that combines pre-trained parametric and non-parametric memory...",
      field: "RAG",
      source: "arXiv",
      publishedYear: 2020,
      paperUrl: "https://arxiv.org/abs/2005.11401",
      pdfUrl: "https://arxiv.org/pdf/2005.11401.pdf",
    })
    .returning();

  if (!paperAttention || !paperConditionalMemory || !paperCoT || !paperRag) {
    throw new Error("Seed failed: could not insert papers");
  }

  await db.insert(paperAnalysis).values([
    {
      paperId: paperAttention.id,
      taskDefinition: "Sequence transduction (machine translation, parsing).",
      researchQuestions:
        "Can attention-only architectures match or outperform recurrent/convolutional models?",
      methodOverview:
        "Encoder-decoder Transformer with multi-head self-attention and positional encodings.",
      metrics: "WMT14 EN-DE / EN-FR BLEU.",
      conclusion:
        "The Transformer achieves SOTA translation quality with significantly less training time.",
      notes: null,
    },
    {
      paperId: paperCoT.id,
      taskDefinition: "Improve multi-step reasoning in LLMs via prompting.",
      researchQuestions: "Can intermediate reasoning steps boost final answer accuracy?",
      methodOverview: "Chain-of-thought (CoT) prompting with few-shot examples.",
      metrics: "GSM8K, SVAMP, MAWPS accuracy.",
      conclusion:
        "CoT prompting substantially improves reasoning on arithmetic and commonsense tasks.",
      notes: null,
    },
    {
      paperId: paperRag.id,
      taskDefinition: "Knowledge-intensive QA and generation with external retrieval.",
      researchQuestions: "Can retrieval+generation outperform closed-book LMs on KI tasks?",
      methodOverview: "DPR retriever + BART generator, jointly fine-tuned.",
      metrics: "NaturalQuestions, TriviaQA, WebQuestions EM.",
      conclusion: "RAG outperforms parametric-only and extractive baselines.",
      notes: null,
    },
  ]);

  const [device] = await db
    .insert(devices)
    .values({
      name: "GPU-Server-01",
      deviceType: "GPU Server",
      status: "idle",
      location: "Lab A",
      description: "A100 80G x 4",
    })
    .returning();
  if (!device) throw new Error("Seed failed: could not insert device");

  await db.insert(paperReproductionRecords).values({
    paperId: paperAttention.id,
    deviceId: device.id,
    status: "running",
    progress: 45,
    resultSummary: null,
    artifactUrl: null,
    startedAt: new Date().toISOString(),
  });

  logger.info("Seed (papers) completed");
}

/**
 * RAG 知识库种子。
 *
 * 这组数据独立于 papers 表，专为 /search FTS5 检索服务。title + abstract 都选
 * 前端 "Recent" 芯片能直接命中的主题（Attention / MoE / KV cache），方便
 * 冒烟验证 "点击 recent → 返回结果" 这一最小闭环。
 */
async function seedRagPapers() {
  const existing = await db.select({ id: ragPapers.id }).from(ragPapers).limit(1);
  if (existing.length > 0) {
    logger.info("Seed (rag_papers) skipped: not empty");
    return;
  }

  await db.insert(ragPapers).values([
    {
      title: "Attention Is All You Need",
      authorsJson: JSON.stringify([
        "Ashish Vaswani",
        "Noam Shazeer",
        "Niki Parmar",
      ]),
      venue: "NeurIPS 2017",
      abstract:
        "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
    },
    {
      title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness",
      authorsJson: JSON.stringify(["Tri Dao", "Daniel Y. Fu", "Stefano Ermon"]),
      venue: "NeurIPS 2022",
      abstract:
        "We propose FlashAttention, a new attention algorithm that computes exact attention with far fewer memory accesses. We avoid reading and writing the attention matrix to and from HBM. This requires computing the softmax reduction without access to the whole input, and not storing the large intermediate attention matrix for the backward pass.",
    },
    {
      title: "Self-Attention with Relative Position Representations and Theoretical Bounds",
      authorsJson: JSON.stringify(["Peter Shaw", "Jakob Uszkoreit"]),
      venue: "NAACL 2018",
      abstract:
        "We present an extension of self-attention that incorporates relative position representations and derive bounds on the attention mechanism's expressiveness. Our analysis yields tighter bounds on the number of heads and the hidden dimension needed to approximate arbitrary permutation equivariant functions.",
    },
    {
      title: "GQA: Training Generalized Multi-Query Attention",
      authorsJson: JSON.stringify(["Joshua Ainslie", "James Lee-Thorp"]),
      venue: "ArXiv 2023",
      abstract:
        "Multi-query attention (MQA) reduces decoder memory bandwidth by sharing key and value heads. We propose grouped-query attention (GQA), an interpolation of multi-head and multi-query attention with a single key and value head per group, achieving quality close to MHA with speed comparable to MQA.",
    },
    {
      title: "Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity",
      authorsJson: JSON.stringify(["William Fedus", "Barret Zoph", "Noam Shazeer"]),
      venue: "JMLR 2022",
      abstract:
        "In deep learning, models typically reuse the same parameters for all inputs. Mixture of Experts (MoE) defies this and instead selects different parameters for each incoming example. The Switch Transformer simplifies MoE routing by selecting a single expert per token, stabilizing training and dramatically reducing communication cost.",
    },
    {
      title: "Mixture-of-Experts with Expert Choice Routing",
      authorsJson: JSON.stringify(["Yanqi Zhou", "Tao Lei"]),
      venue: "NeurIPS 2022",
      abstract:
        "We propose a heterogeneous mixture-of-experts model where experts choose tokens rather than tokens choosing experts, leading to perfect load balance and improved routing stability. This addresses the MoE routing stability problem and achieves better downstream task performance under the same compute budget.",
    },
    {
      title: "H2O: Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models",
      authorsJson: JSON.stringify(["Zhenyu Zhang", "Ying Sheng", "Tianyi Zhou"]),
      venue: "NeurIPS 2023",
      abstract:
        "Deploying large language models at inference time is bottlenecked by KV cache size. We propose Heavy-Hitter Oracle, a KV cache eviction policy that dynamically retains a balance of recent and heavy-hitter tokens. H2O enables significant KV cache compression with minimal quality loss.",
    },
    {
      title: "StreamingLLM: Efficient Streaming Language Models with Attention Sinks",
      authorsJson: JSON.stringify(["Guangxuan Xiao", "Yuandong Tian"]),
      venue: "ICLR 2024",
      abstract:
        "We enable LLMs to generalize to infinite sequence length without fine-tuning by preserving the first few attention sink tokens together with a sliding window KV cache. StreamingLLM combines attention sinks with KV cache compression and achieves up to 22x speedup over recomputation baselines.",
    },
    {
      title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
      authorsJson: JSON.stringify(["Patrick Lewis", "Ethan Perez", "Aleksandra Piktus"]),
      venue: "NeurIPS 2020",
      abstract:
        "We introduce RAG models, a general-purpose fine-tuning recipe that combines pre-trained parametric and non-parametric memory. Our RAG framework combines a dense vector retriever with a seq2seq generator and outperforms parametric-only and extractive baselines on open-domain question answering.",
    },
    {
      title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
      authorsJson: JSON.stringify(["Jason Wei", "Xuezhi Wang", "Dale Schuurmans"]),
      venue: "NeurIPS 2022",
      abstract:
        "We explore how chain-of-thought prompting, which provides intermediate reasoning steps as part of few-shot exemplars, can improve the ability of large language models to perform complex reasoning. Chain-of-thought prompting substantially improves performance on arithmetic, commonsense, and symbolic reasoning benchmarks.",
    },
  ]);

  logger.info("Seed (rag_papers) completed");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
