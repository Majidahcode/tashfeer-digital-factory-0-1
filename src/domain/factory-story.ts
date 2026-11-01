/**
 * What the visitor sees happen to *their* product at each station, in plain Arabic and pictures: the steps of the work,
 * what each step adds to the product, what is still waiting. It is read from the visitor's own idea and approved model
 * (src/domain/team-plan.ts `features`): a booking site shows its booking page forming and its bookings reaching the
 * clinic's board; a store, its product pages and orders; anything else, its pages and its contact messages. The
 * factory is one; the story is the project's.
 *
 * These are the *explanations* of the work, shown when the work's events arrive (src/domain/factory.ts) — never a
 * claim that something was done before its event, and never more than the simulation does (it is labelled so).
 */
import type { ModelId } from "@/lib/project-store";
import type { StationId } from "./factory";
import { features } from "./team-plan";

/** A picture of a step's result, drawn by the factory screen (thumbnails, a form, a flow, a check…). */
export type Visual =
  | { kind: "structure"; parts: string[] }
  | { kind: "identity"; model: ModelId }
  | { kind: "pages"; pages: string[]; active: number }
  | { kind: "form"; title: string; fields: string[]; cta: string }
  | { kind: "picker"; title: string }
  | { kind: "flow"; from: string; to: string; note: string }
  | { kind: "list"; title: string; rows: string[] }
  | { kind: "confirm"; title: string; lines: string[] }
  | { kind: "check"; label: string; device: "phone" | "desktop" }
  | { kind: "ready"; ready: string[]; pending: string[] };

export type StepIcon =
  | "layers"
  | "palette"
  | "database"
  | "home"
  | "list"
  | "calendar"
  | "check"
  | "flow"
  | "bell"
  | "phone"
  | "click"
  | "box"
  | "cart"
  | "mail"
  | "monitor"
  | "shield"
  | "clock";

export type Step = {
  /** a few words, under its icon in the station's three steps */
  label: string;
  icon: StepIcon;
  /** what we are doing now, as a headline («نبني صفحة الحجز») */
  headline: string;
  /** why it matters to the visitor's customers, in one line */
  why: string;
  /** what this step adds to the product once it is done */
  result: string;
  visual: Visual;
};

export type StationStory = {
  steps: Step[];
  /** waiting on something outside this simulation (named honestly), shown at the end of the line */
  pending: string[];
};

export type Profile = {
  kind: "booking" | "store" | "generic";
  /** the business in the visitor's words: «العيادة», «المتجر», «المشروع» */
  place: string;
  /** who uses it: «عميلك» / «مريضك» */
  customer: string;
  /** the main pages of the product */
  pages: string[];
  /** a short title for the project («موقع عيادة الأسنان…») */
  title: string;
};

export function profileOf(idea: string): Profile {
  const f = features(idea, 0);
  const med = f.med;
  const title = shortTitle(f.short);
  if (f.book)
    return {
      kind: "booking",
      place: med ? "العيادة" : "مكانك",
      customer: med ? "مريضك" : "عميلك",
      pages: ["الرئيسية", "الخدمات", "الحجز"],
      title,
    };
  if (f.pay)
    return { kind: "store", place: "المتجر", customer: "عميلك", pages: ["الرئيسية", "المنتجات", "السلة"], title };
  return { kind: "generic", place: "مشروعك", customer: "زائرك", pages: ["الرئيسية", "التفاصيل", "التواصل"], title };
}

