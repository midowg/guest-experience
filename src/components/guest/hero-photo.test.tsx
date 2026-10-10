import { expect, test, describe } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord, GalleryImage, HeroTextPosition, ImageFocus } from "@/lib/types";
import { EventExperience } from "./EventExperience";
import { Gallery, imageSrcSet } from "./Gallery";
import styles from "./guest.module.css";

/**
 * These render the guest opening to static markup, which is enough to assert the photo
 * contract: which image feeds the backdrop, which candidates are offered, where the text
 * block sits, and that the dimming layer is present. No DOM environment is installed, so
 * effects and interaction (the carousel timer, reduced-motion sync) are not exercised here.
 */

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return { ...createSeedEvent(), ...overrides };
}

function heroEvent(hero: Partial<EventRecord["hero"]>, overrides: Partial<EventRecord> = {}) {
  return event({ hero: { url: "https://cdn.example.com/hero-2048.webp", alt: "Aula pertemuan", srcset: [], focus: "center", text_position: "left", ...hero }, ...overrides });
}

function galleryImage(index: number, srcset: GalleryImage["srcset"] = []): GalleryImage {
  return { id: `30f3a511-2331-4000-8000-00000000000${index}`, url: `https://cdn.example.com/gallery-${index}.jpg`, alt: `Foto ${index}`, caption: "", sort_order: index, srcset };
}

const variants = [
  { width: 1024, url: "https://cdn.example.com/hero-1024.webp" },
  { width: 480, url: "https://cdn.example.com/hero-480.webp" },
  { width: 2048, url: "https://cdn.example.com/hero-2048.webp" },
];

describe("imageSrcSet", () => {
  test("omits both attributes when the photo came from an external link", () => {
    expect(imageSrcSet([], "100vw")).toEqual({});
  });

  test("orders candidates by ascending width and carries sizes", () => {
    expect(imageSrcSet(variants, "100vw")).toEqual({
      srcSet: "https://cdn.example.com/hero-480.webp 480w, https://cdn.example.com/hero-1024.webp 1024w, https://cdn.example.com/hero-2048.webp 2048w",
      sizes: "100vw",
    });
  });

  test("drops unusable entries and keeps one url per width", () => {
    const messy = [
      { width: 800, url: "https://cdn.example.com/a.webp" },
      { width: 800, url: "https://cdn.example.com/duplicate.webp" },
      { width: 0, url: "https://cdn.example.com/zero.webp" },
      { width: 1200, url: "" },
    ];
    expect(imageSrcSet(messy, "100vw")).toEqual({ srcSet: "https://cdn.example.com/a.webp 800w", sizes: "100vw" });
  });

  test("returns nothing usable rather than an empty candidate list", () => {
    expect(imageSrcSet([{ width: 0, url: "" }], "100vw")).toEqual({});
  });

  test("skips a url holding a comma or space, which would break the candidate list", () => {
    const unsafe = [
      { width: 480, url: "https://cdn.example.com/a,b.webp" },
      { width: 1024, url: "https://cdn.example.com/c d.webp" },
      { width: 2048, url: "https://cdn.example.com/clean.webp" },
    ];
    expect(imageSrcSet(unsafe, "100vw")).toEqual({ srcSet: "https://cdn.example.com/clean.webp 2048w", sizes: "100vw" });
    expect(imageSrcSet(unsafe.slice(0, 2), "100vw")).toEqual({});
  });
});

