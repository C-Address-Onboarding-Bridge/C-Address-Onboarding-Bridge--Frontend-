(function () {
  try {
    var theme = localStorage.getItem("ui:theme");
    if (
      theme === "dark" ||
      (theme !== "light" &&
        !window.matchMedia("(prefers-color-scheme: light)").matches)
    ) {
      document.documentElement.classList.add("dark");
    }
  } catch {}
})();
