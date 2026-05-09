import { db } from "./client.js";
import { devices, paperAnalysis, paperReproductionRecords, papers } from "./schema.js";
import { logger } from "@/shared/logger.js";

async function seed() {
  const existing = await db.select({ id: papers.id }).from(papers).limit(1);
  if (existing.length > 0) {
    logger.info("Seed skipped: papers table is not empty");
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

  logger.info("Seed completed successfully");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
