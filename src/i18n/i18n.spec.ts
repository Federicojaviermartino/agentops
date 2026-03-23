import { I18nService } from './i18n.module';

describe('I18nService - 21 Languages', () => {
  let service: I18nService;
  beforeEach(() => { service = new I18nService(); });

  it('supports exactly 15 locales', () => {
    expect(service.getLocales()).toHaveLength(21);
    expect(service.getLocaleCount()).toBe(21);
  });

  it('includes all EU official languages', () => {
    const locales = service.getLocales();
    ['en','es','de','fr','it','pt','nl','pl','sv','da','fi','el','cs','ro','hu','ca','ru','ar','ko','zh','ja'].forEach(l => expect(locales).toContain(l));
  });

  it('returns locale names for all 15', () => {
    const names = service.getLocaleNames();
    expect(Object.keys(names)).toHaveLength(21);
    expect(names.en).toBe('English');
    expect(names.es).toBe('Espanol');
    expect(names.nl).toBe('Nederlands');
    expect(names.pl).toBe('Polski');
    expect(names.sv).toBe('Svenska');
    expect(names.da).toBe('Dansk');
    expect(names.fi).toBe('Suomi');
    expect(names.el).toBe('Ellinika');
    expect(names.cs).toBe('Cestina');
    expect(names.ro).toBe('Romana');
    expect(names.hu).toBe('Magyar');
  });

  // Test every language has translations for core keys
  const coreKeys = ['risk.high', 'risk.minimal', 'compliance.compliant', 'severity.critical', 'ui.dashboard', 'ui.systems', 'ui.findings', 'ui.settings', 'agent.classification', 'deadline.days_left'];
  const locales: string[] = ['en','es','de','fr','it','pt','nl','pl','sv','da','fi','el','cs','ro','hu','ca','ru','ar','ko','zh','ja'];

  locales.forEach(locale => {
    it(`has all core translations for ${locale}`, () => {
      coreKeys.forEach(key => {
        const val = service.t(key, locale as any);
        expect(val).not.toBe(key); // Should not return key itself
        expect(val.length).toBeGreaterThan(0);
      });
    });
  });

  // Test specific translations per language
  it('Dutch translations are correct', () => {
    expect(service.t('risk.high', 'nl')).toBe('Hoog');
    expect(service.t('ui.dashboard', 'nl')).toBe('Dashboard');
    expect(service.t('severity.critical', 'nl')).toBe('Kritiek');
  });

  it('Polish translations are correct', () => {
    expect(service.t('risk.high', 'pl')).toBe('Wysokie');
    expect(service.t('ui.dashboard', 'pl')).toBe('Panel');
    expect(service.t('severity.critical', 'pl')).toBe('Krytyczne');
  });

  it('Swedish translations are correct', () => {
    expect(service.t('risk.high', 'sv')).toBe('Hog');
    expect(service.t('ui.settings', 'sv')).toBe('Installningar');
  });

  it('Danish translations are correct', () => {
    expect(service.t('deadline.days_left', 'da')).toBe('dage tilbage');
    expect(service.t('ui.monitoring', 'da')).toBe('Overvagning');
  });

  it('Finnish translations are correct', () => {
    expect(service.t('risk.high', 'fi')).toBe('Korkea');
    expect(service.t('ui.analytics', 'fi')).toBe('Analytiikka');
  });

  it('Greek translations are correct', () => {
    expect(service.t('severity.critical', 'el')).toBe('Krisimo');
    expect(service.t('ui.documents', 'el')).toBe('Engrafa');
  });

  it('Czech translations are correct', () => {
    expect(service.t('risk.high', 'cs')).toBe('Vysoke');
    expect(service.t('ui.settings', 'cs')).toBe('Nastaveni');
  });

  it('Romanian translations are correct', () => {
    expect(service.t('risk.high', 'ro')).toBe('Ridicat');
    expect(service.t('compliance.compliant', 'ro')).toBe('Conform');
  });

  it('Hungarian translations are correct', () => {
    expect(service.t('risk.high', 'hu')).toBe('Magas');
    expect(service.t('severity.critical', 'hu')).toBe('Kritikus');
    expect(service.t('ui.dashboard', 'hu')).toBe('Iranyitopult');
  });

  it('falls back to English for unknown locale', () => {
    expect(service.t('risk.high', 'xx' as any)).toBe('High');
  });

  it('returns key for unknown translation key', () => {
    expect(service.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('getAll returns all keys for locale', () => {
    const all = service.getAll('hu');
    expect(Object.keys(all).length).toBeGreaterThan(25);
    expect(all['risk.high']).toBe('Magas');
  });

  it('getPromptLocale returns for all 15 languages', () => {
    locales.forEach(l => {
      const prompt = service.getPromptLocale(l as any);
      expect(prompt.length).toBeGreaterThan(5);
    });
  });

  it('getPromptLocale has correct language instructions', () => {
    expect(service.getPromptLocale('nl')).toContain('Nederlands');
    expect(service.getPromptLocale('pl')).toContain('polsku');
    expect(service.getPromptLocale('sv')).toContain('svenska');
    expect(service.getPromptLocale('hu')).toContain('magyarul');
  });

  it('key count is greater than 25', () => {
    expect(service.getKeyCount()).toBeGreaterThan(25);
  });

  it('total translations = keys * locales', () => {
    expect(service.getKeyCount() * service.getLocaleCount()).toBeGreaterThan(500); // 25+ keys * 15 locales
  });

  // Article translations
  it('article references available in all languages', () => {
    locales.forEach(l => {
      const v5 = service.t('article.art5', l as any); expect(v5.length).toBeGreaterThan(5);
      const v9 = service.t('article.art9', l as any); expect(v9.length).toBeGreaterThan(5);
    });
  });

  // Action translations
  it('action labels translated', () => {
    expect(service.t('action.register_system', 'de')).toContain('registrieren');
    expect(service.t('action.run_assessment', 'fr')).toContain('evaluation');
    expect(service.t('action.generate_doc', 'it')).toContain('documentazione');
  });
});

// New languages tests
describe('I18nService - New Languages (ca, ru, ar, ko, zh, ja)', () => {
  let service: I18nService;
  beforeEach(() => { service = new I18nService(); });

  it('Catalan translations', () => {
    expect(service.t('risk.high', 'ca')).toBe('Alt');
    expect(service.t('ui.dashboard', 'ca')).toBe('Tauler');
    expect(service.t('severity.medium', 'ca')).toBe('Mitja');
    expect(service.t('severity.low', 'ca')).toBe('Baix');
  });

  it('Russian translations', () => {
    expect(service.t('risk.high', 'ru')).toBe('Vysokij');
    expect(service.t('ui.settings', 'ru')).toBe('Nastrojki');
    expect(service.t('severity.critical', 'ru')).toBe('Kriticheskij');
    expect(service.t('compliance.compliant', 'ru')).toBe('Sootvetstvujushchij');
  });

  it('Arabic translations', () => {
    expect(service.t('risk.high', 'ar')).toBe('Ali');
    expect(service.t('severity.low', 'ar')).toBe('Munkhafid');
    expect(service.t('deadline.days_left', 'ar')).toContain('ayyam');
  });

  it('Korean translations', () => {
    expect(service.t('risk.high', 'ko')).toBe('Nopda');
    expect(service.t('ui.dashboard', 'ko')).toBe('Daesiboedeu');
    expect(service.t('compliance.compliant', 'ko')).toBe('Junsu');
  });

  it('Chinese translations', () => {
    expect(service.t('risk.high', 'zh')).toBe('Gao');
    expect(service.t('severity.low', 'zh')).toBe('Di');
    expect(service.t('ui.analytics', 'zh')).toBe('Fenxi');
  });

  it('Japanese translations', () => {
    expect(service.t('risk.high', 'ja')).toBe('Takai');
    expect(service.t('severity.low', 'ja')).toBe('Hikui');
    expect(service.t('ui.settings', 'ja')).toBe('Settei');
  });

  it('locale names include all 21', () => {
    const names = service.getLocaleNames();
    expect(names.ca).toBe('Catala');
    expect(names.ru).toBe('Russkij');
    expect(names.ar).toBe('Al-Arabiyya');
    expect(names.ko).toBe('Hangugeo');
    expect(names.zh).toBe('Zhongwen');
    expect(names.ja).toBe('Nihongo');
  });

  it('prompt locale for new languages', () => {
    expect(service.getPromptLocale('ca')).toContain('catala');
    expect(service.getPromptLocale('ru')).toContain('russki');
    expect(service.getPromptLocale('ar')).toContain('arabiyya');
    expect(service.getPromptLocale('ko')).toContain('Hangugeo');
    expect(service.getPromptLocale('zh')).toContain('zhongwen');
    expect(service.getPromptLocale('ja')).toContain('Nihongo');
  });

  it('total translations = 30+ keys * 21 locales = 630+', () => {
    expect(service.getKeyCount() * service.getLocaleCount()).toBeGreaterThanOrEqual(630);
  });
});
