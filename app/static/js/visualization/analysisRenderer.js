(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const container = document.querySelector("#analysis-visualizer");
  const panel = document.querySelector("#results-analysis-visualizer-panel");
  const shell = document.querySelector("#results-analysis-visualizer-shell");
  const legend = document.querySelector("#analysis-visualizer-legend");
  const tooltip = document.querySelector("#analysis-visualizer-tooltip");

  if (!container || !panel || !shell || !legend || !tooltip) {
    return;
  }

  const VIEWBOX_WIDTH = 900;
  const VIEWBOX_HEIGHT = 420;
  const DRAWING_PADDING = 70;
  const MEMBER_HIT_TOLERANCE = 14;
  const FORCE_EPSILON = 1e-6;
  const MIN_STROKE = 2;
  const MAX_STROKE = 8;

  let solvedResult = null;
  let solvedModel = null;
  let solvedModelSignature = null;
  let hoveredMemberId = null;

  shell.style.transition = "opacity 200ms ease";

  function getThemeColors() {
    const isDark = document.documentElement.classList.contains("dark");

    return {
      grid: isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.18)",
      tension: "#22C55E",
      compression: "#EF4444",
      zero: "#6B7280",
      emptyText: "#94A3B8",
      nodeFill: isDark ? "#E2E8F0" : "#0F172A",
      tooltipBg: isDark ? "rgba(2, 6, 23, 0.92)" : "rgba(255, 255, 255, 0.96)",
      tooltipText: isDark ? "#F8FAFC" : "#0F172A",
      tooltipBorder: isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(203, 213, 225, 0.8)",
    };
  }

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    return element;
  }

  function clearVisualizer() {
    container.innerHTML = "";
  }

  function getCurrentModel() {
    if (
      window.trussAnalysisInputStore &&
      typeof window.trussAnalysisInputStore.getSolverInput === "function"
    ) {
      return window.trussAnalysisInputStore.getSolverInput();
    }

    if (
      window.trussAnalysisInputStore &&
      typeof window.trussAnalysisInputStore.getState === "function"
    ) {
      return window.trussAnalysisInputStore.getState();
    }

    return null;
  }

  function buildModelSignature(model) {
    if (!model) {
      return "";
    }

    return JSON.stringify({
      nodes: model.nodes || [],
      members: model.members || [],
      supports: model.supports || [],
      loads: model.loads || [],
    });
  }

  function updateLegend() {
    if (!solvedResult || !Array.isArray(solvedResult.member_forces) || solvedResult.member_forces.length === 0) {
      legend.classList.add("hidden");
      legend.innerHTML = "";
      return;
    }

    legend.innerHTML = `
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full bg-green-500"></span>
          <span>Tension</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>
          <span>Compression</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full bg-gray-500"></span>
          <span>Zero</span>
        </div>
      </div>
    `;
    legend.classList.remove("hidden");
  }

  function hideTooltip() {
    tooltip.classList.add("hidden");
    tooltip.innerHTML = "";
  }

  function positionTooltip(event) {
    if (tooltip.classList.contains("hidden")) {
      return;
    }

    const shellBounds = shell.getBoundingClientRect();
    const offsetX = 18;
    const offsetY = 18;
    const maxLeft = shellBounds.width - tooltip.offsetWidth - 10;
    const maxTop = shellBounds.height - tooltip.offsetHeight - 10;

    const left = Math.min(
      Math.max(event.clientX - shellBounds.left + offsetX, 10),
      Math.max(maxLeft, 10)
    );
    const top = Math.min(
      Math.max(event.clientY - shellBounds.top + offsetY, 10),
      Math.max(maxTop, 10)
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showTooltip(memberForce, event) {
    const colors = getThemeColors();
    const normalizedType =
      Math.abs(Number(memberForce.force)) < FORCE_EPSILON
        ? "Zero"
        : String(memberForce.type || "").toLowerCase() === "compression"
          ? "Compression"
          : "Tension";

    tooltip.innerHTML = `
      <div class="space-y-1">
        <div class="font-semibold">${memberForce.id}</div>
        <div>Force: ${(Number(memberForce.force) / 1000).toFixed(2)} kN</div>
        <div>Type: ${normalizedType}</div>
      </div>
    `;
    tooltip.style.background = colors.tooltipBg;
    tooltip.style.color = colors.tooltipText;
    tooltip.style.borderColor = colors.tooltipBorder;
    tooltip.classList.remove("hidden");
    positionTooltip(event);
  }

  function buildNodeMap(nodes) {
    return new Map(nodes.map((node) => [node.id, node]));
  }

  function buildForceLookup(memberForces) {
    const forceMap = new Map();
    let maxForce = 0;

    (memberForces || []).forEach((memberForce) => {
      const forceValue = Number(memberForce.force);
      forceMap.set(memberForce.id, memberForce);
      maxForce = Math.max(maxForce, Math.abs(forceValue));
    });

    return {
      forceMap,
      maxForce,
    };
  }

  function getBounds(nodes) {
    const xs = nodes.map((node) => Number(node.x));
    const ys = nodes.map((node) => Number(node.y));

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  function createCoordinateMapper(nodes) {
    const bounds = getBounds(nodes);
    let { minX, maxX, minY, maxY } = bounds;

    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }

    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    const usableWidth = VIEWBOX_WIDTH - DRAWING_PADDING * 2;
    const usableHeight = VIEWBOX_HEIGHT - DRAWING_PADDING * 2;
    const scaleX = usableWidth / (maxX - minX);
    const scaleY = usableHeight / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);
    const contentWidth = (maxX - minX) * scale;
    const contentHeight = (maxY - minY) * scale;
    const offsetX = (VIEWBOX_WIDTH - contentWidth) / 2;
    const offsetY = (VIEWBOX_HEIGHT - contentHeight) / 2;

    return function mapPoint(node) {
      return {
        x: offsetX + (Number(node.x) - minX) * scale,
        y: VIEWBOX_HEIGHT - (offsetY + (Number(node.y) - minY) * scale),
      };
    };
  }

  function createBaseSvg(colors) {
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
      class: "h-full w-full",
      role: "img",
      "aria-label": "Truss analysis output visualization",
      preserveAspectRatio: "xMidYMid meet",
    });

    const defs = createSvgElement("defs");

    const gridPattern = createSvgElement("pattern", {
      id: "analysis-grid",
      width: "32",
      height: "32",
      patternUnits: "userSpaceOnUse",
    });
    gridPattern.appendChild(
      createSvgElement("path", {
        d: "M 32 0 L 0 0 0 32",
        fill: "none",
        stroke: colors.grid,
        "stroke-width": "1",
      })
    );

    defs.appendChild(gridPattern);
    svg.appendChild(defs);
    svg.appendChild(
      createSvgElement("rect", {
        x: "0",
        y: "0",
        width: String(VIEWBOX_WIDTH),
        height: String(VIEWBOX_HEIGHT),
        fill: "url(#analysis-grid)",
      })
    );

    return svg;
  }

  function drawEmptyState(message) {
    clearVisualizer();

    const colors = getThemeColors();
    const svg = createBaseSvg(colors);
    const text = createSvgElement("text", {
      x: String(VIEWBOX_WIDTH / 2),
      y: String(VIEWBOX_HEIGHT / 2),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: colors.emptyText,
      "font-size": "18",
      "font-weight": "600",
    });
    text.textContent = message;
    svg.appendChild(text);
    container.appendChild(svg);
    updateLegend();
  }

  function getMemberVisualStyle(memberId, forceLookup, colors) {
    const memberForce = forceLookup.forceMap.get(memberId);

    if (!memberForce) {
      return {
        stroke: colors.zero,
        strokeWidth: MIN_STROKE,
        memberForce: { id: memberId, force: 0, type: "zero" },
      };
    }

    const forceMagnitude = Math.abs(Number(memberForce.force));
    const normalized = forceLookup.maxForce > 0 ? forceMagnitude / forceLookup.maxForce : 0;
    const strokeWidth = Math.min(
      MAX_STROKE,
      MIN_STROKE + normalized * (MAX_STROKE - MIN_STROKE)
    );

    let stroke = colors.tension;

    if (forceMagnitude < FORCE_EPSILON) {
      stroke = colors.zero;
    } else if (String(memberForce.type || "").toLowerCase() === "compression") {
      stroke = colors.compression;
    }

    return {
      stroke: hoveredMemberId === memberId ? stroke : stroke,
      strokeWidth: hoveredMemberId === memberId ? Math.min(MAX_STROKE + 1, strokeWidth + 1) : strokeWidth,
      memberForce,
    };
  }

  function drawNodes(group, nodes, mapPoint, colors) {
    nodes.forEach((node) => {
      const point = mapPoint(node);

      group.appendChild(
        createSvgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: "4.5",
          fill: colors.nodeFill,
          opacity: "0.9",
        })
      );
    });
  }

  function drawMembers(group, members, nodeMap, mapPoint, colors, forceLookup) {
    members.forEach((member) => {
      const startNode = nodeMap.get(member.start);
      const endNode = nodeMap.get(member.end);

      if (!startNode || !endNode) {
        return;
      }

      const start = mapPoint(startNode);
      const end = mapPoint(endNode);
      const style = getMemberVisualStyle(member.id, forceLookup, colors);

      const line = createSvgElement("line", {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        stroke: style.stroke,
        "stroke-width": style.strokeWidth,
        "stroke-linecap": "round",
      });

      const hitLine = createSvgElement("line", {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        stroke: "transparent",
        "stroke-width": MEMBER_HIT_TOLERANCE,
        "stroke-linecap": "round",
      });

      hitLine.style.cursor = "default";

      hitLine.addEventListener("mouseenter", (event) => {
        hoveredMemberId = member.id;
        showTooltip(style.memberForce, event);
        renderAnalysisVisualizer(solvedResult, { skipFade: true });
      });

      hitLine.addEventListener("mousemove", (event) => {
        positionTooltip(event);
      });

      hitLine.addEventListener("mouseleave", () => {
        if (hoveredMemberId === member.id) {
          hoveredMemberId = null;
          hideTooltip();
          renderAnalysisVisualizer(solvedResult, { skipFade: true });
        }
      });

      group.appendChild(line);
      group.appendChild(hitLine);
    });
  }

  function renderAnalysisVisualizer(data = solvedResult, options = {}) {
    if (data) {
      solvedResult = data;
    }

    panel.classList.toggle("hidden", !solvedResult);

    if (!solvedResult) {
      hideTooltip();
      updateLegend();
      return;
    }

    if (!solvedModel || !Array.isArray(solvedModel.nodes) || solvedModel.nodes.length === 0) {
      drawEmptyState("Solved result is available, but the source geometry could not be loaded.");
      return;
    }

    console.log("Rendering analysis visualizer");
    console.log("Member count:", (solvedModel.members || []).length);

    const drawFrame = () => {
      clearVisualizer();

      const colors = getThemeColors();
      const svg = createBaseSvg(colors);
      const nodeMap = buildNodeMap(solvedModel.nodes);
      const mapPoint = createCoordinateMapper(solvedModel.nodes);
      const forceLookup = buildForceLookup(solvedResult.member_forces || []);

      const membersGroup = createSvgElement("g", { "aria-hidden": "true" });
      const nodesGroup = createSvgElement("g", { "aria-hidden": "true" });

      drawMembers(membersGroup, solvedModel.members || [], nodeMap, mapPoint, colors, forceLookup);
      drawNodes(nodesGroup, solvedModel.nodes || [], mapPoint, colors);

      svg.appendChild(membersGroup);
      svg.appendChild(nodesGroup);
      container.appendChild(svg);
      updateLegend();
    };

    if (options.skipFade) {
      drawFrame();
      return;
    }

    shell.style.opacity = "0.55";
    window.requestAnimationFrame(() => {
      drawFrame();
      window.requestAnimationFrame(() => {
        shell.style.opacity = "1";
      });
    });
  }

  window.addEventListener("truss-analysis:solved", (event) => {
    solvedResult = event.detail;
    solvedModel = getCurrentModel();
    solvedModelSignature = buildModelSignature(solvedModel);
    hoveredMemberId = null;
    hideTooltip();
    renderAnalysisVisualizer(event.detail);
  });

  window.addEventListener("truss-analysis:solveerror", () => {
    solvedResult = null;
    solvedModel = null;
    solvedModelSignature = null;
    hoveredMemberId = null;
    hideTooltip();
    panel.classList.add("hidden");
    clearVisualizer();
    updateLegend();
  });

  window.addEventListener("truss-analysis:statechange", () => {
    if (solvedResult) {
      const currentModel = getCurrentModel();
      const currentModelSignature = buildModelSignature(currentModel);

      if (currentModelSignature === solvedModelSignature) {
        return;
      }

      solvedResult = null;
      solvedModel = null;
      solvedModelSignature = null;
      hoveredMemberId = null;
      hideTooltip();
      panel.classList.add("hidden");
      clearVisualizer();
      updateLegend();
    }
  });
})();
