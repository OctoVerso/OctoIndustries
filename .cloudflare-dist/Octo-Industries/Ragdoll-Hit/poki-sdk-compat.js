(() => {
  const noop = () => {};
  const resolved = () => Promise.resolve();
  const sendToGame = (objectName, method, value) => {
    if (window.unityGame) window.unityGame.SendMessage(objectName, method, value);
  };

  function init() {
    window.pokiReady = true;
    return resolved();
  }

  window.initPokiBridge = function initPokiBridge(objectName) {
    if (!window.unityGame) {
      window.setTimeout(() => window.initPokiBridge(objectName), 100);
      return;
    }

    window.pokiBridge = objectName;
    window.pokiReady = true;
    sendToGame(objectName, 'ready');
    window.commercialBreak = () => resolved().then(() => sendToGame(objectName, 'commercialBreakCompleted'));
    window.rewardedBreak = () => Promise.resolve(false).then((rewarded) => {
      sendToGame(objectName, 'rewardedBreakCompleted', String(rewarded));
      return rewarded;
    });
    window.shareableURL = () => sendToGame(objectName, 'shareableURLRejected');
  };

  window.PokiSDK = Object.freeze({
    init,
    initWithVideoHB: init,
    customEvent: noop,
    commercialBreak: resolved,
    rewardedBreak: () => Promise.resolve(false),
    displayAd: noop,
    destroyAd: noop,
    getLeaderboard: resolved,
    getSharableURL: () => Promise.reject(new Error('Sharing is unavailable offline.')),
    getURLParam: () => '',
    disableProgrammatic: noop,
    gameLoadingStart: noop,
    gameLoadingFinished: noop,
    gameInteractive: noop,
    roundStart: noop,
    roundEnd: noop,
    muteAd: noop,
    setDebug: noop,
    gameplayStart: noop,
    gameplayStop: noop,
    gameLoadingProgress: noop,
    happyTime: noop,
    setPlayerAge: noop,
    togglePlayerAdvertisingConsent: noop,
    logError: noop,
    sendHighscore: noop,
    setDebugTouchOverlayController: noop,
  });
})();