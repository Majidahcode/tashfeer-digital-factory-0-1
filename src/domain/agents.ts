/**
 * The factory's specialised agents — names, roles and production order from the owner's prototype
 * («تحليل وبناء فكرة العميل» HTML, AG / ORD), with each agent's image from the reference package where one exists
 * (src/generated/asset-manifest.json → agents; three roles have none yet and show a placeholder).
 */
import manifest from "@/generated/asset-manifest.json";

export type Agent = {
  id: string;
  /** key in the asset manifest's agents */
  asset: keyof typeof manifest.agents;
  ar: string;
  en: string;
  spec: string;
  /** the placeholder's icon, for an agent whose image is not supplied yet */
  icon?: "roadmap" | "checklist" | "gauge";
};

export const AGENTS: readonly Agent[] = [
  {
    id: "pm",
    asset: "product-manager",
    ar: "مدير المنتج",
    en: "Product Manager",
    spec: "إدارة المنتج وتحديد النطاق",
    icon: "roadmap",
  },
  {
    id: "research",
    asset: "research",
    ar: "الباحث",
    en: "Research Agent",
    spec: "بحث السوق والمراجع",
  },
  {
    id: "req",
    asset: "requirements-analyst",
    ar: "محلل المتطلبات",
    en: "Requirements Analyst",
    spec: "تحليل المتطلبات",
    icon: "checklist",
  },
  {
    id: "ux",
    asset: "ux-ui",
    ar: "مصمم UX/UI",
    en: "UX/UI Designer",
    spec: "تجربة المستخدم والواجهات",
  },
  {
    id: "arch",
    asset: "software-architect",
    ar: "معماري البرمجيات",
    en: "Software Architect",
    spec: "البنية التقنية",
  },
  {
    id: "db",
    asset: "database",
    ar: "قاعدة البيانات",
    en: "Database Agent",
    spec: "نمذجة البيانات",
  },
  {
    id: "back",
    asset: "backend",
    ar: "المطور الخلفي",
    en: "Backend Developer",
    spec: "الخدمات والمنطق الخلفي",
  },
  {
    id: "front",
    asset: "frontend",
    ar: "المطور الأمامي",
    en: "Frontend Developer",
    spec: "تطوير الواجهة",
  },
  {
    id: "qa",
    asset: "qa",
    ar: "اختبار الجودة",
    en: "QA Agent",
    spec: "ضمان الجودة",
  },
  {
    id: "sec",
    asset: "cybersecurity",
    ar: "الأمن السيبراني",
    en: "Cybersecurity Agent",
    spec: "أمن المعلومات",
  },
  {
    id: "perf",
    asset: "performance",
    ar: "الأداء",
    en: "Performance Agent",
    spec: "تحسين الأداء",
    icon: "gauge",
  },
  {
    id: "ops",
    asset: "devops",
    ar: "العمليات",
    en: "DevOps Agent",
    spec: "التشغيل والنشر",
  },
];

export type AgentImage = { src: string; width: number; height: number } | null;

export function agentImage(a: Agent): AgentImage {
  const entry = manifest.agents[a.asset] as {
    status: string;
    src?: string;
    width?: number;
    height?: number;
  };
  return entry.status === "available" && entry.src
    ? {
        src: entry.src,
        width: entry.width ?? 1024,
        height: entry.height ?? 1536,
      }
    : null;
}

export type Analysis = {
  /** true when there was no idea to analyse: the values come from the example below */
  example: boolean;
  idea: string;
  type: string;
  audience: string;
  reasons: string[];
  suggested: string[];
};

export const EXAMPLE_IDEA =
  "منصة حجز مواعيد لعيادة، يحجز فيها العملاء ويدفعون مسبقًا.";

/**
 * A deterministic reading of the idea (the prototype's rules; no assistant is connected): the product type, who it
 * serves, which agents it needs and why. Every new product gets the core team; security joins when the idea holds
 * customers' data or payments, performance when it is an app or speed is mentioned.
 */
export function analyze(rawIdea: string): Analysis {
  const example = !rawIdea.trim();
  const t = example ? EXAMPLE_IDEA : rawIdea.trim();
  const type = /تطبيق|app/i.test(t)
    ? "تطبيق"
    : /متجر|تسوق|تسوّق/.test(t)
      ? "متجر إلكتروني"
      : "منصة / موقع ويب";
  const audience = /عياد[ةت]|مرضى|مريض/.test(t)
    ? "المرضى والعيادة"
    : /طلاب|طالب|تعليم/.test(t)
      ? "الطلاب والمعلمون"
      : /شركات|موظف/.test(t)
        ? "الشركات وفرق العمل"
        : /عملاء|زبائن|مستخدم/.test(t)
          ? "عملاء المشروع"
          : "يُحدَّد مع مدير المنتج";
  const suggested = new Set([
    "pm",
    "research",
    "req",
    "ux",
    "arch",
    "front",
    "back",
    "db",
    "qa",
    "ops",
  ]);
  const reasons = [
    "فريق متكامل لبناء فكرتك: النطاق والبحث والتصميم والبناء والاختبار والتشغيل",
  ];
  if (/حجز|مواعيد|دفع|متجر|حساب|مستخدم|بيانات|عملاء/.test(t)) {
    suggested.add("sec");
    reasons.push("الفكرة تتضمن بيانات عملاء أو مدفوعات: تحتاج مراجعة أمنية");
  }
  if (/تطبيق|بطيء|سرعة|أداء/.test(t)) {
    suggested.add("perf");
    reasons.push("الأداء مذكور أو متوقع في الفكرة");
  }
  return {
    example,
    idea: t,
    type,
    audience,
    reasons,
    suggested: AGENTS.map((a) => a.id).filter((id) => suggested.has(id)),
  };
}

/** «N وكلاء مختارون» with the Arabic number agreement. */
export function chosenLabel(n: number): string {
  if (n === 0) return "لم يُختر أي وكيل";
  if (n === 1) return "وكيل واحد مختار";
  if (n === 2) return "وكيلان مختاران";
  if (n <= 10) return `${n} وكلاء مختارون`;
  return `${n} وكيلًا مختارًا`;
}
