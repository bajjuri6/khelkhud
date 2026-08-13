import type { FaqEntry } from "@/components/seo/faq-jsonld";

/**
 * The landing page FAQ. ONE array, rendered visibly by <FaqSection> and marked up by
 * <FaqJsonLd> — see the note in faq-jsonld.tsx about why they must not diverge.
 *
 * These answers are written to be quoted. An answer engine will lift a sentence out of
 * here and present it as what khelkhud is, with no surrounding context and no link
 * guaranteed, so each answer stands alone, leads with the actual answer, and contains the
 * concrete number or noun rather than a promise to explain later.
 *
 * Nothing here may claim a legal or tax status the project does not have.
 */
export const FAQS: readonly FaqEntry[] = [
  {
    question: "What is khelkhud?",
    answer:
      "khelkhud is a sponsorship platform for athletes in Telangana, India. Athletes list one specific thing that is holding them back — competition kit, coaching fees, an entry fee, travel to a meet — with a real price attached. Sponsors fund a single item rather than a general cause, and then follow that money through to an uploaded receipt and the athlete's own update about the result.",
  },
  {
    question: "How much does it cost to sponsor an athlete?",
    answer:
      "There is no minimum campaign size, because sponsorships are per item rather than per athlete. A month of coaching is around ₹2,000, a pair of competition running shoes around ₹3,200, and a full season's replacement kit for one athlete — bat, stumps, ball, shoes, racquet — is about ₹8,750. Most individual requests on the platform fall between ₹5,000 and ₹30,000.",
  },
  {
    question: "How do I know the money actually reaches the athlete?",
    answer:
      "Every sponsorship is split into the specific items it was meant to buy, and each item moves through three states: planned, purchased, then completed with a receipt uploaded against it. If an item stalls, the sponsor sees that too. Payments are handled by Razorpay and each sponsorship carries a reference code, so the trail runs from the payment to the receipt to the athlete's update after the event.",
  },
  {
    question: "Who verifies the athletes?",
    answer:
      "A person does, before a profile becomes visible to sponsors. Verification checks an identity document, the achievements the athlete has claimed, and their coach or academy details. If something is missing, khelkhud asks for it rather than rejecting the athlete. Only verified profiles appear in sponsor search results.",
  },
  {
    question: "Which sports and places does khelkhud cover?",
    answer:
      "khelkhud starts in Telangana and covers all 33 districts, deliberately including village and mandal-level athletes rather than only Hyderabad. Twelve sports are supported at launch: athletics, cricket, football, hockey, badminton, kabaddi, wrestling, boxing, table tennis, swimming, archery and weightlifting.",
  },
  {
    question: "Can I sponsor anonymously?",
    answer:
      "Yes. Sponsors can hide their name on any individual sponsorship or set anonymity as the default on their profile. The athlete still receives the funds and still posts updates; only the public attribution changes.",
  },
  {
    question: "How does an athlete join khelkhud?",
    answer:
      "An athlete creates a profile with their sport, age group, district, coach and achievements, and uploads one identity document. After a human review, they post what they need as itemised entries with real prices. Vague requests are not funded; itemised ones are. There is no fee to join and no manager, federation contact or existing following is required.",
  },
] as const;
