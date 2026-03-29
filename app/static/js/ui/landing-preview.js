(function () {
  const previewRoot = document.querySelector("[data-landing-preview]");

  if (!previewRoot) {
    return;
  }

  const nodes = Array.from(previewRoot.querySelectorAll("[data-preview-node]"));
  const members = Array.from(previewRoot.querySelectorAll("[data-preview-member]"));
  const load = previewRoot.querySelector("[data-preview-load]");

  if (nodes.length === 0 || members.length === 0 || !load) {
    return;
  }

  let timers = [];
  let loopTimer = null;
  let isVisible = false;

  function clearTimers() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
    window.clearTimeout(loopTimer);
  }

  function resetPreview() {
    clearTimers();

    nodes.forEach((node) => {
      node.style.opacity = "0";
    });

    members.forEach((member) => {
      const length = member.getTotalLength();
      member.style.strokeDasharray = `${length}`;
      member.style.strokeDashoffset = `${length}`;
      member.style.transition = "none";
      member.style.stroke = "#64748B";
      member.style.strokeWidth = member.dataset.highlight ? "3.2" : member.style.strokeWidth || "3.2";
      member.style.filter = "none";
    });

    load.style.opacity = "0";
    load.style.transform = "translateY(-14px)";
  }

  function highlightMembers() {
    members.forEach((member) => {
      if (member.dataset.highlight === "tension") {
        member.style.transition = "stroke 260ms ease-in-out, stroke-width 260ms ease-in-out, filter 260ms ease-in-out";
        member.style.stroke = "#22C55E";
        member.style.strokeWidth = "4";
        member.style.filter = "url(#previewMemberGlow)";
      }

      if (member.dataset.highlight === "compression") {
        member.style.transition = "stroke 260ms ease-in-out, stroke-width 260ms ease-in-out, filter 260ms ease-in-out";
        member.style.stroke = "#EF4444";
        member.style.strokeWidth = "4";
        member.style.filter = "url(#previewMemberGlow)";
      }
    });
  }

  function playPreview() {
    resetPreview();

    nodes.forEach((node, index) => {
      timers.push(
        window.setTimeout(() => {
          node.style.opacity = "1";
        }, 120 + index * 90)
      );
    });

    members.forEach((member, index) => {
      timers.push(
        window.setTimeout(() => {
          member.style.transition = "stroke-dashoffset 480ms ease-in-out";
          member.style.strokeDashoffset = "0";
        }, 520 + index * 150)
      );
    });

    timers.push(
      window.setTimeout(() => {
        load.style.opacity = "1";
        load.style.transform = "translateY(0)";
      }, 520 + members.length * 150 + 220)
    );

    timers.push(
      window.setTimeout(() => {
        highlightMembers();
      }, 520 + members.length * 150 + 640)
    );

    loopTimer = window.setTimeout(() => {
      if (isVisible) {
        playPreview();
      }
    }, 520 + members.length * 150 + 2600);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isVisible = true;
          playPreview();
          return;
        }

        isVisible = false;
        resetPreview();
      });
    },
    {
      threshold: 0.35,
    }
  );

  observer.observe(previewRoot);
})();
