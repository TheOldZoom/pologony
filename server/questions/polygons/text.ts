export const spanishText = {
  shape: (n: number) => {
    switch (n) {
      case 3:
        return 'un triángulo equilátero';
      case 4:
        return 'un cuadrado';
      case 5:
        return 'un pentágono regular';
      case 6:
        return 'un hexágono regular';
      case 7:
        return 'un heptágono regular';
      case 8:
        return 'un octágono regular';
      default:
        return `un polígono regular de ${n} lados`;
    }
  },
  named: (shape: string, ask: string) => `Considera ${shape}. ${ask}`,
  given: (shape: string, given: string, ask: string) => `En ${shape}, ${given}. ${ask}`,
  mystery: (given: string, ask: string) => `En un polígono regular, ${given}. ${ask}`,
  rounded: ' Redondeá a dos decimales.',
  and: 'y',
  sin: 'sen',
  ask: {
    central: '¿Cuánto mide el ángulo central?',
    exterior: '¿Cuánto mide el ángulo exterior?',
    interior: '¿Cuánto mide el ángulo interior?',
    sum: '¿Cuánto suman los ángulos interiores?',
    vertex: '¿Cuántas diagonales salen de un vértice?',
    diagonals: '¿Cuántas diagonales hay en total?',
    side: '¿Cuánto mide cada lado?',
    radius: '¿Cuánto mide el radio?',
    apothem: '¿Cuánto mide la apotema?',
    perimeter: '¿Cuál es el perímetro?',
    area: '¿Cuál es el área?',
    estimateArea: '¿Cuál es el área aproximada con estos datos?',
  },
  side: (l: number) => `cada lado mide ${l} cm`,
  diagonal: (d: number) => `la diagonal mide ${d} cm`,
  apothem: (a: string) => `la apotema mide ${a} cm`,
  approximateApothem: (a: string) => `la apotema mide aproximadamente ${a} cm`,
  radius: (r: number) => `el radio mide ${r} cm`,
  perimeter: (p: number) => `el perímetro mide ${p} cm`,
  sum: (s: number) => `los ángulos interiores suman ${s}°`,
  interior: (i: number) => `cada ángulo interior mide ${i}°`,
  central: (c: number) => `cada ángulo central mide ${c}°`,
  exterior: (e: number) => `cada ángulo exterior mide ${e}°`,
  diagonals: (d: number) => `hay ${d} diagonales en total`,
  length: ' cm',
  area: ' cm²',
  angle: '°',
  hint: {
    turn: 'Los ángulos centrales y los exteriores suman 360° en cada caso.',
    interior: 'El ángulo interior y el exterior del mismo vértice suman 180°.',
    sum: 'Al trazar diagonales desde un vértice se forman n − 2 triángulos.',
    vertex: 'Un vértice no se conecta consigo mismo ni con sus dos vecinos.',
    diagonals: 'Al contar desde cada vértice, cada diagonal se cuenta dos veces.',
    perimeter: 'El perímetro es el número de lados por la longitud de cada lado.',
    fromSum: 'Igualá la suma a (n − 2)·180° y despejá n.',
    fromInterior: 'Restá el ángulo interior a 180° y usá el ángulo exterior para hallar n.',
    fromTurn: 'Dividí 360° entre el ángulo dado para hallar n.',
    fromDiagonals: 'Resolvé n(n − 3)/2 = D y usá la raíz positiva.',
    triangle:
      'Uní el centro con un vértice y con el punto medio de un lado. Se forma un triángulo de 30°, 60° y 90°.',
    squareApothem: 'La apotema del cuadrado es la mitad del lado.',
    squareDiagonal: 'La diagonal forma dos triángulos rectángulos con lados iguales.',
    squareRadius: 'La diagonal del cuadrado pasa por el centro y mide el doble del radio.',
    hexRadius: 'Al unir los vértices con el centro se forman seis triángulos equiláteros.',
    hexApothem: 'La apotema es la altura de uno de los seis triángulos equiláteros.',
    areaFromMeasures: 'Multiplicá el perímetro por la apotema y dividí entre dos.',
    triangleArea:
      'La altura de un triángulo equilátero es l√3/2. Usá la fórmula de base por altura entre dos.',
    squareArea: 'El área de un cuadrado es el lado al cuadrado.',
    hexArea: 'Dividí el hexágono en seis triángulos equiláteros y sumá sus áreas.',
    area: 'Calculá el lado y la apotema. Multiplicá el perímetro por la apotema y dividí entre dos.',
    trig: 'Usá el triángulo rectángulo que forman el radio, la apotema y la mitad de un lado. Su ángulo en el centro es 180°/n.',
  },
};

