import Image from "next/image";
import { formatPaise } from "@khelkhud/shared";

// The improvised-kit still life, annotated in place with what it costs to replace each
// item properly.
//
// The picture and the prices used to be two separate blocks — an image, then a table — and
// the reader had to do the join themselves. Putting the number on the object is the whole
// point: "a taped plank → ₹2,400 for a real bat" is an argument, while a price list next
// to a photograph is just a price list.
//
// Coordinates are percentages of the image box, measured against the generated artwork. If
// you regenerate `improvised-kit` (devops/generate-brand-images.ts), the objects WILL move
// and every dot here needs re-measuring. That coupling is the cost of this treatment; it is
// worth it, but it is real, so the spec is marked accordingly.

type Item = {
  name: string;
  /** What they're using now. Kept short — it sits under the name in the chip. */
  current: string;
  /** Cost to replace it with the proper thing, in paise. */
  paise: number;
  /** Dot position on the object, as % of the image box. */
  x: number;
  y: number;
  /** Which edge the label sits against. */
  place: "top" | "bottom";
};

const ITEMS: Item[] = [
  { name: "Bat", current: "a taped plank", paise: 240000, x: 16, y: 64, place: "top" },
  { name: "Stumps", current: "three sticks", paise: 80000, x: 35, y: 62, place: "top" },
  { name: "Ball", current: "tennis ball + tape", paise: 45000, x: 55, y: 47, place: "top" },
  { name: "Racquet", current: "two strings gone", paise: 190000, x: 75, y: 47, place: "top" },
  { name: "Shoes", current: "split, tied with twine", paise: 320000, x: 57, y: 60, place: "bottom" },
];

const TOTAL = ITEMS.reduce((sum, i) => sum + i.paise, 0);

export function KitCosts() {
  return (
    <figure className="mx-auto max-w-3xl">
      <div className="relative overflow-hidden rounded-xl">
        <Image
          src="/brand/improvised-kit.png"
          alt="A taped wooden plank used as a cricket bat, three uneven sticks for stumps, a taped tennis ball, a split running shoe tied with twine, a badminton racquet missing strings, and a water bottle, laid out on red earth"
          width={1024}
          height={1024}
          sizes="(max-width: 640px) 92vw, 48rem"
          className="w-full"
        />

        {/* Annotations are sm-and-up only. At 390px the chips overlap each other and the
            objects they point at; the list below carries the same information instead. */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden>
          {ITEMS.map((item) => {
            const top = item.place === "top";
            return (
              <div key={item.name}>
                {/* Connector: from the label edge to the object. */}
                <span
                  className="absolute w-px bg-nightfall/45"
                  style={{
                    left: `${item.x}%`,
                    top: top ? "10%" : `${item.y}%`,
                    height: top ? `${item.y - 10}%` : `${90 - item.y}%`,
                  }}
                />
                {/* Dot on the object itself. */}
                <span
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-marigold ring-2 ring-nightfall/70"
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                />
                {/* The chip. -translate-x-1/2 centres it on the connector; the clamp keeps
                    the outermost chips from bleeding past the image edge. */}
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-nightfall/92 px-2.5 py-1.5 text-cream shadow-lift backdrop-blur-sm"
                  style={{
                    left: `clamp(0%, ${item.x}%, 100%)`,
                    top: top ? "10%" : "90%",
                    transform: top
                      ? "translate(-50%, -100%)"
                      : "translate(-50%, 0)",
                  }}
                >
                  <span className="block text-[0.6875rem] font-semibold leading-none">
                    {item.name}
                  </span>
                  <span className="mt-1 block text-[0.625rem] leading-none text-cream/55">
                    {item.current}
                  </span>
                  <span
                    className="mt-1.5 block text-[0.8125rem] font-semibold leading-none text-marigold-light"
                    data-numeric
                  >
                    {formatPaise(item.paise)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* The same data as text: the sm-and-below fallback, and the accessible version of
          the annotation layer above (which is aria-hidden). */}
      <ul className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:hidden">
        {ITEMS.map((item) => (
          <li
            key={item.name}
            className="flex items-baseline justify-between gap-3 border-b border-cream/12 pb-2"
          >
            <span className="text-cream/75">
              {item.name} <span className="text-cream/40">— {item.current}</span>
            </span>
            <span className="shrink-0 font-medium text-cream" data-numeric>
              {formatPaise(item.paise)}
            </span>
          </li>
        ))}
      </ul>

      <figcaption className="mt-5 text-center text-sm leading-relaxed text-cream/55">
        <span className="font-semibold text-cream" data-numeric>
          {formatPaise(TOTAL)}
        </span>{" "}
        replaces every one of these. That is the whole gap, for one athlete, for a season.
      </figcaption>
    </figure>
  );
}
