import { FAQS } from "@/lib/faq";
import { Reveal } from "@/components/reveal";

/**
 * The visible half of the FAQ. Rendered EXPANDED, not as an accordion.
 *
 * Collapsed <details> content is in the DOM and Google does accept it, but an answer
 * engine summarising the page weighs visible text differently, and a sponsor deciding
 * whether to trust this with money should not have to click seven times to read how the
 * receipts work. The content is the argument; hiding it to save vertical space is a bad
 * trade on the one page where trust is the conversion barrier.
 *
 * <dl> rather than headings: this is genuinely a term/definition list, and it gives
 * screen-reader users the question/answer pairing for free.
 */
export function FaqSection() {
  return (
    <section id="faq" className="border-t border-border bg-cream-2">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <Reveal>
          <p className="eyebrow text-slate">Questions</p>
          <h2 className="mt-4 max-w-[20ch] text-h1 font-semibold">
            The things people ask before they back someone.
          </h2>
        </Reveal>

        <dl className="mt-14 grid gap-x-14 gap-y-10 lg:grid-cols-2">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.question} delay={Math.min(i, 3) * 60}>
              <div className="border-t-2 border-ink/12 pt-5">
                <dt className="font-display text-h3 font-semibold">{faq.question}</dt>
                <dd className="mt-3 text-sm leading-relaxed text-slate">{faq.answer}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
