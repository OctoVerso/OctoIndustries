(function() {
    'use strict';


    var startScreen = document.getElementById('bcubed-start-screen');
    var loading = document.getElementById('bcubed-loading');
    var siteLock = document.getElementById('bcubed-site-lock');
    var innerBox = document.querySelector('#bcubed-start-screen>div');
    var progress = document.getElementById('bcubed-loading-progress');


    function resize() {
        var scale = Math.min(window.innerWidth / 600, window.innerHeight / 550, 1);
        innerBox.style.transform = 'scale(' + scale + ', ' + scale + ')';
    }

    window.addEventListener('resize', resize);
    resize();
    BCubed.loadGame = true;
    BCubed.loading = {
        'hide': function() {
            window.removeEventListener('resize', resize);
            startScreen.parentNode.removeChild(startScreen);
        },
        'progress': function(percent) {
            progress.style.width = (percent * 100) + '%';
        }
    };

})();
