/* ubg: Poki SDK removed - no-op shim */
(function(){var P=new Proxy({init:function(){return Promise.resolve()},rewardedBreak:function(){return Promise.resolve(false)},commercialBreak:function(){return Promise.resolve()},getURLParam:function(){return null}},{get:function(t,k){return k in t?t[k]:function(){return Promise.resolve()}}});window.PokiSDK=P;})();
