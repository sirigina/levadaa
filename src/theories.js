// Seedable PRNG so the same photo always yields the same result.
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r = (rng, min, max, dec = 0) => {
  const v = rng() * (max - min) + min
  return dec === 0 ? Math.round(v) : Number(v.toFixed(dec))
}

export const THEORIES = [
  {
    key: 'fwhr',
    name: 'Cranio-Facial Width Index',
    source: 'Arnocky et al. · 2017',
    measure: (rng) =>
      `Zygomatic span ${r(rng, 42, 58, 1)}mm · FWHR ${r(rng, 1.78, 2.18, 3)}`,
    blurb: (s) =>
      s > 70
        ? 'Bizygomatic width pronounced. Square-faced phenotype — high-T cluster.'
        : s > 45
        ? 'Facial proportions within modal range.'
        : 'Narrow upper-face architecture. Oestrogen-adjacent morphology.'
  },
  {
    key: 'digit',
    name: 'Digit Ratio (2D:4D)',
    source: 'Manning Doctrine · 1998',
    measure: (rng) =>
      `Inferred 2D:4D ${r(rng, 0.913, 1.004, 3)} · prenatal-T proxy`,
    blurb: (s) =>
      s > 70
        ? 'Low 2D:4D inferred. Ring-finger dominant. Fetal androgen elevated.'
        : s > 45
        ? 'Ratio borderline; consistent with mixed prenatal signalling.'
        : 'Index-finger dominant — E-leaning fetal milieu.'
  },
  {
    key: 'jaw',
    name: 'Mandibular Prominence',
    source: 'T-Hypothesis',
    measure: (rng) =>
      `Gonial angle ${r(rng, 112, 128, 1)}° · chin protrusion ${r(rng, 2, 9, 1)}mm`,
    blurb: (s) =>
      s > 70
        ? 'Strong jaw vector. Structural confidence noted.'
        : s > 45
        ? 'Moderate mandibular definition.'
        : 'Soft jaw transitions; youthful morphology.'
  },
  {
    key: 'groom',
    name: 'Pilosebaceous Cultivation',
    source: 'Grooming Doctrine',
    measure: (rng) =>
      `Hair entropy ${r(rng, 0.12, 0.89, 2)} · dermal clarity ${r(rng, 30, 95, 0)}%`,
    blurb: (s) =>
      s > 70
        ? 'Deliberate presentation — suggests attentiveness and care.'
        : s > 45
        ? 'Acceptable grooming standard.'
        : 'Hair entropy high; rushed or indifferent preparation.'
  },
  {
    key: 'vratio',
    name: 'Cervico-Humeral V-Ratio',
    source: 'Shoulder : Waist',
    measure: (rng) =>
      `Acromial:iliac ${r(rng, 1.19, 1.68, 2)} · frame ${
        rng() > 0.5 ? 'meso' : 'ecto'
      }morphic`,
    blurb: (s) =>
      s > 70
        ? 'Dimorphic build. Testosterone-driven frame.'
        : s > 45
        ? 'Torso within statistical norm.'
        : 'Rectilinear form; low dimorphism.'
  },
  {
    key: 'ocular',
    name: 'Ocular Engagement Field',
    source: 'Pupillometric',
    measure: (rng) =>
      `Gaze axis ${r(rng, -4, 4, 1)}° · pupil ø ${r(rng, 3.2, 5.1, 1)}mm`,
    blurb: (s) =>
      s > 70
        ? 'Direct gaze. Confident autonomic signalling.'
        : s > 45
        ? 'Partial engagement; vector slightly averted.'
        : 'Gaze evasion detected; low assertive signal.'
  },
  {
    key: 'canine',
    name: 'Canine Cohabitation Factor',
    source: 'Cox Theorem · Daily Mail',
    measure: (rng) =>
      `Background canine probability ${r(rng, 5, 92, 0)}%`,
    blurb: (s) =>
      s > 70
        ? 'Elevated dog signal. Per Cox: nurturant disposition.'
        : s > 45
        ? 'Ambiguous — shadow, pug, or decorative cushion.'
        : "No dog detected. Deduct 'puts-others-first' quotient."
  },
  {
    key: 'ambient',
    name: 'Ambient Contextual Signal',
    source: 'Bayesian Folk',
    measure: (rng) =>
      `Bookshelf entropy ${r(rng, 0.19, 0.81, 2)} · beige-wall flag ${r(rng, 0, 1, 0)}`,
    blurb: (s) =>
      s > 70
        ? 'Context rich: books, instrument, or lived space visible.'
        : s > 45
        ? 'Neutral environment. Nothing damning.'
        : 'Sterile backdrop. Hotel-bathroom-mirror bracket.'
  }
]

export const CLASSIFICATIONS = [
  {
    min: 0,
    label: 'Structurally Concerning',
    note: 'The Institute respectfully recommends the subject devote the coming three (3) seasons to vigorous walking, adequate hydration, and the reading of Russian novels. Re-assessment may be undertaken at the new year.'
  },
  {
    min: 22,
    label: 'Developmental Potential',
    note: 'The subject displays embryonic promise. With modest cardiovascular labour and the acquisition of a single genuine hobby, substantial improvement is plausible within a lunar year.'
  },
  {
    min: 40,
    label: 'Satisfactory Subject',
    note: 'A competent, median specimen. The subject shall neither astonish nor disgrace. The Institute finds no cause for particular alarm nor particular excitement.'
  },
  {
    min: 56,
    label: 'Notable Specimen',
    note: 'A subject of genuine merit. The Institute has elected to retain the photograph in its reference archive for the instruction of junior analysts.'
  },
  {
    min: 72,
    label: 'Exceptional Candidate',
    note: 'The subject exceeds all standard doctrines. A certain caution is advised to those who would spend an evening in his company unprepared.'
  },
  {
    min: 88,
    label: 'Historic Finding',
    note: 'An extraordinary specimen. The Institute requests, with all courtesy, that the subject forward his postal address to the Geneva office at his earliest convenience.'
  }
]

export function classify(overall) {
  let cls = CLASSIFICATIONS[0]
  for (const c of CLASSIFICATIONS) if (overall >= c.min) cls = c
  return cls
}

export function stampFor(overall) {
  if (overall >= 88) return { text: 'HISTORIC', tone: 'gold' }
  if (overall >= 72) return { text: 'NOTABLE', tone: 'stamp' }
  if (overall < 25) return { text: 'UNDER REVIEW', tone: 'stamp' }
  return { text: 'ASSESSED', tone: 'stamp' }
}

export function generateCaseId() {
  const L = 'ABCDEFGHJKLMNPRSTVWXYZ'
  const pick = () => L[Math.floor(Math.random() * L.length)]
  const d = () => Math.floor(Math.random() * 10)
  return `${pick()}${pick()}-${d()}${d()}${d()}${d()}/${new Date().getFullYear()}`
}