describe("opening backdrop", () => {
  test("uses event.hero, not the first gallery photo", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({}, { gallery: [galleryImage(1)] })} />);
    expect(markup).toContain(styles.heroBackdrop);
    expect(markup).toContain("https://cdn.example.com/hero-2048.webp");
    const backdrop = markup.slice(markup.indexOf(styles.heroBackdrop), markup.indexOf(styles.heroScrim));
    expect(backdrop).not.toContain("gallery-1.jpg");
  });

  test("falls back to the editorial layout when hero.url is empty, even with gallery photos", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ url: "", alt: "" }, { gallery: [galleryImage(1)], venue_image_url: "https://cdn.example.com/venue.jpg", venue_image_alt: "Gedung" })} />);
    expect(markup).not.toContain(styles.heroBackdrop);
    expect(markup).toContain(styles.facts);
  });

  test("applies srcSet and sizes when the hero has served variants", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ srcset: variants })} />);
    expect(markup).toContain('srcSet="https://cdn.example.com/hero-480.webp 480w, https://cdn.example.com/hero-1024.webp 1024w, https://cdn.example.com/hero-2048.webp 2048w"');
    expect(markup).toContain('sizes="100vw"');
  });

  test("renders a plain src with no candidate attributes when srcset is empty", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ srcset: [] })} />);
    expect(markup).toContain('src="https://cdn.example.com/hero-2048.webp"');
    expect(markup).not.toContain("srcSet");
    expect(markup).not.toContain("sizes=");
  });

  test("the backdrop stays decorative so the title is not announced twice", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ alt: "Aula pertemuan" })} />);
    const backdrop = markup.slice(markup.indexOf(styles.heroBackdrop), markup.indexOf(styles.heroScrim));
    expect(backdrop).toContain('alt=""');
    expect(backdrop).toContain('aria-hidden="true"');
  });
});

describe("hero.text_position", () => {
  // Two placements, both anchored at the bottom: the only difference is the horizontal axis.
  test("left leaves the block at its natural alignment", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ text_position: "left" })} />);
    expect(markup).not.toContain(styles.heroInnerCenter);
    expect(markup).toContain(styles.heroScrim);
  });

  test("center applies the centring class", () => {
    const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ text_position: "center" })} />);
    expect(markup).toContain(styles.heroInnerCenter);
    expect(markup).toContain(styles.heroScrim);
  });

  test("both positions keep the dimming layer; there is no way to switch it off", () => {
    for (const position of ["left", "center"] as const) {
      const markup = renderToStaticMarkup(<EventExperience event={heroEvent({ text_position: position })} />);
      expect(markup, position).toContain(styles.heroScrim);
    }
  });

  test("an unexpected stored value falls back to left rather than breaking", () => {
    const broken = heroEvent({ text_position: "diagonal" as HeroTextPosition, focus: "sideways" as ImageFocus });
    const markup = renderToStaticMarkup(<EventExperience event={broken} />);
    expect(markup).toContain(styles.heroScrim);
    expect(markup).not.toContain(styles.heroInnerCenter);
  });
});

describe("gallery", () => {
  test("a single photo renders as a still figure with no controls", () => {
    const markup = renderToStaticMarkup(<Gallery images={[galleryImage(1)]} />);
    expect(markup).toContain(styles.galleryFigure);
    expect(markup).not.toContain("<button");
  });

  test("a single photo uses its variants when it has them", () => {
    const markup = renderToStaticMarkup(<Gallery images={[galleryImage(1, [{ width: 480, url: "https://cdn.example.com/g-480.webp" }, { width: 1600, url: "https://cdn.example.com/g-1600.webp" }])]} />);
    expect(markup).toContain('srcSet="https://cdn.example.com/g-480.webp 480w, https://cdn.example.com/g-1600.webp 1600w"');
    expect(markup).toContain('sizes="(max-width: 960px) 100vw, 852px"');
  });

  test("two or more photos become a carousel with controls", () => {
    const markup = renderToStaticMarkup(<Gallery images={[galleryImage(1), galleryImage(2)]} />);
    expect(markup).toContain('aria-roledescription="carousel"');
    expect(markup).toContain("Foto sebelumnya");
    expect(markup).toContain("Foto berikutnya");
  });

  test("slides carry their own variants and plain links stay plain", () => {
    const withVariants = galleryImage(1, [{ width: 1024, url: "https://cdn.example.com/g1-1024.webp" }]);
    const markup = renderToStaticMarkup(<Gallery images={[withVariants, galleryImage(2)]} />);
    expect(markup).toContain('srcSet="https://cdn.example.com/g1-1024.webp 1024w"');
    expect(markup).toContain('src="https://cdn.example.com/gallery-2.jpg"');
    expect(markup.match(/srcSet=/g)).toHaveLength(1);
  });

  test("the gallery offers no focus control", () => {
    const markup = renderToStaticMarkup(<Gallery images={[galleryImage(1), galleryImage(2)]} />);
    expect(markup).not.toContain("object-position");
    expect(markup).not.toContain("Fokus");
  });

  test("an empty gallery renders nothing", () => {
    expect(renderToStaticMarkup(<Gallery images={[]} />)).toBe("");
  });
});
