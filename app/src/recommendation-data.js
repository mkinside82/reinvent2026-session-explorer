// Shared, deterministic recommendation signals for the browser UI and MCP.
export const TREND_SIGNALS = Object.freeze([
  {
    id: 'production-agents',
    title: 'AIエージェントを本番運用する',
    reason:
      'AWS re:Invent 2026の公式キュレーションで、エージェントの安全性・信頼性と本番化が取り上げられています。設計だけでなく、評価・権限・運用まで扱うセッションを優先しました。',
    terms: ['agent', 'agentcore', 'agents', 'エージェント'],
    sources: [
      {
        label: 'AWS re:Invent 2026 · Curated Agendas',
        url: 'https://aws.amazon.com/events/reinvent/sessions/curated-agendas/',
      },
      {
        label: 'AWS News Blog · What’s Next with AWS 2026',
        url: 'https://aws.amazon.com/blogs/aws/top-announcements-of-the-whats-next-with-aws-2026/',
      },
    ],
    verifiedAt: '2026-10-05',
    expiresAt: '2026-10-19',
  },
  {
    id: 'secure-agents',
    title: 'エージェントの権限と安全性を設計する',
    reason:
      'AWS公式の今年のSecurity Focusはagentic securityを含み、ガバナンス・ID・認可・安全策を扱うと案内しています。AIを作るだけでなく、制御方法を学べる候補です。',
    terms: ['agent', 'security', 'identity', 'governance', 'authorization', '安全'],
    sources: [
      {
        label: 'AWS re:Invent 2026 · Security Focus',
        url: 'https://aws.amazon.com/events/reinvent/sessions/security-focus/',
      },
      {
        label: 'AWS re:Invent 2026 · Curated Agendas',
        url: 'https://aws.amazon.com/events/reinvent/sessions/curated-agendas/',
      },
    ],
    verifiedAt: '2026-10-05',
    expiresAt: '2026-10-19',
  },
  {
    id: 'hands-on-learning',
    title: '実際に手を動かして学ぶ',
    reason:
      'AWS re:Invent 2026は2,200以上のセッションを掲載し、その70%をインタラクティブ形式と案内しています。講演を聞くだけでなく、WorkshopやBuilders’ sessionなど手を動かせる形式を優先しました。',
    terms: ['workshop', 'builders', 'chalk talk', 'hands-on', 'interactive'],
    sources: [
      {
        label: 'AWS re:Invent 2026 · Session Types & Learning Formats',
        url: 'https://aws.amazon.com/events/reinvent/sessions/how-youll-learn/',
      },
      { label: 'AWS re:Invent 2026 · Session Catalog', url: 'https://catalog.awsevents.com/' },
    ],
    verifiedAt: '2026-10-06',
    expiresAt: '2026-12-05',
  },
]);

export const RECOMMENDATION_INTERESTS = Object.freeze([
  {
    id: 'ai',
    label: 'AI / ML',
    terms: [
      'artificial intelligence',
      'machine learning',
      'ai/ml',
      ' ml ',
      'ai ',
      'model',
      'neural',
    ],
  },
  {
    id: 'genai',
    label: 'Generative AI',
    terms: ['generative ai', 'genai', 'llm', 'large language model', 'foundation model'],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    terms: ['architecture', 'architect', 'design pattern', 'distributed system'],
  },
  { id: 'serverless', label: 'Serverless', terms: ['serverless', 'lambda', 'step functions'] },
  {
    id: 'containers',
    label: 'Containers',
    terms: ['container', 'kubernetes', 'eks', 'ecs', 'docker'],
  },
  {
    id: 'security',
    label: 'Security',
    terms: ['security', 'identity', 'authorization', 'governance', 'compliance'],
  },
  {
    id: 'database',
    label: 'Database',
    terms: ['database', 'sql', 'dynamodb', 'aurora', 'postgres', 'redis'],
  },
  { id: 'saas', label: 'SaaS', terms: ['saas', 'software as a service', 'marketplace'] },
  {
    id: 'developer-tools',
    label: 'Developer Tools',
    terms: ['developer tool', 'developer experience', 'devops', 'sdk', 'cli', 'code'],
  },
]);
