import { and, eq } from "drizzle-orm";
import { db } from "./client.js";
import {
  devices,
  paperAnalysis,
  paperReproductionRecords,
  papers,
  ragPapers,
  userProfile,
} from "./schema.js";
import { logger } from "@/shared/logger.js";

/**
 * Idempotent seed: each row is checked by a natural key (paper.title,
 * device.name, reproduction record = (paperId, deviceId?), rag paper.title,
 * profile row id = 1) before inserting.
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
  /** 代码仓库 URL（paper-code-finder / repo-backfill 回写） */
  repoUrl: string | null;
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
  /** 训练修改记录，自由文本（reproduction-tracker skill 回写） */
  trainingNotes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * RAG 语料表（rag_papers）独立于 papers。用 title 作天然键去重。
 * rag_papers_fts 虚表由 triggers 自动同步，seed 只管主表即可。
 */
type RagPaperSeed = {
  title: string;
  abstract: string;
  authors: string[];
  venue: string | null;
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
    repoUrl: "https://github.com/tensorflow/tensor2tensor",
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
    repoUrl: null,
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
    repoUrl: null,
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
    repoUrl: "https://github.com/huggingface/transformers",
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
    trainingNotes: "lr=1e-4，warmup 4000 steps；比原文 bsz 从 4096 调到 2048 以适配 A100×4 内存。",
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
    trainingNotes:
      "Few-shot prompt 模板复用自论文附录 A；把温度从 0.7 降到 0，消除随机性对评估波动。",
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
    trainingNotes: null,
    startedAt: null,
    finishedAt: null,
  },
];

/**
 * rag_papers：给 /search 页面一份可检索的语料。条目不与 `papers` 表耦合，
 * 这里特意混入一些"papers 表里没有"的论文（venue/年代不同），既能测试
 * FTS5 检索，也能让前端展示更有层次。
 */
const ragPaperSeeds: RagPaperSeed[] = [
  {
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"],
    venue: "NeurIPS 2017",
    abstract:
      "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.",
  },
  {
    title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee", "Kristina Toutanova"],
    venue: "NAACL 2019",
    abstract:
      "We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.",
  },
  {
    title: "LLaMA: Open and Efficient Foundation Language Models",
    authors: ["Hugo Touvron", "Thibaut Lavril", "Gautier Izacard"],
    venue: "arXiv 2023",
    abstract:
      "We introduce LLaMA, a collection of foundation language models ranging from 7B to 65B parameters. We train our models on trillions of tokens, and show that it is possible to train state-of-the-art models using publicly available datasets exclusively, without resorting to proprietary and inaccessible datasets.",
  },
  {
    title: "Scaling Laws for Neural Language Models",
    authors: ["Jared Kaplan", "Sam McCandlish", "Tom Henighan"],
    venue: "arXiv 2020",
    abstract:
      "We study empirical scaling laws for language model performance on the cross-entropy loss. The loss scales as a power-law with model size, dataset size, and the amount of compute used for training, with some trends spanning more than seven orders of magnitude.",
  },
  {
    title: "Chinchilla: Training Compute-Optimal Large Language Models",
    authors: ["Jordan Hoffmann", "Sebastian Borgeaud", "Arthur Mensch"],
    venue: "NeurIPS 2022",
    abstract:
      "We investigate the optimal model size and number of tokens for training a transformer language model under a given compute budget. We find that current large language models are significantly undertrained, a consequence of the recent focus on scaling language models whilst keeping the amount of training data constant.",
  },
  {
    title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
    authors: ["Rafael Rafailov", "Archit Sharma", "Eric Mitchell"],
    venue: "NeurIPS 2023",
    abstract:
      "We introduce Direct Preference Optimization (DPO), a new parameterization of the reward model in RLHF that enables extraction of the corresponding optimal policy in closed form, allowing us to solve the standard RLHF problem with only a simple classification loss.",
  },
];

/**
 * user_profile：单行表，id 锁为 1。seed 只在当前 username 为空时填充一个
 * 默认值，避免覆盖用户在 Settings 页改过的名字。
 */
const DEFAULT_USERNAME = "Hermes Researcher";

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
          repoUrl: p.repoUrl,
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
      trainingNotes: r.trainingNotes,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    });
    logger.info(
      { paperTitle: r.paperTitle, deviceName: r.deviceName, status: r.status },
      "inserted reproduction record",
    );
  }
}

/**
 * rag_papers：按 title 去重。rag_papers_fts 虚表由 triggers 自动同步，
 * 这里不用手动碰 FTS 侧。
 */
async function upsertRagPapers() {
  for (const r of ragPaperSeeds) {
    const existing = await db
      .select({ id: ragPapers.id })
      .from(ragPapers)
      .where(eq(ragPapers.title, r.title))
      .limit(1);
    if (existing.length > 0) {
      logger.info({ title: r.title, id: existing[0]!.id }, "rag paper already exists, skipping");
      continue;
    }
    const [inserted] = await db
      .insert(ragPapers)
      .values({
        title: r.title,
        abstract: r.abstract,
        authorsJson: JSON.stringify(r.authors),
        venue: r.venue,
      })
      .returning({ id: ragPapers.id });
    if (!inserted) throw new Error(`Failed to insert rag paper "${r.title}"`);
    logger.info({ title: r.title, id: inserted.id }, "inserted rag paper");
  }
}

/**
 * user_profile：只在当前 row 不存在，或 username 为 null 时写入默认值。
 * 已设过用户名的本地环境不会被覆盖。
 */
async function upsertUserProfile() {
  const existing = await db.select().from(userProfile).limit(1);
  if (existing.length === 0) {
    await db.insert(userProfile).values({ id: 1, username: DEFAULT_USERNAME });
    logger.info({ username: DEFAULT_USERNAME }, "inserted default user profile");
    return;
  }
  const current = existing[0]!;
  if (current.username == null || current.username.trim() === "") {
    await db
      .update(userProfile)
      .set({ username: DEFAULT_USERNAME, updatedAt: new Date().toISOString() })
      .where(eq(userProfile.id, current.id));
    logger.info({ username: DEFAULT_USERNAME }, "filled empty username");
    return;
  }
  logger.info({ username: current.username }, "user profile already populated, skipping");
}

async function seed() {
  const titleToId = await upsertPapers();
  const nameToId = await upsertDevices();
  await upsertReproductionRecords(titleToId, nameToId);
  await upsertRagPapers();
  await upsertUserProfile();
  logger.info("Seed completed successfully");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
