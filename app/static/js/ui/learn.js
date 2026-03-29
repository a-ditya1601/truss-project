(function () {
  const learnRoot = document.querySelector("[data-learn-page]");

  if (!learnRoot) {
    return;
  }

  const links = Array.from(learnRoot.querySelectorAll("[data-learn-nav-link]"));
  const sections = Array.from(learnRoot.querySelectorAll("[data-learn-section]"));
  const progressIndicator = learnRoot.querySelector("#learn-progress-indicator");
  const mobileProgressIndicator = learnRoot.querySelector("#learn-progress-indicator-mobile");
  const progressPercent = learnRoot.querySelector("#learn-progress-percent");

  if (links.length === 0 || sections.length === 0) {
    return;
  }

  function setActiveLink(sectionId) {
    links.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${sectionId}`;

      link.classList.toggle("bg-white/5", isActive);
      link.classList.toggle("text-white", isActive);
      link.classList.toggle("border", isActive);
      link.classList.toggle("border-[#ff8a3d]/20", isActive);
      link.classList.toggle("shadow-[0_0_24px_rgba(255,138,61,0.12)]", isActive);
    });
  }

  function updateProgress() {
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = documentHeight > 0 ? (window.scrollY / documentHeight) * 100 : 0;
    const clampedProgress = Math.min(100, Math.max(0, progress));

    if (progressIndicator) {
      progressIndicator.style.width = `${clampedProgress}%`;
    }

    if (mobileProgressIndicator) {
      mobileProgressIndicator.style.width = `${clampedProgress}%`;
    }

    if (progressPercent) {
      progressPercent.textContent = `${Math.round(clampedProgress)}%`;
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

      if (!visibleSection) {
        return;
      }

      setActiveLink(visibleSection.target.id);
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0.2, 0.35, 0.6],
    }
  );

  sections.forEach((section) => {
    observer.observe(section);
  });

  links.forEach((link) => {
    link.addEventListener("click", () => {
      const sectionId = link.getAttribute("href").replace("#", "");
      setActiveLink(sectionId);
    });
  });

  updateProgress();
  setActiveLink(sections[0].id);
  window.addEventListener("scroll", updateProgress, { passive: true });
})();
