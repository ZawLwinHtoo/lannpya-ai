/* Hide the loader as soon as the app has drawn something, or when the page has fully loaded. */
    (function(){var l=document.getElementById('lp-loader'),done=function(){if(!l||l.classList.contains('gone'))return;l.setAttribute('aria-hidden','true');l.removeAttribute('role');l.removeAttribute('aria-live');l.classList.add('gone');setTimeout(function(){l.remove()},320)};
    var app=document.getElementById('app');if(app&&window.MutationObserver){new MutationObserver(function(m,o){if(app.children.length){o.disconnect();done()}}).observe(app,{childList:true})}
    window.addEventListener('load',function(){setTimeout(done,100)});setTimeout(done,15000);})();
