(function () {
  const panelRoot = document.querySelector("[data-results-panel]");

  if (!panelRoot) {
    return;
  }

  const tabButtons = Array.from(panelRoot.querySelectorAll("[data-results-tab]"));
  const tabPanels = Array.from(panelRoot.querySelectorAll("[data-results-tab-panel]"));
  const resultsSection = document.querySelector("#results");
  const sidebarLinks = Array.from(document.querySelectorAll("[data-sidebar-link]"));
  const observedSections = sidebarLinks
    .map((link) => {
      const targetId = link.getAttribute("href");
      return targetId ? document.querySelector(targetId) : null;
    })
    .filter(Boolean);

  function activateSidebarLink(sectionId) {
    sidebarLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${sectionId}`;
      link.classList.toggle("ui-sidebar-link-active", isActive);
      link.setAttribute("aria-current", isActive ? "page" : "false");
    });
  }

  function activateTab(tabName) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.resultsTab === tabName;

      button.classList.toggle("bg-white", isActive);
      button.classList.toggle("shadow-sm", isActive);
      button.classList.toggle("dark:bg-white/10", isActive);
      button.classList.toggle("border-transparent", isActive);
      button.classList.toggle("bg-transparent", !isActive);
      button.classList.toggle("shadow-none", !isActive);
      button.classList.toggle("dark:bg-transparent", !isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.resultsTabPanel === tabName;
      panel.classList.toggle("hidden", !isActive);
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.resultsTab);
    });
  });

  if (sidebarLinks.length > 0 && observedSections.length > 0) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio);

        if (visibleEntries.length > 0) {
          activateSidebarLink(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-15% 0px -60% 0px",
        threshold: [0.15, 0.35, 0.6],
      }
    );

    observedSections.forEach((section) => {
      sectionObserver.observe(section);
    });
  }

  window.addEventListener("truss-results:visible", () => {
    activateTab("results");

    if (resultsSection) {
      resultsSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });

  if (sidebarLinks.length > 0) {
    activateSidebarLink("overview");
  }
  activateTab("results");
})();
