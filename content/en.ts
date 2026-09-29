// Every visible English string. Same keys as content/ar.ts (checked by tsc and scripts/check.mjs).
// Source: the approved v5 prototype (prototype/index.html), word for word unless marked NEW.
export const en = {
  meta: {
    title: "Widem: custom software, automation and AI for businesses",
    description:
      "Widem builds custom software, automations and AI agents that take admin off your plate in 2 weeks, without hiring anyone. Arabic and English.",
  },
  header: {
    brand: "Widem",
    homeLabel: "Widem, home",
    langLabel: "Language",
    langShort: { en: "EN", ar: "AR" },
    themeToLight: "Switch to light mode",
    themeToDark: "Switch to dark mode",
  },
  hero: {
    // The headline reads before + word + after. headlineWord is the static word (JS off, reduced motion,
    // screen readers); with motion on it rotates through moreWords and back.
    headlineBefore: "Get the",
    headlineWord: "admin",
    headlineAfter: "off your plate in 2 weeks, without hiring anyone.",
    subhead: "You run the business. We run the admin.",
    cta: "Get my business running itself",
    moreWords: ["follow-ups", "paperwork", "scheduling", "reporting", "data entry"],
    cue: "Follow the signal",
  },
  footer: {
    slogan: "You run the business. We run the admin.",
    company: "Company",
    about: "About",
    work: "Work",
    how: "How we work",
    faq: "FAQ",
    services: "Services",
    s1: "Custom software",
    s2: "Automations",
    s3: "AI agents",
    s4: "Websites",
    s5: "Backend and security",
    contact: "Contact",
    book: "Book a call",
    linkedin: "LinkedIn",
    copyright: "© 2026 Widem. Saudi Arabia.",
    noTracking: "No cookies. No tracking.",
  },
};

export type Content = typeof en;
