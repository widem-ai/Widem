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
    // The navigation (prototype header, word for word). Keys are the section ids the links point to.
    navLabel: "Main",
    nav: { problem: "Why", services: "Services", compare: "Compare", work: "Work", how: "How we work", about: "About", faq: "FAQ" },
    book: "Book a call",
    menu: "Menu",
  },
  hero: {
    // The headline reads before + word + after (kept as three keys for parity with the prototype, A14).
    // Hero v3 (2026-10-01): no rotating word; every word powers on as a trace while the visitor scrolls.
    headlineBefore: "Get the",
    headlineWord: "admin",
    headlineAfter: "off your plate in 2 weeks, without hiring anyone.",
    subhead: "You run the business. We run the admin.",
    cta: "Get my business running itself",
    cue: "Follow the signal",
    // NEW (v3, 2026-10-01): the scroll guide shown at the top of the pinned hero story (motion on only).
    guide: "Scroll to switch it on",
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
