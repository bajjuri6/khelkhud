import { JsonLd } from "./json-ld";

export type FaqEntry = { question: string; answer: string };

/**
 * FAQPage JSON-LD — the core of the answer-engine work.
 *
 * Two rules that are easy to get wrong:
 *
 *  1. Only ONE FAQPage per page. A second block makes Google drop both.
 *  2. The questions and answers MUST also be visible in the rendered page. Marking up
 *     content the visitor cannot see is a structured-data violation, and it is also the
 *     wrong instinct — an answer engine quoting an answer no human ever reads is how you
 *     end up misrepresented. `<FaqSection>` renders the same array it passes here.
 */
export function FaqJsonLd({ faqs }: { faqs: readonly FaqEntry[] }) {
  return (
    <JsonLd
      schema={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }}
    />
  );
}
