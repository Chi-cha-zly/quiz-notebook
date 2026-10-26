(function () {
  'use strict';
  if (!window.QuizNative) throw new Error('桌面连接未就绪，请重新打开自测本。');
  // contextBridge freezes exposed objects. app.js must attach its flush method to
  // a renderer-owned adapter, rather than attempting to mutate the native bridge.
  window.QuizDesktop = {
    initialState: window.QuizNative.initialState,
    request: (message) => window.QuizNative.request(message)
  };
})();
