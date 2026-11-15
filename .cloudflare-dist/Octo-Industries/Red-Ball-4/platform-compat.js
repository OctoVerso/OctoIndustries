(() => {
  const noOperation = () => {};
  let bridgeName;

  function sendBridgeMessage(method, value) {
    if (!bridgeName || !window.unityInstance) return;
    window.unityInstance.SendMessage(bridgeName, method, value);
  }

  window.PokiSDK = Object.freeze({
    init: () => Promise.resolve(),
    commercialBreak: () => Promise.resolve(),
    customEvent: noOperation,
    destroyAd: noOperation,
    displayAd: noOperation,
    gameLoadingFinished: noOperation,
    gameLoadingStart: noOperation,
    gameplayStart: noOperation,
    gameplayStop: noOperation,
    getLanguage: () => navigator.language || 'en',
    getURLParam: (name) => new URLSearchParams(window.location.search).get(name) || '',
    isAdBlocked: () => true,
    logError: (error) => console.error('Game platform error:', error),
    rewardedBreak: () => Promise.resolve(false),
    shareableURL: () => Promise.resolve(window.location.href),
  });

  window.commercialBreak = () => window.PokiSDK.commercialBreak()
    .then(() => sendBridgeMessage('commercialBreakCompleted'));
  window.rewardedBreak = () => window.PokiSDK.rewardedBreak()
    .then((rewarded) => sendBridgeMessage('rewardedBreakCompleted', String(rewarded)));
  window.shareableURL = (options) => window.PokiSDK.shareableURL(options)
    .then((url) => sendBridgeMessage('shareableURLResolved', url), () => sendBridgeMessage('shareableURLRejected'));
  window.initPokiBridge = (name) => {
    bridgeName = name;
    sendBridgeMessage('ready');
  };
  window.pokiBridgeReady = () => {
    window.pokiReady = true;
    sendBridgeMessage('ready');
  };
})();
