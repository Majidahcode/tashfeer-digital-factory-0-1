/**
 * Approved homepage copy (from the owner's prototype and the master prompt). Arabic is the default locale.
 */

export const HERO = {
  badge: "مصنع حي يعيشك تجربة رؤية منتجك وهو ينبني أمامك، قبل أن تستلم منتجك الرقمي.",
  lines: ["أنا", "مو بس أسوي لك منتجك الرقمي اللي بخيالك", "لا", "أبني منتجك قدام عينك"] as const,
  lede: [
    "دامك وصلت عند تشفير فأكيد فكرتك تستاهل تطلع من مجرد هواجيس في خيالك لواقع تشوفه بعينك. خذ راحتك بشرح فكرتك لي عشان أعطيك نتيجة عليها الكلام.",
    "عطني أفكار تشبه فكرتك.. صور، فيديو، روابط.. عشان أوصل لأقرب تصور لفكرتك.",
    "بس تضغط «ادخل»، بتدخل معي في هالنافذة وتشوفني أنا كيف رح أبني منتجك قدام عينك.",
  ] as const,
  /** The owner's label for the disclosure that holds the lede (2026-10-22): the paragraphs are hidden by default. */
  more: "كيف نبدأ؟",
};

/** Master prompt D/R4 — exact labels and order. */
export const FEATURES = [
  "فهم احتياجاتك",
  "تحليل المشروع",
  "بحث وتدقيق",
  "بناء النماذج الأولية",
  "الإنتاج الفعلي",
] as const;

/**
 * Master prompt R5 — the ambient phrases. The owner removed «منتجك ينبني قدامك في مصنع تشفير» on 2026-10-22 (it
 * repeated the headline), and on 2026-10-23 named these three as the set («خذ راحتك واشرح فكرتك بصوتك» left it).
 * «بطيء» keeps the spelling of the owner's approved prototype (01-reference/current-tashfeer-prototype.html).
 */
export const AMBIENT_PHRASES = [
  "موقعك قديم ودك تجدده؟",
  "تطبيقك صاير بطيء وما يواكب الدنيا؟",
  "من الفكرة إلى منتج رقمي حقيقي",
] as const;

export const CHAT = {
  name: "تشفير",
  /** read out with the avatar (its tooltip, and for assistive technology): what this version does and does not do */
  status: "نسخة تجريبية — لا يوجد ذكاء اصطناعي متصل بعد",
  welcome: "أهلًا! أنا تشفير، مساعدك في مصنع التحول الرقمي. أخبرني عن فكرتك أو مشروعك.",
  tools: ["الوصف", "روابط", "ملفات", "فيديو", "صور"] as const,
  placeholder: "اشرح فكرتك هنا…",
  enter: "ادخل",
  /** the honest lines the conversation shows when they apply */
  notes: {
    attachments: "تبقى المرفقات في متصفحك ولا تُرفع في هذه النسخة.",
    links: "الصق الروابط في وصف فكرتك؛ يحفظها تشفير معها.",
    mic: "التسجيل الصوتي غير مفعّل بعد؛ اكتب فكرتك.",
    empty: "اكتب فكرتك أولًا، أو أرفق ما يوضحها.",
  },
};
