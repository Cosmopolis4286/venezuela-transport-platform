import { bolivarAmount, parseBcvHomePage, parseDolarApi } from './bcv-sources.js';

// The shape of bcv.org.ve's home page (trimmed).
const BCV_PAGE = `
<div id="euro" class="col-sm-12 col-xs-12 "><div class="field-content"><div class="row recuadrotsmc">
  <div class="col-sm-6 col-xs-6"><span> EUR</span></div>
  <div class="col-sm-6 col-xs-6 centrado"><strong> 41,73914556 </strong></div></div></div></div>
<div id="dolar" class="col-sm-12 col-xs-12 "><div class="field-content"><div class="row recuadrotsmc">
  <div class="col-sm-6 col-xs-6"><img src="/sites/all/themes/bcv/images/usd.png"><span> USD</span></div>
  <div class="col-sm-6 col-xs-6 centrado"><strong> 236,45780000 </strong></div></div></div></div>
<div class="pull-right dinpro center">Fecha Valor: <span class="date-display-single" property="dc:date"
  datatype="xsd:dateTime" content="2026-11-24T00:00:00-04:00">Lunes, 24 Noviembre  2026</span></div>`;

describe('BCV rate sources', () => {
  it('reads Venezuelan amounts', () => {
    expect(bolivarAmount(' 236,45780000 ')).toBe('236.457800');
    expect(bolivarAmount('1.234,5678995')).toBe('1234.567900');
    expect(bolivarAmount('36,1')).toBe('36.100000');
    expect(bolivarAmount('0,0000001')).toBe(null);
    expect(bolivarAmount('abc')).toBe(null);
  });

  it("reads the dollar and its date from the BCV's home page, not the euro", () => {
    expect(parseBcvHomePage(BCV_PAGE)).toEqual({ date: '2026-11-24', unitsPerUsd: '236.457800' });
    expect(() => parseBcvHomePage('<html>mantenimiento</html>')).toThrow(/not found/);
    expect(() => parseBcvHomePage(BCV_PAGE.replace('Fecha Valor', 'Fecha'))).toThrow(/Fecha Valor/);
  });

  it('reads DolarApi, dated in Venezuela', () => {
    expect(
      parseDolarApi({ promedio: 236.4578, fechaActualizacion: '2026-11-22T02:30:00.000Z' }),
    ).toEqual({ date: '2026-11-21', unitsPerUsd: '236.457800' });
    expect(() => parseDolarApi({ promedio: 0 })).toThrow(/promedio/);
    expect(() => parseDolarApi({ promedio: 5 })).toThrow(/fechaActualizacion/);
  });
});
