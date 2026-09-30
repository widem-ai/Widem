// Every visible Arabic string. Same keys as content/en.ts (checked by tsc and scripts/check.mjs).
// Source: the approved v5 prototype's AR table, word for word unless marked NEW.
import type { Content } from "./en.ts";

export const ar: Content = {
  meta: {
    // NEW: the prototype has no Arabic title or description (A9 needs both). Draft built from the
    // prototype's own Arabic strings; needs Mohannad's / widem-writer's sign-off.
    title: "Widem: برمجيات مخصصة وأتمتة وذكاء اصطناعي للأعمال",
    description:
      "تبني Widem برمجيات مخصصة وأتمتة ووكلاء أذكياء تخلّصك من الأعمال الإدارية خلال أسبوعين، دون توظيف أحد. بالعربية والإنجليزية.",
  },
  header: {
    brand: "Widem",
    homeLabel: "Widem، الصفحة الرئيسية", // NEW: the prototype left this label in English
    langLabel: "اللغة",
    langShort: { en: "EN", ar: "AR" },
    themeToLight: "التبديل إلى الوضع الفاتح",
    themeToDark: "التبديل إلى الوضع الداكن",
  },
  hero: {
    headlineBefore: "تخلّص من",
    headlineWord: "الأعمال الإدارية",
    headlineAfter: "خلال أسبوعين، دون توظيف أحد.",
    subhead: "أنت تدير عملك. ونحن ندير الإدارة.",
    cta: "اجعل عملك يدير نفسه",
    cue: "اتبع الإشارة",
    // NEW (v3, 2026-10-01): the scroll guide shown at the top of the pinned hero story (motion on only).
    // DRAFT: awaiting Mohannad's sign-off on the wording.
    guide: "مرّر لتشغيلها",
  },
  footer: {
    slogan: "أنت تدير عملك. ونحن ندير الإدارة.",
    company: "الشركة",
    about: "من نحن",
    work: "أعمالنا",
    how: "كيف نعمل",
    faq: "الأسئلة",
    services: "الخدمات",
    s1: "برمجيات مخصصة",
    s2: "الأتمتة",
    s3: "الوكلاء الأذكياء",
    s4: "المواقع",
    s5: "الخادم والأمان",
    contact: "تواصل",
    book: "احجز مكالمة",
    linkedin: "لينكدإن",
    copyright: "© 2026 Widem. المملكة العربية السعودية.",
    noTracking: "لا ملفات تعريف ارتباط. لا تتبّع.",
  },
};
