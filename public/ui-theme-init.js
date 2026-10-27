// Runs before the first paint (a classic script in <head>) so a saved theme never flashes the wrong colours.
// The same rule lives in ui-theme.js; a test keeps the two in step.
(function () {
  try {
    var pref = localStorage.getItem("aletheia.theme");
    if (pref === "dark" || pref === "light") document.documentElement.setAttribute("data-theme", pref);
  } catch (error) {
    // storage can be blocked; the system setting applies
  }
})();
