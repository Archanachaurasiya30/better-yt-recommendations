// Debounces work that page changes trigger in bursts, for the content scripts.
(() => {
  "use strict";

  // Returns a scheduler that calls run() once after a delay, keeping whichever pending run comes first.
  function createScheduler(run) {
    let timer = null;
    let timerAt = Infinity;

    function cancel() {
      clearTimeout(timer);
      timer = null;
      timerAt = Infinity;
    }

    function schedule(delay) {
      const at = performance.now() + delay;
      if (timer !== null && timerAt <= at) return;
      clearTimeout(timer);
      timerAt = at;
      timer = setTimeout(() => {
        cancel();
        run();
      }, delay);
    }

    return Object.freeze({ schedule, cancel });
  }

  globalThis.BetterYT ??= {};
  globalThis.BetterYT.createScheduler = createScheduler;
})();
