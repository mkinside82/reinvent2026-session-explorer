export function supportsOnDeviceTranslation() {
  return typeof globalThis.Translator === 'function';
}

export async function translateSessionToJapanese(title, abstract) {
  const Api = globalThis.Translator;
  if (typeof Api !== 'function') throw new Error('TRANSLATOR_UNAVAILABLE');
  const translator = await Api.create({ sourceLanguage: 'en', targetLanguage: 'ja' });
  try {
    return await translator.translate(`${title}\n\n${abstract}`);
  } finally {
    translator.destroy?.();
  }
}
