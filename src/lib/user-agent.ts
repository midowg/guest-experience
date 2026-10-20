// Coarse browser/OS label for the access log. Order matters: Edge and Opera also say "Chrome",
// and every Chromium browser also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"],
  [/(?:OPR|Opera)\/(\d+)/, "Opera"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows NT/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Tidak diketahui";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua));
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  const name = browser ? `${browser[1]} ${browser[0].exec(ua)![1]}` : "Peramban lain";
  return system ? `${name} · ${system}` : name;
}
