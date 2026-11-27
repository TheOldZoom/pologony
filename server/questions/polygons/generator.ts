import type { QuestionTier, Mark } from '../../../shared/game';
import { englishText, spanishText } from './text';
import { shuffle } from '../shuffle';
import type { Question } from '../types';

type Exercise = {
  text: string;
  hint: string;
  answer: string;
  wrong: string[];
  unit?: string;
  mark?: Mark;
  explain: string;
};

function exact(numerator: number, denominator = 1, radical?: 2 | 3): string {
  let divisor = numerator;
  let remainder = denominator;
  while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
  const top = numerator / divisor;
  const bottom = denominator / divisor;
  const base = radical && top ? `${top === 1 ? '' : top}√${radical}` : String(top);
  return bottom === 1 ? base : `${base}/${bottom}`;
}

const totalDiagonals = (n: number) => (n * (n - 3)) / 2;
const interior = (n: number) => ((n - 2) * 180) / n;
const numbers = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, i) => min + i);
const sides = numbers(3, 12);
const integerAngles = sides.filter((n) => 360 % n === 0);

function polygonQuestion(
  landedSides: number,
  TEXT: typeof spanishText,
  random: () => number,
  tier?: QuestionTier,
) {
  const rand = (a: number, b: number) => a + Math.floor(random() * (b - a + 1));
  const pick = <T>(choices: readonly T[]): T => choices[rand(0, choices.length - 1)];
  const decimal = (n: number) => n.toFixed(2).replace('.', TEXT === spanishText ? ',' : '.');

  function measurement(
    n: number,
    key: 'central' | 'exterior' | 'interior' | 'sum' | 'vertex' | 'diagonals',
  ) {
    const interiorSum = (n - 2) * 180;
    const D = totalDiagonals(n);
    const angleWrong = [
      exact(interiorSum, n),
      exact(360, n),
      exact(180, n),
      exact(360, n + 1),
      String(interiorSum),
      '180',
    ];

    switch (key) {
      case 'central':
      case 'exterior':
        return {
          answer: exact(360, n),
          wrong: angleWrong,
          unit: TEXT.angle,
          hint: TEXT.hint.turn,
          mark: key === 'central' ? ('radius' as const) : ('none' as const),
          explain: `360°/${n} = ${exact(360, n)}°`,
        };
      case 'interior':
        return {
          answer: exact(interiorSum, n),
          wrong: angleWrong,
          unit: TEXT.angle,
          hint: TEXT.hint.interior,
          explain: `(${n} − 2)·180°/${n} = ${exact(interiorSum, n)}°`,
        };
      case 'sum':
        return {
          answer: String(interiorSum),
          wrong: angleWrong,
          unit: TEXT.angle,
          hint: TEXT.hint.sum,
          explain: `(${n} − 2)·180° = ${interiorSum}°`,
        };
      case 'vertex':
      case 'diagonals':
        return {
          answer: String(key === 'vertex' ? n - 3 : D),
          wrong: [n - 3, D, n - 2, (n * (n - 1)) / 2, D * 2, n + 1].map(String),
          hint: key === 'vertex' ? TEXT.hint.vertex : TEXT.hint.diagonals,
          explain: key === 'vertex' ? `${n} − 3 = ${n - 3}` : `${n}·(${n} − 3)/2 = ${D}`,
        };
    }
  }

  const measures = ['central', 'exterior', 'interior', 'sum', 'vertex', 'diagonals'] as const;
  const freshLengths = numbers(4, 18).filter((l) => ![6, 7, 10, 12, 15].includes(l));

  function namedMeasurement(n: number): Exercise {
    const key = pick(measures);
    return {
      ...measurement(n, key),
      text: TEXT.named(TEXT.shape(n), TEXT.ask[key]),
    };
  }

  function perimeter(n: number, l: number) {
    return {
      hint: TEXT.hint.perimeter,
      answer: String(n * l),
      wrong: [l, n, (n - 2) * l, 2 * n * l].map(String),
      unit: TEXT.length,
      explain: `P = ${n}·${l} = ${n * l} cm`,
    };
  }

  function namedPerimeter(n: number, l: number): Exercise {
    return {
      ...perimeter(n, l),
      mark: 'side',
      text: TEXT.given(TEXT.shape(n), TEXT.side(l), TEXT.ask.perimeter),
    };
  }

  function areaFromPerimeter(n: number, l: number): Exercise {
    const P = n * l;
    const hint = TEXT.hint.areaFromMeasures;
    const shape = TEXT.shape(n);

    if (n === 3 || n === 4 || n === 6) {
      const denominator = n === 3 ? 6 : 2;
      const radical = n === 4 ? undefined : 3;
      const a = exact(l, denominator, radical);
      const product = P * l;
      const answer = exact(product, 2 * denominator, radical);
      return {
        text: TEXT.given(
          shape,
          `${TEXT.perimeter(P)} ${TEXT.and} ${TEXT.apothem(a)}`,
          TEXT.ask.area,
        ),
        hint,
        answer,
        unit: TEXT.area,
        mark: 'apothem',
        wrong: [
          exact(product, denominator, radical),
          exact(product, 4 * denominator, radical),
          exact(l * l, 2 * denominator, radical),
        ],
        explain: `A = P·a/2 = ${P}·(${a})/2 = ${answer} cm²`,
      };
    }

    const apothemCents = Math.round((100 * l) / (2 * Math.tan(Math.PI / n)));
    const a = decimal(apothemCents / 100);
    const answer = decimal(Math.round((P * apothemCents) / 2) / 100);
    return {
      text:
        TEXT.given(
          shape,
          `${TEXT.perimeter(P)} ${TEXT.and} ${TEXT.approximateApothem(a)}`,
          TEXT.ask.estimateArea,
        ) + TEXT.rounded,
      hint,
      answer,
      unit: TEXT.area,
      mark: 'apothem',
      wrong: [
        decimal((P * apothemCents) / 100),
        decimal((l * apothemCents) / 200),
        decimal(Math.round((P * apothemCents) / 4) / 100),
      ],
      explain: `A = P·a/2 ≈ ${P}·${a}/2 ≈ ${answer} cm²`,
    };
  }

  const sideArea = {
    3: {
      multiplier: 1,
      denominator: 4,
      radical: 3,
      formula: 'l²√3/4',
      hint: TEXT.hint.triangleArea,
    },
    4: {
      multiplier: 1,
      denominator: 1,
      radical: undefined,
      formula: 'l²',
      hint: TEXT.hint.squareArea,
    },
    6: {
      multiplier: 3,
      denominator: 2,
      radical: 3,
      formula: '3·l²√3/2',
      hint: TEXT.hint.hexArea,
    },
  } as const;

  function areaFromSide(n: keyof typeof sideArea, l: number): Exercise {
    const { multiplier, denominator, radical, formula, hint } = sideArea[n];
    const numerator = multiplier * l * l;
    const answer = exact(numerator, denominator, radical);
    return {
      text: TEXT.given(TEXT.shape(n), TEXT.side(l), TEXT.ask.area),
      hint,
      answer,
      unit: TEXT.area,
      mark: 'side',
      wrong: [
        exact(2 * numerator, denominator, radical),
        exact(numerator, 2 * denominator, radical),
        String(radical ? l * l : 4 * l),
        String(l * l + l),
      ],
      explain: `A = ${formula} = ${formula.replace('l', `(${l})`)} = ${answer} cm²`,
    };
  }

  function triangle(n: number, l: number): Exercise {
    const kind = pick([
      'radiusFromSide',
      'sideFromRadius',
      'apothemFromRadius',
      'areaFromSide',
    ] as const);
    if (kind === 'areaFromSide') return areaFromSide(3, l);
    const fromSide = kind === 'radiusFromSide';
    const ask = fromSide ? 'radius' : kind === 'sideFromRadius' ? 'side' : 'apothem';
    const answer = fromSide
      ? exact(l, 3, 3)
      : kind === 'sideFromRadius'
        ? exact(l, 1, 3)
        : exact(l, 2);
    const wrong = [exact(l, 6, 3), exact(l, 2, 3), exact(l, 1, 3), exact(l, 2), String(2 * l)];
    return {
      text: TEXT.given(TEXT.shape(n), fromSide ? TEXT.side(l) : TEXT.radius(l), TEXT.ask[ask]),
      hint: TEXT.hint.triangle,
      answer,
      wrong,
      unit: TEXT.length,
      mark: fromSide ? 'side' : 'radius',
      explain: fromSide
        ? `r = l√3/3 = ${answer} cm`
        : kind === 'sideFromRadius'
          ? `l = r√3 = ${answer} cm`
          : `a = r/2 = ${exact(l, 2)} cm`,
    };
  }

  function square(n: number, l: number): Exercise {
    const mode = pick([
      'apothem',
      'radicalApothem',
      'diagonal',
      'diagonalToApothem',
      'radius',
      'side',
    ] as const);
    if (mode === 'side') return areaFromSide(4, l);
    const square = l * l;
    const apothem = mode === 'apothem' || mode === 'radicalApothem';
    const given = apothem
      ? TEXT.apothem(mode === 'apothem' ? String(l) : exact(l, 1, 2))
      : mode === 'radius'
        ? TEXT.radius(l)
        : TEXT.diagonal(l);
    if (mode === 'diagonalToApothem') {
      const answer = exact(l, 4, 2);
      return {
        text: TEXT.given(TEXT.shape(n), given, TEXT.ask.apothem),
        hint: TEXT.hint.squareDiagonal,
        mark: 'diagonals',
        answer,
        wrong: [exact(l, 2, 2), exact(l, 2), exact(l, 4), String(l)],
        unit: TEXT.length,
        explain: `l = D/√2 = ${exact(l, 2, 2)} cm\na = l/2 = ${answer} cm`,
      };
    }
    const answer =
      mode === 'apothem'
        ? String(4 * square)
        : mode === 'radicalApothem'
          ? String(8 * square)
          : mode === 'radius'
            ? String(2 * square)
            : exact(square, 2);
    const lead = apothem
      ? `l = 2a = ${mode === 'apothem' ? 2 * l : exact(2 * l, 1, 2)} cm`
      : `D = 2r = ${2 * l} cm`;
    return {
      text: TEXT.given(TEXT.shape(n), given, TEXT.ask.area),
      hint: apothem
        ? TEXT.hint.squareApothem
        : mode === 'radius'
          ? TEXT.hint.squareRadius
          : TEXT.hint.squareDiagonal,
      answer,
      wrong: [exact(square, 2), square, 2 * square, 4 * square, 8 * square, 16 * square].map(
        String,
      ),
      unit: TEXT.area,
      mark: apothem ? 'apothem' : mode === 'radius' ? 'radius' : 'diagonals',
      explain:
        mode === 'diagonal'
          ? `A = D²/2 = ${l}²/2 = ${answer} cm²`
          : `${lead}\nA = ${mode === 'radius' ? 'D²/2' : 'l²'} = ${answer} cm²`,
    };
  }

  function hexagon(n: number, l: number): Exercise {
    const mode = pick([
      'areaFromApothem',
      'apothemFromRadius',
      'sideFromRadius',
      'apothemFromPerimeter',
      'areaFromPerimeter',
      'areaFromSide',
    ] as const);
    if (mode === 'areaFromSide') return areaFromSide(6, l);
    const fromRadius = mode === 'apothemFromRadius' || mode === 'sideFromRadius';
    const fromApothem = mode === 'areaFromApothem';
    const given = fromApothem
      ? TEXT.apothem(exact(l, 1, 3))
      : fromRadius
        ? TEXT.radius(l)
        : TEXT.perimeter(n * l);
    const hint = fromApothem
      ? TEXT.hint.hexApothem
      : fromRadius
        ? TEXT.hint.hexRadius
        : TEXT.hint.perimeter;
    const mark = fromApothem ? 'apothem' : fromRadius ? 'radius' : 'none';
    if (mode === 'sideFromRadius') {
      return {
        text: TEXT.given(TEXT.shape(n), given, TEXT.ask.side),
        hint,
        mark,
        answer: String(l),
        wrong: [exact(l, 2, 3), exact(l, 2), String(2 * l)],
        unit: TEXT.length,
        explain: `l = r = ${l} cm`,
      };
    }
    if (mode === 'apothemFromRadius' || mode === 'apothemFromPerimeter') {
      const answer = exact(l, 2, 3);
      return {
        text: TEXT.given(TEXT.shape(n), given, TEXT.ask.apothem),
        hint,
        mark,
        answer,
        wrong: [String(l), exact(l, 1, 3), exact(l, 2), exact(l, 4, 3)],
        unit: TEXT.length,
        explain: `l = ${fromRadius ? 'r' : 'P/6'} = ${l} cm\na = l√3/2 = ${answer} cm`,
      };
    }
    const side = fromApothem ? 2 * l : l;
    const answer = exact(3 * side * side, 2, 3);
    return {
      text: TEXT.given(TEXT.shape(n), given, TEXT.ask.area),
      hint,
      mark,
      answer,
      wrong: [
        exact(3 * side * side, 1, 3),
        exact(side * side, 2, 3),
        exact(side * side, 4, 3),
        String(6 * side * side),
      ],
      unit: TEXT.area,
      explain: `l = ${fromApothem ? '2a/√3' : 'P/6'} = ${side} cm\nA = 3l²√3/2 = ${answer} cm²`,
    };
  }

  function trig(n: number, l: number): Exercise {
    const ask = n === 5 ? 'area' : pick(['area', 'apothem', 'radius'] as const);
    const angle = Math.PI / n;
    const a = l / (2 * Math.tan(angle));
    const r = l / (2 * Math.sin(angle));
    const area = (n * l * a) / 2;
    const given = n === 5 ? TEXT.perimeter(n * l) : TEXT.side(l);
    const base = {
      text: TEXT.given(TEXT.shape(n), given, TEXT.ask[ask]) + TEXT.rounded,
    };

    if (ask === 'area') {
      return {
        ...base,
        hint: TEXT.hint.area,
        mark: n === 5 ? 'none' : 'side',
        answer: decimal(area),
        wrong: [2 * area, area / n, (n * l * r) / 2, n * l * l].map(decimal),
        unit: TEXT.area,
        explain: `${n === 5 ? `l = P/${n} = ${l} cm\n` : ''}a = ${l}/(2·tan(180°/${n})) ≈ ${decimal(a)} cm\nA = ${n}·${l}·a/2 ≈ ${decimal(area)} cm²`,
      };
    }
    const radius = ask === 'radius';
    const answer = radius ? r : a;
    return {
      ...base,
      hint: TEXT.hint.trig,
      mark: 'side',
      answer: decimal(answer),
      unit: TEXT.length,
      wrong: [radius ? a : r, 2 * answer, answer / 2, l / 2].map(decimal),
      explain: `${radius ? 'r' : 'a'} = ${l}/(2·${radius ? TEXT.sin : 'tan'}(180°/${n})) ≈ ${decimal(answer)} cm`,
    };
  }

  const mysteryKinds = [
    'sumToVertex',
    'interiorToDiagonals',
    'diagonalsToInterior',
    'centralToSum',
    'diagonalsToPerimeter',
    'interiorToPerimeter',
    'exteriorToSide',
  ] as const;

  function mysteryFor(landedSides: number): { exercise: Exercise; n: number } {
    const kind = pick(mysteryKinds);
    const usesSingleAngle =
      kind !== 'sumToVertex' && kind !== 'diagonalsToInterior' && kind !== 'diagonalsToPerimeter';
    const eligibleSides = usesSingleAngle ? integerAngles : sides;
    const worksheetSides: Record<(typeof mysteryKinds)[number], number[]> = {
      sumToVertex: [7, 9],
      interiorToDiagonals: [5, 6],
      diagonalsToInterior: [3, 9, 12],
      centralToSum: [5],
      diagonalsToPerimeter: [3],
      interiorToPerimeter: [],
      exteriorToSide: [],
    };
    const n = pick(
      eligibleSides.filter((n) => n !== landedSides && !worksheetSides[kind].includes(n)),
    );
    const D = totalDiagonals(n);
    const sum = (n - 2) * 180;
    const angle = 360 / n;
    const inner = interior(n);
    const l = pick(freshLengths);
    let given: string;
    let ask: string;
    let first: string;
    let hint: string;
    let outcome: Omit<Exercise, 'text'>;

    switch (kind) {
      case 'sumToVertex':
        given = TEXT.sum(sum);
        ask = TEXT.ask.vertex;
        hint = TEXT.hint.fromSum;
        first = `n = ${sum}°/180° + 2 = ${n}`;
        outcome = measurement(n, 'vertex');
        break;
      case 'interiorToDiagonals':
      case 'interiorToPerimeter':
        given =
          kind === 'interiorToDiagonals'
            ? TEXT.interior(inner)
            : `${TEXT.interior(inner)} ${TEXT.and} ${TEXT.side(l)}`;
        ask = kind === 'interiorToDiagonals' ? TEXT.ask.diagonals : TEXT.ask.perimeter;
        hint = TEXT.hint.fromInterior;
        first = `n = 360°/(180° − ${inner}°) = ${n}`;
        outcome = kind === 'interiorToDiagonals' ? measurement(n, 'diagonals') : perimeter(n, l);
        break;
      case 'diagonalsToInterior':
      case 'diagonalsToPerimeter':
        given =
          kind === 'diagonalsToInterior'
            ? TEXT.diagonals(D)
            : `${TEXT.diagonals(D)} ${TEXT.and} ${TEXT.side(l)}`;
        ask = kind === 'diagonalsToInterior' ? TEXT.ask.interior : TEXT.ask.perimeter;
        hint = TEXT.hint.fromDiagonals;
        first = `n(n − 3)/2 = ${D}\nn = (3 + √(9 + 8·${D}))/2 = ${n}`;
        outcome = kind === 'diagonalsToInterior' ? measurement(n, 'interior') : perimeter(n, l);
        break;
      case 'centralToSum':
        given = TEXT.central(angle);
        ask = TEXT.ask.sum;
        hint = TEXT.hint.fromTurn;
        first = `n = 360°/${angle}° = ${n}`;
        outcome = measurement(n, 'sum');
        break;
      case 'exteriorToSide': {
        const P = n * l;
        given = `${TEXT.exterior(angle)} ${TEXT.and} ${TEXT.perimeter(P)}`;
        ask = TEXT.ask.side;
        hint = TEXT.hint.fromTurn;
        first = `n = 360°/${angle}° = ${n}`;
        outcome = {
          hint,
          answer: String(l),
          wrong: [String(P), exact(P, n - 1), exact(P, n + 1)],
          unit: TEXT.length,
          explain: `l = P/n = ${P}/${n} = ${l} cm`,
        };
        break;
      }
    }

    return {
      n,
      exercise: {
        ...outcome,
        text: TEXT.mystery(given, ask),
        hint,
        mark: 'none',
        explain: `${first}\n${outcome.explain}`,
      },
    };
  }

  function namedExercise(n: number): Exercise {
    const geometry = n === 3 ? triangle : n === 4 ? square : n === 6 ? hexagon : trig;
    const l = pick(
      freshLengths.filter(
        (length) => !(n === 4 && length === 4) && !(n === 6 && [8, 18].includes(length)),
      ),
    );
    if (tier === 'easy') return pick([namedMeasurement, namedPerimeter])(n, l);
    if (tier === 'hard') return pick([areaFromPerimeter, geometry, trig])(n, l);
    return pick([
      namedMeasurement,
      namedMeasurement,
      namedPerimeter,
      areaFromPerimeter,
      geometry,
      geometry,
      geometry,
    ])(n, l);
  }

  const mystery =
    tier === 'challenge' || (tier !== 'easy' && rand(1, 3) === 1)
      ? mysteryFor(landedSides)
      : undefined;
  const n = mystery?.n ?? landedSides;
  const exercise = mystery?.exercise ?? namedExercise(n);
  const { answer, text, hint, explain, mark = 'none', unit = '' } = exercise;
  const wrong = [...new Set(exercise.wrong.filter((value) => value !== answer))];
  const options = shuffle([answer, ...shuffle(wrong, random).slice(0, 3)], random);
  return {
    text,
    hint,
    n,
    mark,
    options: options.map((value) => `${value}${unit}`),
    correct: options.indexOf(answer),
    explanation: explain,
    ...(mystery && { mystery: true as const }),
  };
}

export function makeQuestion(landedSides: number, tier?: QuestionTier): Question {
  const draws: number[] = [];
  const spanish = polygonQuestion(
    landedSides,
    spanishText,
    () => {
      const draw = Math.random();
      draws.push(draw);
      return draw;
    },
    tier,
  );
  let index = 0;
  const { text, hint, options, explanation } = polygonQuestion(
    landedSides,
    englishText,
    () => draws[index++],
    tier,
  );
  return { ...spanish, english: { text, hint, options, explanation } };
}
