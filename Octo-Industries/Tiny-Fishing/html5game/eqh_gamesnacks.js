function js_GS_sendScore() {}
function js_GS_gameOver() {}
function js_GS_isAudioEnabled() { return false; }

function js_isIE() {
  return /MSIE|Trident/.test(window.navigator.userAgent);
}

function js_isMobileOrTablet() {
  return /android|bb\d+|meego|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|mobile|opera m(ob|in)i|palm|phone|playbook|silk|symbian|tablet|windows ce|xda/i.test(window.navigator.userAgent);
}
