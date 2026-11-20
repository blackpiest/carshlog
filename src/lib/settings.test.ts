import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { buildSourceUrl, DEFAULT_SOURCES, getSetting, setSetting } from './settings';

beforeEach(async () => {
  await db.settings.clear();
});

const avtocod = () => DEFAULT_SOURCES.find((s) => s.id === 'avtocod')!;
const nomerogram = () => DEFAULT_SOURCES.find((s) => s.id === 'nomerogram')!;

describe('buildSourceUrl', () => {
  it('puts the Cyrillic plate into the Автокод link, URL-encoded', () => {
    expect(buildSourceUrl(avtocod(), 'Н007МА797')).toBe('https://avtocod.ru/proverkaavto/%D0%9D007%D0%9C%D0%90797');
  });
  it('puts the lowercase Latin plate into the Номерограм link', () => {
    expect(buildSourceUrl(nomerogram(), 'А777АА797')).toBe('https://www.nomerogram.ru/n/a777aa797');
    expect(buildSourceUrl(nomerogram(), 'Н007МА797')).toBe('https://www.nomerogram.ru/n/h007ma797');
  });
});

describe('sources setting', () => {
  it('moves stored old defaults of both sources to the deep links', async () => {
    await setSetting('sources', [
      { id: 'avtocod', label: 'Автокод', urlTemplate: 'https://avtocod.ru/' },
      { id: 'nomerogram', label: 'Номерограм', urlTemplate: 'https://www.nomerogram.ru/' },
    ]);
    const sources = await getSetting('sources');
    expect(sources.map((s) => s.urlTemplate)).toEqual([avtocod().urlTemplate, nomerogram().urlTemplate]);
  });

  it('moves a stored old Автокод default to the deep link', async () => {
    await setSetting('sources', [
      { id: 'avtocod', label: 'Автокод', urlTemplate: 'https://avtocod.ru/' },
      { id: 'nomerogram', label: 'Номерограм', urlTemplate: 'https://example.test/{plate}' },
    ]);
    const sources = await getSetting('sources');
    expect(sources[0].urlTemplate).toBe(avtocod().urlTemplate);
    expect(sources[1].urlTemplate).toBe('https://example.test/{plate}');
  });

  it('keeps a custom Автокод template', async () => {
    await setSetting('sources', [{ id: 'avtocod', label: 'Автокод', urlTemplate: 'https://avtocod.ru/custom/{plate}' }]);
    expect((await getSetting('sources'))[0].urlTemplate).toBe('https://avtocod.ru/custom/{plate}');
  });
});
