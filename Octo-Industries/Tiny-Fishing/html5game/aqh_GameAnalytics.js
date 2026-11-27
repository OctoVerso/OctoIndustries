var gameanalytics;
(function (scope) {
  var noop = function () {};
  var api = new Proxy({}, {
    get: function (_target, property) {
      return property === "isSDKVersionSupported" ? function () { return true; } : noop;
    }
  });

  scope.GameAnalytics = api;
  scope.EGAErrorSeverity = { Undefined: 0, Debug: 1, Info: 2, Warning: 3, Error: 4, Critical: 5 };
  scope.EGAGender = { Undefined: 0, Male: 1, Female: 2 };
  scope.EGAProgressionStatus = { Undefined: 0, Start: 1, Complete: 2, Fail: 3 };
  scope.EGAResourceFlowType = { Undefined: 0, Source: 1, Sink: 2 };
})(gameanalytics || (gameanalytics = {}));

var EGAErrorSeverity = gameanalytics.EGAErrorSeverity;
var EGAGender = gameanalytics.EGAGender;
var EGAProgressionStatus = gameanalytics.EGAProgressionStatus;
var EGAResourceFlowType = gameanalytics.EGAResourceFlowType;
