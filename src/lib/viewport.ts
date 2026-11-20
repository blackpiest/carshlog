/**
 * iOS home-screen PWA bug: on a cold launch WebKit sometimes reports a layout viewport
 * shorter than the screen, so `position: fixed; bottom: 0` floats above the real bottom.
 * It fixes itself only after something forces a relayout (scrolling, a route change),
 * which never happens on the non-scrolling Home screen.
 *
 * In iOS standalone mode the app always fills the whole screen (when not in iPad split view),
 * so we take the height from `screen` instead of trusting the viewport, expose it as `--app-h`,
 * and the CSS pins bottom bars by `top` against that height.
 */
export function installViewportFix() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return;

  const root = document.documentElement;
  root.classList.add('ios-standalone');

  const update = () => {
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    const landscape = window.innerWidth > window.innerHeight;
    const fullW = landscape ? long : short;
    const fullH = landscape ? short : long;
    // Full-width window → the app owns the whole screen; otherwise (iPad split view) trust the viewport.
    const h = Math.abs(window.innerWidth - fullW) <= 1 ? fullH : window.innerHeight;
    root.style.setProperty('--app-h', `${h}px`);
  };

  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.addEventListener('pageshow', update);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update();
  });
}
