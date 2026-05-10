import { and, eq } from "drizzle-orm";
import { db } from "./client.js";
import { devices, paperAnalysis, paperReproductionRecords, papers } from "./schema.js";
import { logger } from "@/shared/logger.js";

/**
 * Idempotent seed: each row is checked by a natural key (paper.title,
 * device.name, reproduction record = (paperId, deviceId?)) before inserting.
 * Running this script multiple times will top up any missing sample data
 * without duplicating existing rows.
 */

type PaperSeed = {
  title: string;
  authors: string[];
  abstract: string | null;
  field: string | null;
  source: string | null;
  publishedYear: number | null;
  paperUrl: string | null;
  pdfUrl: string | null;
  pdfStoragePath: string | null;
  analysis: {
    taskDefinition: string | null;
    researchQuestions: string | null;
    methodOverview: string | null;
    metrics: string | null;
    conclusion: string | null;
    notes: string | null;
  } | null;
};

type DeviceSeed = {
  name: string;
  deviceType: string | null;
  status: "idle" | "running" | "offline" | "error";
  location: string | null;
  description: string | null;
};

type ReproductionSeed = {
  paperTitle: string;
  deviceName: string | null;
  status: "not_started" | "running" | "success" | "failed" | "paused";
  progress: number;
  resultSummary: string | null;
  artifactUrl: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

const paperSeeds: PaperSeed[] = [
  {
    title: "Attention Is All You Need",
    authors: [
      "Ashish Vaswani",
      "Noam Shazeer",
      "Niki Parmar",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N. Gomez",
      "Lukasz Kaiser",
      "Illia Polosukhin",
    ],
    abstract:
      "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
    field: "Transformer",
    source: "NeurIPS",
    publishedYear: 2017,
    paperUrl: "https://papers.nips.cc/paper/7181-attention-is-all-you-need",
    pdfUrl: "https://papers.nips.cc/paper/7181-attention-is-all-you-need.pdf",
    pdfStoragePath: "NIPS-2017-attention-is-all-you-need-Paper.pdf",
    analysis: {
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
  },
  {
    title: "Conditional Memory via Scalable Lookup",
    authors: [],
    abstract: "Local-only sample; metadata not yet filled in.",
    field: null,
    source: null,
    publishedYear: null,
    paperUrl: null,
    pdfUrl: null,
    pdfStoragePath: "Conditional Memory via Scalable Lookup.pdf",
    analysis: null,
  },
  {
    title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
    authors: ["Jason Wei", "Xuezhi Wang", "Dale Schuurmans"],
    abstract:
      "We explore how chain-of-thought prompting can improve the reasoning ability of large language models...",
    field: "LLM Reasoning",
    source: "NeurIPS",
    publishedYear: 2022,
    paperUrl: "https://arxiv.org/abs/2201.11903",
    pdfUrl: "https://arxiv.org/pdf/2201.11903.pdf",
    pdfStoragePath: null,
    analysis: {
      taskDefinition: "Improve multi-step reasoning in LLMs via prompting.",
      researchQuestions: "Can intermediate reasoning steps boost final answer accuracy?",
      methodOverview: "Chain-of-thought (CoT) prompting with few-shot examples.",
      metrics: "GSM8K, SVAMP, MAWPS accuracy.",
      conclusion:
        "CoT prompting substantially improves reasoning on arithmetic and commonsense tasks.",
      notes: null,
    },
  },
  {
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    authors: ["Patrick Lewis", "Ethan Perez", "Aleksandra Piktus"],
    abstract:
      "We introduce RAG models, a general-purpose fine-tuning recipe that combines pre-trained parametric and non-parametric memory...",
    field: "RAG",
    source: "arXiv",
    publishedYear: 2020,
    paperUrl: "https://arxiv.org/abs/2005.11401",
    pdfUrl: "https://arxiv.org/pdf/2005.11401.pdf",
    pdfStoragePath: null,
    analysis: {
      taskDefinition: "Knowledge-intensive QA and generation with external retrieval.",
      researchQuestions: "Can retrieval+generation outperform closed-book LMs on KI tasks?",
      methodOverview: "DPR retriever + BART generator, jointly fine-tuned.",
      metrics: "NaturalQuestions, TriviaQA, WebQuestions EM.",
      conclusion: "RAG outperforms parametric-only and extractive baselines.",
      notes: null,
    },
  },
];

const deviceSeeds: DeviceSeed[] = [
  {
    name: "GPU-Server-01",
    deviceType: "GPU Server",
    status: "idle",
    location: "Lab A",
    description: "A100 80G x 4",
  },
  {
    name: "GPU-Server-02",
    deviceType: "GPU Server",
    status: "running",
    location: "Lab A",
    description: "H100 80G x 8",
  },
  {
    name: "Dev-Workstation",
    deviceType: "Workstation",
    status: "idle",
    location: "Lab B",
    description: "RTX 4090, shared dev box",
  },
  {
    name: "Edge-Node-01",
    deviceType: "Edge",
    status: "offline",
    location: "Remote",
    description: "Jetson Orin cluster, currently offline for maintenance",
  },
];

const reproductionSeeds: ReproductionSeed[] = [
  {
    paperTitle: "Attention Is All You Need",
    deviceName: "GPU-Server-01",
    status: "running",
    progress: 45,
    resultSummary: null,
    artifactUrl: null,
    startedAt: hoursAgoIso(6),
    finishedAt: null,
  },
  {
    paperTitle: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
    deviceName: "GPU-Server-02",
    status: "success",
    progress: 100,
    resultSummary: "Replicated GSM8K CoT accuracy within 1.2 points of the paper.",
    artifactUrl: "https://example.com/artifacts/cot-replication.zip",
    startedAt: hoursAgoIso(30),
    finishedAt: hoursAgoIso(26),
  },
  {
    paperTitle: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    deviceName: null,
    status: "not_started",
    progress: 0,
    resultSummary: null,
    artifactUrl: null,
    startedAt: null,
    finishedAt: null,
  },
];

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

async function upsertPapers() {
  const titleToId = new Map<string, string>();
  for (const p of paperSeeds) {
    const existing = await db.select().from(papers).where(eq(papers.title, p.title)).limit(1);
    let id: string;
    if (existing.length > 0) {
      id = existing[0]!.id;
      logger.info({ title: p.title, id }, "paper already exists, skipping insert");
    } else {
      const [inserted] = await db
        .insert(papers)
        .values({
          title: p.title,
          authorsJson: JSON.stringify(p.authors),
          abstract: p.abstract,
          field: p.field,
          source: p.source,
          publishedYear: p.publishedYear,
          paperUrl: p.paperUrl,
          pdfUrl: p.pdfUrl,
          pdfStoragePath: p.pdfStoragePath,
        })
        .returning({ id: papers.id });
      if (!inserted) throw new Error(`Failed to insert paper "${p.title}"`);
      id = inserted.id;
      logger.info({ title: p.title, id }, "inserted paper");
    }
    titleToId.set(p.title, id);

    if (p.analysis) {
      const hasAnalysis = await db
        .select({ id: paperAnalysis.id })
        .from(paperAnalysis)
        .where(eq(paperAnalysis.paperId, id))
        .limit(1);
      if (hasAnalysis.length === 0) {
        await db.insert(paperAnalysis).values({ paperId: id, ...p.analysis });
        logger.info({ title: p.title }, "inserted analysis");
      }
    }
  }
  return titleToId;
}

async function upsertDevices() {
  const nameToId = new Map<string, string>();
  for (const d of deviceSeeds) {
    const existing = await db.select().from(devices).where(eq(devices.name, d.name)).limit(1);
    let id: string;
    if (existing.length > 0) {
      id = existing[0]!.id;
      logger.info({ name: d.name, id }, "device already exists, skipping insert");
    } else {
      const [inserted] = await db
        .insert(devices)
        .values({
          name: d.name,
          deviceType: d.deviceType,
          status: d.status,
          location: d.location,
          description: d.description,
        })
        .returning({ id: devices.id });
      if (!inserted) throw new Error(`Failed to insert device "${d.name}"`);
      id = inserted.id;
      logger.info({ name: d.name, id }, "inserted device");
    }
    nameToId.set(d.name, id);
  }
  return nameToId;
}

async function upsertReproductionRecords(
  titleToId: Map<string, string>,
  nameToId: Map<string, string>,
) {
  for (const r of reproductionSeeds) {
    const paperId = titleToId.get(r.paperTitle);
    if (!paperId) {
      logger.warn({ paperTitle: r.paperTitle }, "skipping record: paper not seeded");
      continue;
    }
    const deviceId = r.deviceName ? (nameToId.get(r.deviceName) ?? null) : null;

    // Natural key: paperId + (deviceId or null). If a record already exists
    // for this combination, we leave it alone to preserve any manual edits.
    const whereExisting = deviceId
      ? and(
          eq(paperReproductionRecords.paperId, paperId),
          eq(paperReproductionRecords.deviceId, deviceId),
        )
      : eq(paperReproductionRecords.paperId, paperId);

    const existing = await db
      .select({ id: paperReproductionRecords.id })
      .from(paperReproductionRecords)
      .where(whereExisting)
      .limit(1);

    if (existing.length > 0) {
      logger.info(
        { paperTitle: r.paperTitle, deviceName: r.deviceName },
        "reproduction record already exists, skipping",
      );
      continue;
    }

    await db.insert(paperReproductionRecords).values({
      paperId,
      deviceId,
      status: r.status,
      progress: r.progress,
      resultSummary: r.resultSummary,
      artifactUrl: r.artifactUrl,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    });
    logger.info(
      { paperTitle: r.paperTitle, deviceName: r.deviceName, status: r.status },
      "inserted reproduction record",
    );
  }
}

async function seed() {
  const titleToId = await upsertPapers();
  const nameToId = await upsertDevices();
  await upsertReproductionRecords(titleToId, nameToId);
  logger.info("Seed completed successfully");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
