const opponentCache = new Map<string, string>();

const fuzzyOpponentAnchors = [
  "Cask and Barrel",
  "Clackmannan County",
  "Drummond Trinity",
  "Dunfermline & Carnegie",
  "Kirk Brae",
  "Old Contemptibles",
  "Renfrew",
  "Stenhousemuir",
];

function opponentMatchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] +
          (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function fuzzyOpponentAlias(name: string) {
  const key = opponentMatchKey(name);
  let closest: { name: string; distance: number } | null = null;
  for (const anchor of fuzzyOpponentAnchors) {
    const distance = editDistance(key, opponentMatchKey(anchor));
    const threshold = key.length >= 12 ? 2 : 1;
    if (distance <= threshold && (!closest || distance < closest.distance)) {
      closest = { name: anchor, distance };
    }
  }
  return closest?.name ?? null;
}

export function canonicalOpponent(rawOpponent: string | null | undefined) {
  const raw = (rawOpponent || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1");
  if (!raw) return "Unknown opposition";
  const cached = opponentCache.get(raw);
  if (cached) return cached;

  const aliases: [RegExp, string][] = [
    [
      /(?:intra[\s-]?club|interclub game|\bmitres\b|^practice match\b|^team(?:\s+(?:jas|aaron))?\s*\.?$)/i,
      "Internal Friendly",
    ],
    [/^edinburgh south\b/i, "Edinburgh South"],
    [/^bass\s+rock\b/i, "Bass Rock"],
    [/^carlton\b/i, "Carlton"],
    [/^edinburgh (?:accies|academicals)\b/i, "Edinburgh Academicals"],
    [/^edinburgh (?:uni|university)\b/i, "Edinburgh University"],
    [/^dunfermline\b/i, "Dunfermline & Carnegie"],
    [/^drummond trin(?:ity|ithy)\b/i, "Drummond Trinity"],
    [/^clackmann(?:an|on)(?: county)?\b/i, "Clackmannan County"],
    [/^(?:eccentric )?flamingoes\b/i, "Eccentric Flamingoes"],
    [/^glasgow (?:academicals|accies)\b/i, "Glasgow Accies"],
    [/^glasgow ghk\b/i, "GHK"],
    [/^glasgow (?:uni|university) staff\b/i, "Glasgow University Staff"],
    [/^heriot(?:'s|s)\b/i, "Heriot's"],
    [/^holy cross\b/i, "Holy Cross"],
    [/^leith\b/i, "Leith FAB"],
    [/^lismore\b/i, "Lismore"],
    [/^livingston(?: & district)?\b/i, "Livingston"],
    [/^(?:kirk\s*brae|kirkbrae)\b/i, "Kirk Brae"],
    [/^fauldhouse\b/i, "Fauldhouse"],
    [/^murrayfield[\s-]*dafs\b/i, "Murrayfield DAFS"],
    [/^manderston\b/i, "Manderston"],
    // All Morton team labels (Morton CC, 2nds, 3rds, 3s, XI, etc.)
    // represent the same opposition for club-level reporting.
    [/^(?:[1-6](?:st|nd|rd|th)?\s+(?:xi\s+)?)?morton\b/i, "Morton"],
    [/^(?:rhc|rh corstorphine|royal high corstorphine)\b/i, "RH Corstorphine"],
    [/^(?:smrh|stew[\s-]?mel|stewarts?'? melville)\b/i, "Stewart's Melville"],
    [/^(?:scottish (?:&|and) newcastle|s&n tranent)\b/i, "Scottish & Newcastle"],
    [/^stirling(?: county)?\b/i, "Stirling County"],
    [/^(?:watsonian|watsonians|watsons college)\b/i, "Watsonians"],
    [/^west(?: c\.?\s*c\.?)?$/i, "West of Scotland"],
    [/^west of scotland\b/i, "West of Scotland"],
    [/^west lothian\b/i, "West Lothian"],
    [/^westquarter & redding\b/i, "Westquarter & Redding"],
    [/^e\s*=\s*m(?:c{1,2})2?\b/i, "E=MCC"],
    [/^esca\b/i, "ESCA"],
    [/^ghk\b/i, "GHK"],
    [/^mdafs\b/i, "MDAFS"],
  ];
  const directAlias = aliases.find(([pattern]) => pattern.test(raw));
  if (directAlias) {
    opponentCache.set(raw, directAlias[1]);
    return directAlias[1];
  }

  const name = raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+-\s+.*$/g, " ")
    .replace(/\bcricket club\b/gi, "")
    .replace(/\brugby club\b/gi, "")
    .replace(/\br\.?\s*f\.?\s*c\.?\b/gi, "")
    .replace(/\bc\.?\s*c\.?\b/gi, "")
    .replace(/\./g, " ")
    .replace(
      /\s+(?:[1-6](?:st|nd|rd|th)?(?:\s*xi)?|[1-6](?:s|nds|rds|ths)|firsts?|seconds?|thirds?|fourths?|fifths?|sixths?|ii'?s?|xi|x1|development(?:\s+xi)?|challengers?|ladies|women(?:'s)?)\b.*$/i,
      "",
    )
    .replace(/\s*\/\s*mitres.*$/i, "")
    .replace(/[,:;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedAlias = aliases.find(([pattern]) => pattern.test(name));
  if (cleanedAlias) {
    opponentCache.set(raw, cleanedAlias[1]);
    return cleanedAlias[1];
  }
  if (!name) return raw;

  const fuzzyAlias = fuzzyOpponentAlias(name);
  if (fuzzyAlias) {
    opponentCache.set(raw, fuzzyAlias);
    return fuzzyAlias;
  }

  const canonical = name
    .split(" ")
    .map((word) => {
      if (/^[A-Z&=]{2,}$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
  opponentCache.set(raw, canonical);
  return canonical;
}
