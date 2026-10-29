/**
 * What each agent would do in the visitor's project — a proposed plan, from the owner's prototype («تحليل وبناء فكرة
 * العميل» HTML: AG's mission / recv / does / out / tools / next, PR's lines for the project, and the production stages).
 * Nothing here runs: no assistant is connected and no work has started.
 */
import { analyze } from "./agents";

export type AgentPlan = {
  mission: string;
  receives: string;
  tasks: string;
  delivers: string;
  tools: string;
  handsTo: string;
};

export const PLANS: Record<string, AgentPlan> = {
  pm: {
    mission: "يحوّل فكرتك إلى نطاق ومراحل وأولويات واضحة",
    receives: "وصفك والمرفقات",
    tasks: "تحديد النطاق · ترتيب الأولويات · تنسيق الاعتماد",
    delivers: "وثيقة نطاق المنتج وخارطة المراحل",
    tools: "Notion · Linear",
    handsTo: "الباحث",
  },
  research: {
    mission: "يدرس المشاريع المشابهة ويجمع مراجع التصميم",
    receives: "وثيقة النطاق والروابط",
    tasks: "تحليل المنافسين · جمع المراجع · تلخيص الاتجاهات",
    delivers: "ملخص بحثي ومراجع",
    tools: "بحث ويب · لوحات مرجعية",
    handsTo: "محلل المتطلبات",
  },
  req: {
    mission: "يصوغ احتياجاتك في متطلبات قابلة للتنفيذ",
    receives: "الملخص البحثي والنطاق",
    tasks: "قصص المستخدم · معايير القبول · قيود النظام",
    delivers: "قائمة متطلبات وظيفية وغير وظيفية",
    tools: "User Stories · BPMN",
    handsTo: "مصمم UX/UI",
  },
  ux: {
    mission: "يصمم الهيكل والتدفقات ونموذجي التصور A/B",
    receives: "المتطلبات والمراجع",
    tasks: "هيكل الصفحات · نظام التصميم · نماذج أولية",
    delivers: "نموذجان للمراجعة ونظام تصميم",
    tools: "Figma · Design Tokens",
    handsTo: "معماري البرمجيات",
  },
  arch: {
    mission: "يحدد التقنيات وتقسيم المكونات والخدمات",
    receives: "التصور المعتمد والمتطلبات",
    tasks: "اختيار المكدس · تصميم الخدمات · قرارات المعمارية",
    delivers: "مخطط البنية ووثيقة القرارات",
    tools: "Next.js · Node · C4",
    handsTo: "قاعدة البيانات",
  },
  db: {
    mission: "يصمم مخطط البيانات والعلاقات والنسخ الاحتياطي",
    receives: "المتطلبات ومخطط البنية",
    tasks: "تصميم الجداول · الفهارس · سياسات الحفظ",
    delivers: "مخطط قاعدة البيانات",
    tools: "PostgreSQL · Prisma",
    handsTo: "المطور الخلفي",
  },
  back: {
    mission: "يبني الواجهات البرمجية وقواعد العمل",
    receives: "مخطط البنية ونموذج البيانات",
    tasks: "بناء API · المصادقة · قواعد العمل",
    delivers: "خدمات خلفية موثّقة",
    tools: "Node.js · OpenAPI",
    handsTo: "المطور الأمامي",
  },
  front: {
    mission: "يبني الواجهة التفاعلية المتجاوبة بدعم RTL",
    receives: "التصميم المعتمد ومخطط البنية",
    tasks: "بناء المكونات · الاستجابة · ربط الواجهة بالخدمات",
    delivers: "واجهة قابلة للتشغيل",
    tools: "React · Tailwind · TypeScript",
    handsTo: "اختبار الجودة",
  },
  qa: {
    mission: "يتحقق من مطابقة المنتج للمتطلبات",
    receives: "النسخة المبنية والمتطلبات",
    tasks: "خطط الاختبار · اختبار آلي ويدوي · تقارير العيوب",
    delivers: "تقرير اختبار",
    tools: "Playwright · Vitest",
    handsTo: "الأمن السيبراني",
  },
  sec: {
    mission: "يراجع المخاطر الأمنية ويحمي بيانات العميل",
    receives: "النسخة المختبرة",
    tasks: "فحص الثغرات · مراجعة الصلاحيات · حماية البيانات",
    delivers: "تقرير أمني وتوصيات",
    tools: "OWASP ZAP · Dependency Audit",
    handsTo: "الأداء",
  },
  perf: {
    mission: "يقيس سرعة التحميل ويحسّن الاستهلاك",
    receives: "النسخة الآمنة",
    tasks: "قياس الأداء · تحسين الأصول · التخزين المؤقت",
    delivers: "توصيات وقياسات أداء",
    tools: "Lighthouse · WebPageTest",
    handsTo: "العمليات",
  },
  ops: {
    mission: "يجهّز بيئة التشغيل والنشر والتسليم",
    receives: "النسخة المعتمدة",
    tasks: "بيئات التشغيل · خط النشر · المراقبة",
    delivers: "حزمة التسليم وخطة النشر",
    tools: "Docker · GitHub Actions",
    handsTo: "التسليم لك",
  },
};

