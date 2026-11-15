const AVIF_EXTENSION = '.avif';
const AVIF_FORMAT_INDEX = 8;
const WEBP_EXTENSION = '.webp';

export function registerAvifSupport(cc) {
  const textureFormats = cc.macro?.SUPPORT_TEXTURE_FORMATS;
  const imageExtensions = cc.ImageAsset?.extnames;
  if (!Array.isArray(textureFormats) || !Array.isArray(imageExtensions)) {
    throw new Error('Cocos image format tables are unavailable');
  }

  if (!textureFormats.includes(AVIF_EXTENSION)) textureFormats.push(AVIF_EXTENSION);
  if (!imageExtensions.includes(AVIF_EXTENSION)) imageExtensions.push(AVIF_EXTENSION);
  if (imageExtensions.indexOf(AVIF_EXTENSION) !== AVIF_FORMAT_INDEX) {
    throw new Error(`Cocos AVIF format index must be ${AVIF_FORMAT_INDEX}`);
  }

  const registries = [
    [cc.assetManager?.downloader, '_downloaders'],
    [cc.assetManager?.factory, '_producers'],
    [cc.assetManager?.parser, '_parsers'],
  ];
  for (const [registry, handlersKey] of registries) {
    const webpHandler = registry?.[handlersKey]?.[WEBP_EXTENSION];
    if (!registry?.register || typeof webpHandler !== 'function') {
      throw new Error(`Cocos AVIF registration source is unavailable: ${handlersKey}`);
    }
    registry.register(AVIF_EXTENSION, webpHandler);
  }
}