export const englishText: typeof spanishText = {
  shape: (n) => {
    switch (n) {
      case 3:
        return 'an equilateral triangle';
      case 4:
        return 'a square';
      case 5:
        return 'a regular pentagon';
      case 6:
        return 'a regular hexagon';
      case 7:
        return 'a regular heptagon';
      case 8:
        return 'a regular octagon';
      default:
        return `a regular polygon with ${n} sides`;
    }
  },
  named: (shape, ask) => `Consider ${shape}. ${ask}`,
  given: (shape, given, ask) => `In ${shape}, ${given}. ${ask}`,
  mystery: (given, ask) => `In a regular polygon, ${given}. ${ask}`,
  rounded: ' Round to two decimal places.',
  and: 'and',
  sin: 'sin',
  ask: {
    central: 'What is the measure of the central angle?',
    exterior: 'What is the measure of the exterior angle?',
    interior: 'What is the measure of the interior angle?',
    sum: 'What is the sum of the interior angles?',
    vertex: 'How many diagonals extend from one vertex?',
    diagonals: 'How many diagonals are there in total?',
    side: 'How long is each side?',
    radius: 'What is the radius?',
    apothem: 'What is the apothem?',
    perimeter: 'What is the perimeter?',
    area: 'What is the area?',
    estimateArea: 'What is the approximate area using these measurements?',
  },
  side: (l) => `each side is ${l} cm long`,
  diagonal: (d) => `the diagonal is ${d} cm long`,
  apothem: (a) => `the apothem is ${a} cm`,
  approximateApothem: (a) => `the apothem is approximately ${a} cm`,
  radius: (r) => `the radius is ${r} cm`,
  perimeter: (p) => `the perimeter is ${p} cm`,
  sum: (s) => `the interior angles add up to ${s}°`,
  interior: (i) => `each interior angle measures ${i}°`,
  central: (c) => `each central angle measures ${c}°`,
  exterior: (e) => `each exterior angle measures ${e}°`,
  diagonals: (d) => `there are ${d} diagonals in total`,
  length: ' cm',
  area: ' cm²',
  angle: '°',
  hint: {
    turn: 'The central angles add up to 360°, and so do the exterior angles.',
    interior: 'The interior and exterior angles at the same vertex add up to 180°.',
    sum: 'Drawing diagonals from one vertex divides the polygon into n − 2 triangles.',
    vertex: 'A vertex cannot be joined to itself or to either of its neighbors by a diagonal.',
    diagonals: 'Counting from every vertex counts each diagonal twice.',
    perimeter: 'Multiply the number of sides by the length of one side.',
    fromSum: 'Set the sum equal to (n − 2)·180° and solve for n.',
    fromInterior: 'Subtract the interior angle from 180° and use the exterior angle to find n.',
    fromTurn: 'Divide 360° by the given angle to find n.',
    fromDiagonals: 'Solve n(n − 3)/2 = D and take the positive root.',
    triangle:
      'Join the center to a vertex and to the midpoint of a side. This forms a 30°–60°–90° triangle.',
    squareApothem: 'The apothem of a square is half its side length.',
    squareDiagonal: 'The diagonal forms two right triangles with equal legs.',
    squareRadius: 'The diagonal of a square passes through the center and is twice the radius.',
    hexRadius: 'Joining the vertices to the center forms six equilateral triangles.',
    hexApothem: 'The apothem is the height of one of the six equilateral triangles.',
    areaFromMeasures: 'Multiply the perimeter by the apothem and divide by two.',
    triangleArea:
      'The height of an equilateral triangle is l√3/2. Multiply the base by the height and divide by two.',
    squareArea: 'The area of a square is the side length squared.',
    hexArea: 'Divide the hexagon into six equilateral triangles and add their areas.',
    area: 'Find the side length and apothem. Multiply the perimeter by the apothem and divide by two.',
    trig: 'Use the right triangle formed by the radius, the apothem, and half a side. Its angle at the center is 180°/n.',
  },
};