type Features = {
  short: string;
  type: string;
  book: boolean;
  pay: boolean;
  acct: boolean;
  med: boolean;
  slow: boolean;
  files: number;
};

/** The idea's features the prototype's role lines depend on. */
export function features(idea: string, files: number): Features {
  const a = analyze(idea);
  const t = a.idea;
  return {
    short: t.length > 70 ? `${t.slice(0, 70)}…` : t,
    type: a.type,
    book: /حجز|مواعيد/.test(t),
    pay: /دفع|متجر|شراء|سلة/.test(t),
    acct: /حساب|مستخدم|عملاء|تسجيل/.test(t),
    med: /طبي|مركز|مستشف|عياد[ةت]|تشخيص|صحة/.test(t),
    slow: /بطيء|سرعة|أداء/.test(t),
    files,
  };
}

/** «دوره في مشروعك»: the prototype's lines for each agent, read against the idea. */
export function roleInProject(id: string, f: Features): string[] {
  const lines: Record<string, string[]> = {
    pm: [
      `يثبّت نطاق ${f.type} المطلوب: «${f.short}» ويقسمه إلى مراحل قابلة للتسليم`,
      f.book
        ? "يضع ميزة الحجز في أول الأولويات ويحدد شكل رحلة العميل فيها"
        : "يرتّب الميزات الأساسية قبل الميزات اللاحقة",
      "يتابع اعتمادك في كل مرحلة ويجمع ملاحظاتك",
      f.files
        ? `يراجع المواد التي أرفقتها (${f.files}) ويحوّلها إلى مرجع للنطاق`
        : "يطلب منك أمثلة ومراجع تفضّلها قبل البدء",
    ],
    research: [
      f.med
        ? "يدرس مواقع المراكز الطبية المنافسة وكيف تعرض خدماتها"
        : `يدرس أبرز منافسي ${f.type} في مجالك`,
      f.book
        ? "يقارن أنظمة حجز المواعيد المستخدمة ويلخّص ما يناسب جمهورك"
        : "يجمع مراجع تصميم وتجارب مستخدم مشابهة",
      "يسلّم ملخصًا بالاتجاهات والمراجع إلى محلل المتطلبات",
    ],
    req: [
      `يحوّل وصفك «${f.short}» إلى قائمة متطلبات وظيفية مرقّمة`,
      f.book
        ? "يصيغ قصص المستخدم لرحلة الحجز: اختيار الخدمة ← الموعد ← التأكيد"
        : "يصيغ قصص المستخدم للرحلات الأساسية في منتجك",
      f.acct
        ? "يحدد متطلبات الحسابات وأدوار المستخدمين والصلاحيات"
        : "يحدد المتطلبات غير الوظيفية: السرعة والتوافق واللغات",
      "يضع معايير قبول واضحة يعتمد عليها اختبار الجودة لاحقًا",
    ],
    ux: [
      `يصمم هيكل ${f.type} وصفحاته الرئيسية بما يناسب «${f.short}»`,
      f.med
        ? "يختار أسلوبًا بصريًا هادئًا وموثوقًا يناسب الخدمات الطبية"
        : "يختار أسلوبًا بصريًا يعبّر عن هوية مشروعك",
      "يجهّز نموذجين A/B تراجعهما وتختار منهما",
      "يدعم العربية واتجاه RTL ويضبط التجاوب مع الجوال",
    ],
    arch: [
      `يقترح مكدسًا تقنيًا مناسبًا لـ${f.type}`,
      f.book
        ? "يصمم خدمة الحجز والتنبيهات ومنع تعارض المواعيد"
        : "يقسم المنتج إلى مكوّنات قابلة للتوسع",
      f.pay
        ? "يخطط للتكامل مع بوابة الدفع"
        : "يحدد نقاط التكامل مع أي خدمات خارجية",
      "يوثّق قراراته ليتبعها المطورون",
    ],
    front: [
      `يبني واجهة ${f.type} بالمكوّنات المعتمدة من التصميم`,
      f.book
        ? "يبني نموذج الحجز وتقويم المواعيد وصفحة التأكيد"
        : "يبني الصفحات الرئيسية والنماذج",
      "يضمن عمل الصفحات على الجوال والحاسوب باتجاه RTL",
      "يربط الواجهة بخدمات المطور الخلفي",
    ],
    back: [
      f.book
        ? "يبني واجهات API للحجز: إنشاء الموعد وتعديله وإلغاؤه"
        : "يبني واجهات API لعمليات المنتج الأساسية",
      f.acct
        ? "يبني تسجيل الدخول وإدارة الحسابات"
        : "يبني منطق العمل والتحقق من المدخلات",
      f.pay
        ? "يربط بوابة الدفع ويعالج الفواتير"
        : "يجهّز إرسال الإشعارات والبريد عند الحاجة",
      "يوثّق الخدمات للمطور الأمامي",
    ],
    db: [
      f.book
        ? "يصمم جداول العملاء والخدمات والمواعيد وعلاقاتها"
        : "يصمم جداول بيانات المنتج الأساسية",
      f.med
        ? "يضع سياسة حفظ وخصوصية مناسبة لبيانات العملاء"
        : "يضع سياسة نسخ احتياطي وحفظ البيانات",
      "يضيف الفهارس لتسريع الاستعلامات الشائعة",
    ],
    qa: [
      "يحوّل معايير القبول إلى حالات اختبار",
      f.book
        ? "يختبر رحلة الحجز كاملة وحالات الأخطاء: موعد محجوز، بيانات ناقصة"
        : "يختبر الرحلات الأساسية وحالات الأخطاء",
      "يختبر الصفحات على عدة أحجام شاشات ومتصفحات",
      "يرفع تقريرًا بالعيوب ويعيد الاختبار بعد الإصلاح",
    ],
    sec: [
      f.acct || f.book
        ? "يراجع حماية بيانات العملاء والحجوزات وصلاحيات الوصول"
        : "يراجع صلاحيات الوصول وحماية البيانات",
      "يفحص الثغرات الشائعة (OWASP) في الواجهة والخدمات",
      f.pay
        ? "يتحقق من أمان مسار الدفع"
        : "يراجع المكتبات الخارجية والاعتماديات",
      "يسلّم توصيات بإصلاح أي ثغرة",
    ],
    perf: [
      f.slow
        ? "يعالج البطء المذكور في وصفك بقياسات قبل/بعد"
        : "يقيس سرعة تحميل الصفحات الرئيسية",
      "يحسّن الصور والأصول والتخزين المؤقت",
      "يضع حدودًا مقبولة للأداء على الجوال",
    ],
    ops: [
      "يجهّز بيئة التشغيل والنشر للمنتج",
      "يبني خط نشر آلي ويراقب التشغيل",
      `يسلّم حزمة ${f.type} النهائية: الرابط والكود والوثائق`,
      "يجهّز خطة رجوع عن النشر عند أي مشكلة",
    ],
  };
  return lines[id] ?? [];
}

/** The proposed production journey: each stage and the agents who work in it (prototype's STG, grouped). */
export const STAGES: readonly {
  id: string;
  label: string;
  icon: "doc" | "search" | "pen" | "code" | "check" | "rocket";
  agents: readonly string[];
}[] = [
  { id: "analysis", label: "التحليل", icon: "doc", agents: ["pm", "req"] },
  { id: "research", label: "البحث", icon: "search", agents: ["research"] },
  { id: "design", label: "التصميم", icon: "pen", agents: ["ux"] },
  {
    id: "build",
    label: "التطوير",
    icon: "code",
    agents: ["arch", "db", "back", "front"],
  },
  {
    id: "test",
    label: "الاختبار",
    icon: "check",
    agents: ["qa", "sec", "perf"],
  },
  { id: "deliver", label: "التشغيل والتسليم", icon: "rocket", agents: ["ops"] },
];

/** The stages the chosen team covers, in order. */
export function journey(team: readonly string[]) {
  return STAGES.filter((s) => s.agents.some((a) => team.includes(a)));
}

export function stageOf(agent: string) {
  return STAGES.find((s) => s.agents.includes(agent))?.id ?? null;
}
