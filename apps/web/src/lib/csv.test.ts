import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a BOM, CRLF lines and quotes only when needed', () => {
    expect(
      toCsv([
        ['Ruta', 'Puestos'],
        ['Caracas – Mérida', 3],
      ]),
    ).toBe('﻿Ruta,Puestos\r\nCaracas – Mérida,3\r\n');
    expect(toCsv([['a,b', 'dice "hola"', null]])).toBe('﻿"a,b","dice ""hola""",\r\n');
  });

  it('neutralizes cells that a spreadsheet would run as formulas', () => {
    expect(toCsv([['=SUM(A1)', '-25.00', -25]])).toBe("﻿'=SUM(A1),'-25.00,-25\r\n");
  });
});
