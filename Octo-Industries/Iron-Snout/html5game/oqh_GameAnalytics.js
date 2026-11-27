// GameAnalytics - Stubbed for offline use (no telemetry)
var gameanalytics;
(function(e) {
    var GameAnalytics = {
        configureAvailableCustomDimensions01: function() {},
        configureAvailableCustomDimensions02: function() {},
        configureAvailableCustomDimensions03: function() {},
        configureAvailableResourceCurrencies: function() {},
        configureAvailableResourceItemTypes: function() {},
        configureBuild: function() {},
        configureSdkGameEngineVersion: function() {},
        configureGameEngineVersion: function() {},
        configureUserId: function() {},
        initialize: function() {},
        addBusinessEvent: function() {},
        addResourceEvent: function() {},
        addProgressionEvent: function() {},
        addDesignEvent: function() {},
        addErrorEvent: function() {},
        setEnabledInfoLog: function() {},
        setEnabledVerboseLog: function() {},
        setCustomDimension01: function() {},
        setCustomDimension02: function() {},
        setCustomDimension03: function() {},
        setGender: function() {},
        setBirthYear: function() {},
        setFacebookId: function() {},
        startSession: function() {},
        endSession: function() {},
        onStop: function() {},
        onResume: function() {}
    };
    e.GameAnalytics = GameAnalytics;

    // Stub enums that the game may reference
    e.EGAErrorSeverity = { Undefined: 0, Debug: 1, Info: 2, Warning: 3, Error: 4, Critical: 5 };
    e.EGAGender = { Undefined: 0, Male: 1, Female: 2 };
    e.EGAProgressionStatus = { Undefined: 0, Start: 1, Complete: 2, Fail: 3 };
    e.EGAResourceFlowType = { Undefined: 0, Source: 1, Sink: 2 };
})(gameanalytics || (gameanalytics = {}));

var EGAErrorSeverity = gameanalytics.EGAErrorSeverity;
var EGAGender = gameanalytics.EGAGender;
var EGAProgressionStatus = gameanalytics.EGAProgressionStatus;
var EGAResourceFlowType = gameanalytics.EGAResourceFlowType;
