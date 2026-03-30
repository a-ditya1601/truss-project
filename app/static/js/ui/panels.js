(function () {
  const panelRoot = document.querySelector("[data-results-panel]");

  if (!panelRoot) {
    return;
  }

  const tabButtons = Array.from(panelRoot.querySelectorAll("[data-results-tab]"));
  const tabPanels = Array.from(panelRoot.querySelectorAll("[data-results-tab-panel]"));
  const resultsSection = document.querySelector("#results");
  const sidebarLinks = Array.from(document.querySelectorAll("[data-sidebar-link]"));
  const sidebarSectionOrder = [
    "overview",
    "geometry",
    "visualization",
    "materials",
    "supports",
    "loads",
    "results",
  ];
  const observedSections = sidebarSectionOrder
    .map((sectionId) => {
      const element = document.getElementById(sectionId);

      return element
        ? {
            id: sectionId,
            element,
          }
        : null;
    })
    .filter(Boolean);
  let scrollSyncFrame = null;

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

  function getScrollActiveSectionId() {
    if (observedSections.length === 0) {
      return null;
    }

    const activationOffset = 120;
    let activeSectionId = "";

    observedSections.forEach((section) => {
      const rect = section.element.getBoundingClientRect();

      if (rect.top <= activationOffset && rect.bottom >= activationOffset) {
        activeSectionId = section.id;
      }
    });

    if (!activeSectionId) {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;

      if (nearBottom) {
        activeSectionId = observedSections[observedSections.length - 1].id;
      } else {
        activeSectionId = observedSections[0].id;

        observedSections.forEach((section) => {
          const rect = section.element.getBoundingClientRect();

          if (rect.top <= activationOffset) {
            activeSectionId = section.id;
          }
        });
      }
    }

    return activeSectionId;
  }

  function syncSidebarLinkFromScroll() {
    const activeSectionId = getScrollActiveSectionId();

    if (activeSectionId) {
      console.log("Active Section:", activeSectionId);
      activateSidebarLink(activeSectionId);
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.resultsTab);
    });
  });

  if (sidebarLinks.length > 0 && observedSections.length > 0) {
    window.addEventListener(
      "scroll",
      () => {
        if (scrollSyncFrame) {
          return;
        }

        scrollSyncFrame = window.requestAnimationFrame(() => {
          scrollSyncFrame = null;
          syncSidebarLinkFromScroll();
        });
      },
      { passive: true }
    );
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
    syncSidebarLinkFromScroll();
  }
  activateTab("results");
})();
