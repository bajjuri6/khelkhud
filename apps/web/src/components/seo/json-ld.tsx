/**
 * Server-rendered JSON-LD.
 *
 * Every schema block on the site goes through here so serialisation is done one way. The
 * script ships in the initial HTML: crawlers and answer engines read structured data
 * without executing JavaScript, and anything injected client-side is invisible to a good
 * share of them.
 *
 * The `<` escape prevents a string in the data (an athlete's bio, a request title)
 * from closing the script tag early — the standard JSON-LD XSS vector, and the reason this
 * is one helper rather than a dozen inline dangerouslySetInnerHTML calls.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
