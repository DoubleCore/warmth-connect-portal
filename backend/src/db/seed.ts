import { db } from "./client.js";
import { devices, paperAnalysis, paperReproductionRecords, papers } from "./schema.js";
import { logger } from "@/shared/logger.js";

async function seed() {
  const existing = await db.select({ id: papers.id }).from(papers).limit(1);
  if (existing.length > 0) {
    logger.info("Seed skipped: papers table is not empty");
    return;
  }

  const [paperA] = await db
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

  const [paperB] = await db
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

  if (!paperA || !paperB) throw new Error("Seed failed: could not insert papers");

  await db.insert(paperAnalysis).values([
    {
      paperId: paperA.id,
      taskDefinition: "Improve multi-step reasoning in LLMs via prompting.",
      researchQuestions: "Can intermediate reasoning steps boost final answer accuracy?",
      methodOverview: "Chain-of-thought (CoT) prompting with few-shot examples.",
      metrics: "GSM8K, SVAMP, MAWPS accuracy.",
      conclusion: "CoT prompting substantially improves reasoning on arithmetic and commonsense tasks.",
      notes: null,
    },
    {
      paperId: paperB.id,
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
    paperId: paperA.id,
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
