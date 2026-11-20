import { describe, expect, it } from 'vitest';
import { appendToPlate, formatPlate, isValidPlate, nextSlot, normalizePlate, splitPlate } from './plate';

describe('normalizePlate', () => {
  it('strips spaces, dashes and lowercases', () => {
    expect(normalizePlate('а 123 вс-77')).toBe('А123ВС77');
  });
  it('maps Latin look-alikes to Cyrillic', () => {
    const latin = normalizePlate('E123KX799');
    expect(latin).toBe('Е123КХ799');
    expect(latin).toBe(normalizePlate('Е123КХ799'));
  });
  it('drops letters that cannot appear on a plate', () => {
    expect(normalizePlate('Ж123ЗИ77 RUS')).toBe('12377');
  });
});

describe('isValidPlate', () => {
  it.each(['А123ВС77', 'Е001КХ799', 'О000ОО00'])('accepts %s', (p) => expect(isValidPlate(p)).toBe(true));
  it.each(['А123ВС7', '123ВС77', 'А123ВС7777', 'АА123В77'])('rejects %s', (p) => expect(isValidPlate(p)).toBe(false));
});

describe('mask-driven input', () => {
  it('alternates letters and digits by position', () => {
    expect(nextSlot('')).toBe('L');
    expect(nextSlot('А')).toBe('D');
    expect(nextSlot('А123')).toBe('L');
    expect(nextSlot('А123ВС')).toBe('D');
    expect(nextSlot('А123ВС777')).toBe(null);
  });
  it('ignores keys of the wrong kind', () => {
    expect(appendToPlate('', '1')).toBe('');
    expect(appendToPlate('А', 'В')).toBe('А');
    expect(appendToPlate('А', '1')).toBe('А1');
    expect(appendToPlate('', 'a')).toBe('А'); // Latin from a hardware keyboard
  });
  it('builds a full plate from typed keys', () => {
    let v = '';
    for (const k of 'Е123КХ799') v = appendToPlate(v, k);
    expect(v).toBe('Е123КХ799');
    expect(appendToPlate(v, '1')).toBe(v);
  });
});

describe('formatting', () => {
  it('splits into main part and region', () => {
    expect(splitPlate('А123ВС77')).toEqual({ main: 'А 123 ВС', region: '77' });
    expect(formatPlate('Е001КХ799')).toBe('Е 001 КХ 799');
  });
});