function shortTitle(idea: string): string {
  const words = idea.replace(/[«»"]/g, "").split(/\s+/).filter(Boolean);
  const t = words.slice(0, 6).join(" ");
  return words.length > 6 ? `${t}…` : t;
}

export function storyFor(idea: string, model: ModelId, station: StationId): StationStory {
  const p = profileOf(idea);
  const [home, second] = p.pages as [string, string, string];
  switch (station) {
    case "setup":
      return {
        steps: [
          {
            label: "ترتيب الصفحات",
            icon: "layers",
            headline: "نرتّب صفحات مشروعك",
            why: `نحدد مكان كل صفحة: ${p.pages.join("، ")}.`,
            result: `صار لمنتجك هيكل بصفحاته: ${p.pages.join("، ")}.`,
            visual: { kind: "structure", parts: p.pages },
          },
          {
            label: "هوية النموذج",
            icon: "palette",
            headline: `نطبّق هوية النموذج ${model}`,
            why: "الألوان والخطوط والمسافات من التصميم الذي اعتمدته.",
            result: `هوية النموذج ${model} مطبّقة على كل الصفحات.`,
            visual: { kind: "identity", model },
          },
          {
            label: "مكان البيانات",
            icon: "database",
            headline: "نجهّز مكان حفظ البيانات",
            why:
              p.kind === "booking"
                ? "هنا تُحفظ المواعيد لاحقًا."
                : p.kind === "store"
                  ? "هنا تُحفظ الطلبات لاحقًا."
                  : "هنا تُحفظ الرسائل لاحقًا.",
            result: "مكان البيانات جاهز ليستقبل ما يصله.",
            visual: {
              kind: "structure",
              parts: p.kind === "booking" ? ["المواعيد", "الخدمات", "المختصون"] : p.kind === "store" ? ["المنتجات", "الطلبات", "العملاء"] : ["الصفحات", "الرسائل"],
            },
          },
        ],
        pending: [],
      };
    case "interfaces":
      return {
        steps: [
          {
            label: `صفحة ${home}`,
            icon: "home",
            headline: `نبني الصفحة ${home}`,
            why: `أول ما يراه ${p.customer}: من أنتم وماذا تقدمون.`,
            result: `ظهرت الصفحة ${home} في منتجك.`,
            visual: { kind: "pages", pages: p.pages, active: 0 },
          },
          {
            label: `صفحة ${second}`,
            icon: p.kind === "store" ? "box" : "list",
            headline: `نبني صفحة ${second}`,
            why: p.kind === "booking" ? `يختار منها ${p.customer} ما يناسبه قبل الحجز.` : p.kind === "store" ? "يتصفح منها عميلك ما تبيعه." : "تعرض تفاصيل ما تقدمه.",
            result: `ظهرت صفحة ${second} في منتجك.`,
            visual: { kind: "pages", pages: p.pages, active: 1 },
          },
          p.kind === "booking"
            ? {
                label: "صفحة الحجز",
                icon: "calendar",
                headline: "نبني صفحة الحجز",
                why: `نرتّب المواعيد عشان ${p.customer} يحجز بسهولة.`,
                result: "ظهر نموذج الحجز: الخدمة، المختص، اليوم، الوقت.",
                visual: { kind: "form", title: "احجز موعدك", fields: ["اختر الخدمة", "اختر المختص", "اختر التاريخ", "اختر الوقت"], cta: "احجز" },
              }
            : p.kind === "store"
              ? {
                  label: "صفحة السلة",
                  icon: "cart",
                  headline: "نبني صفحة السلة",
                  why: "يراجع منها عميلك ما اختاره قبل الطلب.",
                  result: "ظهرت السلة بزر إتمام الطلب.",
                  visual: { kind: "form", title: "سلتك", fields: ["المنتجات المختارة", "الكمية", "العنوان"], cta: "أكمل الطلب" },
                }
              : {
                  label: "صفحة التواصل",
                  icon: "mail",
                  headline: "نبني صفحة التواصل",
                  why: "يرسل منها زائرك سؤاله أو طلبه.",
                  result: "ظهر نموذج التواصل.",
                  visual: { kind: "form", title: "تواصل معنا", fields: ["الاسم", "الجوال", "رسالتك"], cta: "أرسل" },
                },
        ],
        pending: [],
      };
    case "services":
      if (p.kind === "booking")
        return {
          steps: [
            {
              label: "حفظ الموعد",
              icon: "calendar",
              headline: "نحفظ الموعد المختار",
              why: `الموعد الذي يختاره ${p.customer} يُحفظ ولا يضيع.`,
              result: "الموعد المختار يُحفظ في قائمة الحجوزات.",
              visual: { kind: "flow", from: "نموذج الحجز", to: "قائمة الحجوزات", note: "الموعد ينتقل ويُحفظ" },
            },
            {
              label: `لوحة ${p.place}`,
              icon: "list",
              headline: `نربط الحجز بلوحة إدارة ${p.place}`,
              why: `فريق ${p.place} يرى الحجوزات الجديدة مرتّبة بالوقت.`,
              result: `الحجوزات تظهر في لوحة ${p.place}.`,
              visual: { kind: "list", title: `حجوزات ${p.place}`, rows: ["10:00 · كشف عام", "11:30 · تنظيف أسنان", "02:00 · استشارة"] },
            },
            {
              label: "تأكيد الحجز",
              icon: "bell",
              headline: "نجهّز رسالة تأكيد الحجز",
              why: `يعرف ${p.customer} أن موعده ثبت.`,
              result: "تظهر رسالة تأكيد بعد الحجز.",
              visual: { kind: "confirm", title: "تم حجز الموعد", lines: ["الاثنين 28 أبريل", "الساعة 11:30 ص"] },
            },
          ],
          pending: [],
        };
      if (p.kind === "store")
        return {
          steps: [
            {
              label: "حفظ الطلب",
              icon: "cart",
              headline: "نحفظ طلب العميل",
              why: "الطلب الذي يرسله عميلك يُحفظ ولا يضيع.",
              result: "الطلب يُحفظ في قائمة الطلبات.",
              visual: { kind: "flow", from: "السلة", to: "قائمة الطلبات", note: "الطلب ينتقل ويُحفظ" },
            },
            {
              label: "لوحة المتجر",
              icon: "list",
              headline: "نربط الطلبات بلوحة إدارة المتجر",
              why: "ترى الطلبات الجديدة وحالة كل طلب.",
              result: "الطلبات تظهر في لوحة المتجر.",
              visual: { kind: "list", title: "طلبات المتجر", rows: ["طلب 1024 · قيد التجهيز", "طلب 1025 · جديد", "طلب 1026 · جديد"] },
            },
            {
              label: "تأكيد الطلب",
              icon: "bell",
              headline: "نجهّز رسالة تأكيد الطلب",
              why: "يعرف عميلك أن طلبه وصل.",
              result: "تظهر رسالة تأكيد بعد الطلب.",
              visual: { kind: "confirm", title: "تم استلام طلبك", lines: ["رقم الطلب 1026"] },
            },
          ],
          pending: [],
        };
      return {
        steps: [
          {
            label: "حفظ الرسالة",
            icon: "mail",
            headline: "نحفظ رسائل الزوار",
            why: "كل رسالة تصل تُحفظ ولا تضيع.",
            result: "الرسائل تُحفظ في صندوق الوارد.",
            visual: { kind: "flow", from: "نموذج التواصل", to: "صندوق الرسائل", note: "الرسالة تنتقل وتُحفظ" },
          },
          {
            label: "لوحة الرسائل",
            icon: "list",
            headline: "نعرض الرسائل في لوحتك",
            why: "ترى الرسائل الجديدة مرتّبة بالوقت.",
            result: "الرسائل تظهر في لوحتك.",
            visual: { kind: "list", title: "الرسائل", rows: ["سؤال عن الخدمة", "طلب تواصل", "استفسار"] },
          },
          {
            label: "إشعار الاستلام",
            icon: "bell",
            headline: "نجهّز رسالة الاستلام",
            why: "يعرف زائرك أن رسالته وصلت.",
            result: "تظهر رسالة استلام بعد الإرسال.",
            visual: { kind: "confirm", title: "وصلت رسالتك", lines: ["سنرد عليك قريبًا"] },
          },
        ],
        pending: [],
      };
    case "quality": {
      const journey = p.kind === "booking" ? "تجربة الحجز" : p.kind === "store" ? "تجربة الطلب" : "تجربة التواصل";
      return {
        steps: [
          {
            label: journey,
            icon: "click",
            headline: `نجرّب ${journey} من أولها لآخرها`,
            why: `نمشي الخطوات كما سيمشيها ${p.customer}.`,
            result: `${journey} تكتمل دون أخطاء.`,
            visual: { kind: "check", label: journey, device: "desktop" },
          },
          {
            label: "الجوال",
            icon: "phone",
            headline: "نفحص شكل الموقع على الجوال",
            why: `أغلب ${p.customer === "مريضك" ? "المرضى" : "العملاء"} يفتحونه من الجوال.`,
            result: "الصفحات مرتّبة على شاشة الجوال.",
            visual: { kind: "check", label: "العرض على الجوال", device: "phone" },
          },
          {
            label: "الأزرار والربط",
            icon: "check",
            headline: "نتحقق من الأزرار والربط",
            why: "كل زر يوصل لمكانه، وكل ما يُرسل يُحفظ.",
            result: "الأزرار والربط تعمل.",
            visual: { kind: "check", label: "الأزرار والربط", device: "desktop" },
          },
        ],
        pending: [],
      };
    }
    case "delivery":
      return {
        steps: [
          {
            label: "معاينة المنتج",
            icon: "box",
            headline: "نجهّز معاينة منتجك",
            why: "تراه كاملًا كما سيراه عملاؤك.",
            result: "معاينة المنتج جاهزة للمشاهدة هنا.",
            visual: {
              kind: "ready",
              ready: [...p.pages.map((x) => `صفحة ${x}`), p.kind === "booking" ? "حفظ الحجوزات" : p.kind === "store" ? "حفظ الطلبات" : "حفظ الرسائل"],
              pending: deliveryPending(p),
            },
          },
        ],
        pending: deliveryPending(p),
      };
  }
}

/** What a real delivery still needs, named honestly: nothing here is published or connected for real. */
function deliveryPending(p: Profile): string[] {
  return [
    "النشر على رابط حقيقي — بانتظار ربط خدمة النشر",
    p.kind === "booking" ? "إرسال التأكيد برسالة جوال — بانتظار ربط خدمة الرسائل" : p.kind === "store" ? "الدفع الإلكتروني — بانتظار ربط بوابة الدفع" : "إشعار البريد — بانتظار ربط خدمة البريد",
  ];
}

/** what the product's screen in the factory shows of this project (its own name, pages, headline, services) */
export function screenCopy(idea: string): {
  name: string;
  nav: string[];
  heroTitle: [string, string];
  heroLine: string;
  cta: string;
  features: string[];
  servicesTitle: string;
  services: string[];
} {
  const p = profileOf(idea);
  const name = businessName(idea, p);
  if (p.kind === "booking") {
    const dental = /أسنان|اسنان/.test(idea);
    return {
      name,
      nav: ["الرئيسية", "خدماتنا", "المختصون", "تواصل معنا"],
      heroTitle: dental ? ["ابتسامتك أقرب", "بموعد واحد"] : ["موعدك أقرب", "بضغطة واحدة"],
      heroLine: `احجز موعدك في ${name} واختر الخدمة والوقت المناسب.`,
      cta: "احجز موعدك",
      features: ["حجز سريع", "مواعيد مرنة", "مختصون", "تذكير بالموعد"],
      servicesTitle: "خدماتنا",
      services: dental ? ["كشف عام", "تنظيف", "تقويم", "تبييض", "حشوات", "أطفال"] : ["استشارة", "متابعة", "كشف", "جلسة", "فحص", "خدمة منزلية"],
    };
  }
  if (p.kind === "store")
    return {
      name,
      nav: ["الرئيسية", "المنتجات", "العروض", "تواصل معنا"],
      heroTitle: ["كل ما تحتاجه", "في متجر واحد"],
      heroLine: `تسوّق من ${name} واستلم طلبك بسهولة.`,
      cta: "تسوّق الآن",
      features: ["شحن سريع", "دفع آمن", "إرجاع سهل", "دعم مستمر"],
      servicesTitle: "الأقسام",
      services: ["الجديد", "الأكثر طلبًا", "العروض", "هدايا", "أساسيات", "مختارات"],
    };
  return {
    name,
    nav: ["الرئيسية", "خدماتنا", "من نحن", "تواصل معنا"],
    heroTitle: ["نقدّم لك", "ما تحتاجه"],
    heroLine: `تعرّف على ${name} وتواصل معنا بسهولة.`,
    cta: "تواصل معنا",
    features: ["خبرة", "سرعة", "جودة", "دعم"],
    servicesTitle: "خدماتنا",
    services: ["خدمة أولى", "خدمة ثانية", "خدمة ثالثة", "خدمة رابعة", "خدمة خامسة", "خدمة سادسة"],
  };
}

/** the business's name as the visitor wrote it («عيادة النور»…), else a plain one for its kind */
function businessName(idea: string, p: Profile): string {
  const m = idea.match(/(عيادة|مركز|متجر|مطعم|صالون|مكتب|شركة|أكاديمية)\s+([^\s،,.]+)/);
  if (m && !/لطب|ل[اأ]|أسنان|اسنان|طبي|إلكتروني|الكتروني/.test(m[2]!)) return `${m[1]} ${m[2]}`;
  return p.kind === "booking" ? (/عياد|أسنان|طبي/.test(idea) ? "العيادة" : "مكانك") : p.kind === "store" ? "المتجر" : "مشروعك";
}

/** «مشروعك: …» */
export function projectTitle(idea: string): string {
  return profileOf(idea).title;
}

// keep the type for callers
export type { StationId };
