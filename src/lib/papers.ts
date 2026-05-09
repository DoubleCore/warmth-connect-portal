export type Paper = {
  id: string;
  title: string;
  authors: string[];
  domains: string[];
  source: string;
  year: number;
  abstract: string;
  analysis: {
    summary: string;
    task: { primary: string; datasets: string; goal: string };
    metrics: { label: string; value: string; note?: string }[];
    training: { cost: string; hardware: string };
  };
};

export const papers: Paper[] = [
  {
    id: "attention-is-all-you-need",
    title: "Attention Is All You Need",
    authors: [
      "Ashish Vaswani",
      "Noam Shazeer",
      "Niki Parmar",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N. Gomez",
      "Łukasz Kaiser",
      "Illia Polosukhin",
    ],
    domains: ["Natural Language Processing"],
    source: "arXiv",
    year: 2017,
    abstract:
      "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.\n\nExperiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU.",
    analysis: {
      summary:
        "This paper introduces the Transformer, a novel network architecture relying entirely on attention mechanisms to draw global dependencies between input and output, eschewing recurrence and convolutions. It achieves state-of-the-art results on machine translation tasks while offering significant improvements in training speed and parallelization.",
      task: {
        primary: "Sequence Transduction (specifically Machine Translation).",
        datasets: "WMT 2014 English-to-German, WMT 2014 English-to-French.",
        goal: "Improve parallelization during training and reduce reliance on sequential processing while maintaining or exceeding state-of-the-art translation quality.",
      },
      metrics: [
        { label: "EN-DE BLEU Score", value: "28.4", note: "+2.0 vs Previous SOTA" },
        { label: "EN-FR BLEU Score", value: "41.8", note: "Single Model SOTA" },
      ],
      training: { cost: "3.3e18 FLOPs", hardware: "8 P100 GPUs (3.5 days)" },
    },
  },
  {
    id: "gpt-3-few-shot-learners",
    title: "Language Models are Few-Shot Learners",
    authors: ["Tom B. Brown", "et al."],
    domains: ["NLP", "LLM"],
    source: "NeurIPS",
    year: 2020,
    abstract:
      "We demonstrate that scaling up language models greatly improves task-agnostic, few-shot performance, sometimes even reaching competitiveness with prior state-of-the-art fine-tuning approaches.",
    analysis: {
      summary:
        "GPT-3 demonstrates that large autoregressive language models can perform a wide range of tasks with few-shot prompting, without gradient updates or fine-tuning.",
      task: {
        primary: "Few-shot in-context learning across NLP tasks.",
        datasets: "Common Crawl, WebText2, Books, Wikipedia.",
        goal: "Show that scale alone unlocks emergent few-shot capabilities.",
      },
      metrics: [
        { label: "Parameters", value: "175B" },
        { label: "Tokens Trained", value: "300B" },
      ],
      training: { cost: "~3.14e23 FLOPs", hardware: "V100 cluster" },
    },
  },
  {
    id: "resnet-deep-residual-learning",
    title: "Deep Residual Learning for Image Recognition",
    authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
    domains: ["CV"],
    source: "CVPR",
    year: 2016,
    abstract:
      "Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously.",
    analysis: {
      summary:
        "Introduces residual connections that allow training of very deep networks (up to 152 layers) and won ILSVRC 2015 classification.",
      task: {
        primary: "Image Classification and Detection.",
        datasets: "ImageNet, CIFAR-10, COCO.",
        goal: "Solve the degradation problem in very deep networks.",
      },
      metrics: [
        { label: "ImageNet Top-5 Error", value: "3.57%" },
        { label: "Depth", value: "152 layers" },
      ],
      training: { cost: "—", hardware: "8 GPUs" },
    },
  },
  {
    id: "bert-pretraining",
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee", "Kristina Toutanova"],
    domains: ["NLP"],
    source: "NAACL",
    year: 2019,
    abstract:
      "We introduce BERT, which stands for Bidirectional Encoder Representations from Transformers, designed to pre-train deep bidirectional representations from unlabeled text.",
    analysis: {
      summary:
        "BERT pre-trains bidirectional transformer encoders with masked language modeling and next-sentence prediction, achieving SOTA on 11 NLP tasks.",
      task: {
        primary: "Pre-training + fine-tuning across NLU benchmarks.",
        datasets: "BooksCorpus, English Wikipedia.",
        goal: "Unify NLP tasks under a single bidirectional pre-trained representation.",
      },
      metrics: [
        { label: "GLUE Score", value: "80.5" },
        { label: "SQuAD v1.1 F1", value: "93.2" },
      ],
      training: { cost: "—", hardware: "16 TPU chips (4 days)" },
    },
  },
  {
    id: "vit-image-16x16",
    title: "An Image is Worth 16x16 Words",
    authors: ["Alexey Dosovitskiy", "et al."],
    domains: ["CV"],
    source: "ICLR",
    year: 2021,
    abstract:
      "We show that a pure transformer applied directly to sequences of image patches can perform very well on image classification tasks.",
    analysis: {
      summary:
        "ViT splits images into patches and feeds them as tokens into a transformer encoder, matching or beating CNNs when trained on large datasets.",
      task: { primary: "Image Classification.", datasets: "ImageNet, JFT-300M.", goal: "Replace CNNs with pure transformers for vision." },
      metrics: [
        { label: "ImageNet Top-1", value: "88.55%" },
        { label: "Patch Size", value: "16x16" },
      ],
      training: { cost: "—", hardware: "TPUv3 cluster" },
    },
  },
  {
    id: "llama-foundation-lms",
    title: "LLaMA: Open and Efficient Foundation LMs",
    authors: ["Hugo Touvron", "et al."],
    domains: ["LLM"],
    source: "arXiv",
    year: 2023,
    abstract:
      "We introduce LLaMA, a collection of foundation language models ranging from 7B to 65B parameters, trained on trillions of tokens from publicly available datasets.",
    analysis: {
      summary:
        "LLaMA shows that competitive foundation models can be trained exclusively on public data, releasing efficient checkpoints from 7B to 65B parameters.",
      task: { primary: "Foundation Language Modeling.", datasets: "Public-only mixture (CCNet, C4, GitHub, Wikipedia, ArXiv, StackExchange).", goal: "Train compute-optimal open foundation models." },
      metrics: [
        { label: "LLaMA-65B MMLU", value: "63.4" },
        { label: "Tokens Trained", value: "1.4T" },
      ],
      training: { cost: "—", hardware: "2048 A100 GPUs" },
    },
  },
];

export function getPaper(id: string): Paper | undefined {
  return papers.find((p) => p.id === id);
}