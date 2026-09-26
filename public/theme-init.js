(function () {
  try {
    var storedTheme = localStorage.getItem("ui:theme");
    var prefersDark = !window.matchMedia("(prefers-color-scheme: light)").matches;

    if (storedTheme === "dark" || (storedTheme !== "light" && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch {
    // Theme initialization is best effort; rendering must continue if storage
    // or media-query access is unavailable.
  }
})();
