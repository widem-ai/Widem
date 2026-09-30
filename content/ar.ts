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
    navLabel: "القائمة الرئيسية", // NEW: the prototype left this label in English ("Main")
    nav: { problem: "لماذا", services: "خدماتنا", compare: "المقارنة", work: "أعمالنا", how: "كيف نعمل", about: "من نحن", faq: "الأسئلة" },
    book: "احجز مكالمة",
    menu: "القائمة", // NEW: the prototype left this label in English ("Menu")
  },
  hero: {
    headlineBefore: "تخلّص من",
    headlineWord: "الأعمال الإدارية",
    headlineAfter: "خلال أسبوعين، دون توظيف أحد.",
    subhead: "أنت تدير عملك. ونحن ندير الإدارة.",
    cta: "اجعل عملك يدير نفسه",
    moreWords: ["المتابعات", "الأوراق", "المواعيد", "التقارير", "إدخال البيانات"],
    cue: "اتبع الإشارة",
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
