(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const container = document.querySelector("[data-truss-visualization]");
  const sceneShell = document.querySelector("#visualization-scene-shell");

  if (!container || !sceneShell) {
    return;
  }

  const VIEWBOX_WIDTH = 900;
  const VIEWBOX_HEIGHT = 460;
  const DRAWING_PADDING = 60;
  const NODE_RADIUS = 6;
  const NODE_HIT_TOLERANCE = 10;
  const MEMBER_HIT_TOLERANCE = 14;

  let selectedNodes = [];
  let selectedMemberId = null;
  let hoveredNode = null;
  let hoveredMember = null;
  let currentNodeTargets = [];
  let currentNodeVisuals = new Map();
  let currentMemberVisuals = new Map();
  let currentSceneContext = null;
  let currentDeleteButton = null;
  let currentState = getCurrentState();
  let currentGeometrySignature = "";
  let currentView = null;
  let viewAnimationFrame = null;

  if (!sceneShell.style.position) {
    sceneShell.style.position = "relative";
  }

  sceneShell.style.transition = "opacity 200ms ease";

  function getThemeColors() {
    const isDark = document.documentElement.classList.contains("dark");

    return {
      grid: isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.18)",
      member: isDark ? "#94A3B8" : "#64748B",
      memberHover: isDark ? "#CBD5E1" : "#334155",
      memberSelected: "#F59E0B",
      nodeFill: isDark ? "#FFFFFF" : "#0F172A",
      nodeStroke: isDark ? "#0F172A" : "#FFFFFF",
      nodeLabel: isDark ? "#CBD5E1" : "#475569",
      nodeHover: "#38BDF8",
      nodeSelected: "#22C55E",
      supportStroke: isDark ? "#CBD5E1" : "#64748B",
      supportFill: isDark ? "#0F172A" : "#FFFFFF",
      load: "#38BDF8",
      loadLabel: isDark ? "#BAE6FD" : "#0369A1",
      emptyText: "#94A3B8",
      hintText: isDark ? "#94A3B8" : "#64748B",
    };
  }

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });

    return element;
  }

  function clearVisualization() {
    container.innerHTML = "";
    currentNodeTargets = [];
    currentNodeVisuals = new Map();
    currentMemberVisuals = new Map();
    currentSceneContext = null;
    currentDeleteButton = null;
  }

  function getStore() {
    return window.trussAnalysisInputStore || null;
  }

  function getCurrentState() {
    const store = getStore();

    if (store && typeof store.getState === "function") {
      return store.getState();
    }

    return { nodes: [], members: [], supports: [], loads: [], memberLoads: [], inputMode: "advanced", loadMode: "joint" };
  }

  function notify(message, type = "info") {
    const store = getStore();

    if (store && typeof store.notify === "function") {
      store.notify(message, type);
    }
  }

  function syncInteractionState(state) {
    const nodeIds = new Set((state.nodes || []).map((node) => node.id));
    const memberIds = new Set((state.members || []).map((member) => member.id));
    const interactive = state.inputMode === "advanced";

    selectedNodes = interactive
      ? selectedNodes.filter((nodeId) => nodeIds.has(nodeId))
      : [];
    selectedMemberId = interactive && selectedMemberId && memberIds.has(selectedMemberId)
      ? selectedMemberId
      : null;
    hoveredNode = interactive && hoveredNode && nodeIds.has(hoveredNode) ? hoveredNode : null;
    hoveredMember = hoveredMember && memberIds.has(hoveredMember) ? hoveredMember : null;
  }

  function buildNodeMap(nodes) {
    return new Map(nodes.map((node) => [node.id, node]));
  }

  function buildMemberMap(members) {
    return new Map(members.map((member) => [member.id, member]));
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

  function normalizeBounds(bounds) {
    let { minX, maxX, minY, maxY } = bounds;

    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }

    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }

  function computeFitView(nodes) {
    const bounds = normalizeBounds(getBounds(nodes));
    const scaleX = (VIEWBOX_WIDTH - DRAWING_PADDING * 2) / bounds.width;
    const scaleY = (VIEWBOX_HEIGHT - DRAWING_PADDING * 2) / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    return {
      scale,
      fitScale: scale,
      offsetX: 0,
      offsetY: 0,
      centerX: bounds.centerX,
      centerY: bounds.centerY,
      bounds,
    };
  }

  function transformPoint(point, view = currentView) {
    const activeView = view || computeFitView(currentState.nodes || [{ x: 0, y: 0 }]);

    return {
      x: VIEWBOX_WIDTH / 2 + (Number(point.x) - activeView.centerX) * activeView.scale + activeView.offsetX,
      y: VIEWBOX_HEIGHT / 2 - (Number(point.y) - activeView.centerY) * activeView.scale + activeView.offsetY,
    };
  }

  function getGeometrySignature(state) {
    return JSON.stringify({
      nodes: (state.nodes || []).map((node) => ({
        id: node.id,
        x: Number(node.x),
        y: Number(node.y),
      })),
      members: (state.members || []).map((member) => ({
        id: member.id,
        start: member.start,
        end: member.end,
      })),
      inputMode: state.inputMode,
    });
  }

  function getVisualMetrics(view = currentView) {
    const activeView = view || currentView;
    const bounds = activeView.bounds;
    const baseSize = Math.min(bounds.width, bounds.height);
    const arrowLength = Math.max(12, Math.min(28, baseSize * activeView.scale * 0.08));
    const arrowWidth = arrowLength * 0.35;
    const supportSize = arrowLength * 0.9;
    const loadStrokeWidth = Math.max(2, Math.min(4, arrowWidth * 0.18));

    return {
      arrowLength,
      arrowWidth,
      supportSize,
      loadStrokeWidth,
    };
  }

  function createBaseSvg(colors) {
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
      class: "h-full w-full",
      role: "img",
      "aria-label": "Live truss visualization",
      preserveAspectRatio: "xMidYMid meet",
    });

    const defs = createSvgElement("defs");

    const gridPattern = createSvgElement("pattern", {
      id: "truss-grid",
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

    const arrowMarker = createSvgElement("marker", {
      id: "geometry-load-arrow",
      markerWidth: "10",
      markerHeight: "10",
      refX: "8",
      refY: "5",
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    arrowMarker.appendChild(
      createSvgElement("path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        fill: colors.load,
      })
    );

    defs.appendChild(gridPattern);
    defs.appendChild(arrowMarker);
    svg.appendChild(defs);

    svg.appendChild(
      createSvgElement("rect", {
        x: "0",
        y: "0",
        width: String(VIEWBOX_WIDTH),
        height: String(VIEWBOX_HEIGHT),
        fill: "url(#truss-grid)",
      })
    );

    return svg;
  }

  function drawHintText(svg, state, colors) {
    const hint = createSvgElement("text", {
      x: String(VIEWBOX_WIDTH / 2),
      y: String(VIEWBOX_HEIGHT - 20),
      "text-anchor": "middle",
      fill: colors.hintText,
      "font-size": "13",
      "font-weight": "600",
    });

    hint.textContent =
      state.inputMode === "advanced"
        ? "Advanced Mode: click two nodes to create a member. Right-click a member to delete it."
        : "Quick Builder Mode previews the generated truss layout.";
    svg.appendChild(hint);
  }

  function drawEmptyState(state) {
    clearVisualization();

    const colors = getThemeColors();
    const svg = createBaseSvg(colors);
    const text = createSvgElement("text", {
      x: String(VIEWBOX_WIDTH / 2),
      y: String(VIEWBOX_HEIGHT / 2 - 10),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: colors.emptyText,
      "font-size": "18",
      "font-weight": "600",
    });
    text.textContent = "Add nodes to visualize the truss";
    svg.appendChild(text);
    drawHintText(svg, state, colors);
    container.appendChild(svg);
  }

  function getMemberStyle(memberId, colors) {
    let stroke = colors.member;
    let strokeWidth = 3;

    if (hoveredMember === memberId) {
      stroke = colors.memberHover;
      strokeWidth += 1;
    }

    if (selectedMemberId === memberId) {
      stroke = colors.memberSelected;
      strokeWidth += 1.5;
    }

    return {
      stroke,
      strokeWidth,
    };
  }

  function getNodeStyle(nodeId, colors) {
    if (selectedNodes.includes(nodeId)) {
      return {
        fill: colors.nodeSelected,
        stroke: "#ECFDF5",
        radius: 7,
        glow: true,
      };
    }

    if (hoveredNode === nodeId) {
      return {
        fill: colors.nodeHover,
        stroke: colors.nodeStroke,
        radius: 6.5,
        glow: true,
      };
    }

    return {
      fill: colors.nodeFill,
      stroke: colors.nodeStroke,
      radius: 5.5,
      glow: false,
    };
  }

  function removeDeleteButton() {
    if (currentDeleteButton && currentDeleteButton.parentNode) {
      currentDeleteButton.parentNode.removeChild(currentDeleteButton);
    }

    currentDeleteButton = null;
  }

  function updateDeleteButton() {
    removeDeleteButton();

    if (!currentSceneContext || currentSceneContext.state.inputMode !== "advanced" || !selectedMemberId) {
      return;
    }

    const member = (currentSceneContext.state.members || []).find((item) => item.id === selectedMemberId);

    if (!member) {
      return;
    }

    const startNode = currentSceneContext.nodeMap.get(member.start);
    const endNode = currentSceneContext.nodeMap.get(member.end);

    if (!startNode || !endNode) {
      return;
    }

    const start = currentSceneContext.mapPoint(startNode);
    const end = currentSceneContext.mapPoint(endNode);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const btnWidth = 72;
    const btnHeight = 26;
    const btnX = midX - btnWidth / 2;
    const btnY = midY - btnHeight - 12;

    const btnGroup = createSvgElement("g", { style: "cursor: pointer;" });

    btnGroup.appendChild(
      createSvgElement("rect", {
        x: btnX,
        y: btnY,
        width: btnWidth,
        height: btnHeight,
        rx: "6",
        fill: "#EF4444",
        opacity: "0.92",
      })
    );

    const label = createSvgElement("text", {
      x: midX,
      y: btnY + btnHeight / 2 + 1,
      fill: "#FFFFFF",
      "font-size": "12",
      "font-weight": "700",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "pointer-events": "none",
    });
    label.textContent = "\u2715 Delete";
    btnGroup.appendChild(label);

    btnGroup.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedMember(selectedMemberId);
    });

    btnGroup.addEventListener("mouseenter", () => {
      btnGroup.querySelector("rect").setAttribute("opacity", "1");
    });

    btnGroup.addEventListener("mouseleave", () => {
      btnGroup.querySelector("rect").setAttribute("opacity", "0.92");
    });

    currentSceneContext.svg.appendChild(btnGroup);
    currentDeleteButton = btnGroup;
  }

  function refreshInteractiveStyles() {
    if (!currentSceneContext) {
      return;
    }

    currentNodeVisuals.forEach((visuals, nodeId) => {
      const style = getNodeStyle(nodeId, currentSceneContext.colors);

      visuals.glow.setAttribute("fill", style.fill);
      visuals.glow.setAttribute("r", String(style.radius + 5));
      visuals.glow.setAttribute("opacity", style.glow ? "0.18" : "0");
      visuals.circle.setAttribute("fill", style.fill);
      visuals.circle.setAttribute("stroke", style.stroke);
      visuals.circle.setAttribute("r", String(style.radius));
    });

    currentMemberVisuals.forEach((visuals, memberId) => {
      const style = getMemberStyle(memberId, currentSceneContext.colors);

      visuals.line.setAttribute("stroke", style.stroke);
      visuals.line.setAttribute("stroke-width", String(style.strokeWidth));
    });

    updateDeleteButton();
  }

  function updateNodeSelection(nodeId) {
    const currentState = getCurrentState();
    const validNodeIds = new Set((currentState.nodes || []).map((node) => node.id));
    const members = currentState.members || [];

    selectedNodes = selectedNodes.filter((selectedId) => validNodeIds.has(selectedId));

    if (selectedNodes.includes(nodeId)) {
      selectedNodes = selectedNodes.filter((selectedId) => selectedId !== nodeId);
      console.log("Selected nodes:", [...selectedNodes]);
      refreshInteractiveStyles();
      return;
    }

    if (selectedNodes.length < 2) {
      selectedNodes = [...selectedNodes, nodeId];
    }

    console.log("Selected nodes:", [...selectedNodes]);

    if (selectedNodes.length < 2) {
      refreshInteractiveStyles();
      return;
    }

    console.log("Before member creation:", [...selectedNodes]);

    const [startNodeId, endNodeId] = selectedNodes;

    if (startNodeId === endNodeId) {
      selectedNodes = [];
      refreshInteractiveStyles();
      return;
    }

    const existingMember = members.some((member) => {
      const sameDirection = member.start === startNodeId && member.end === endNodeId;
      const oppositeDirection = member.start === endNodeId && member.end === startNodeId;

      return sameDirection || oppositeDirection;
    });

    if (existingMember) {
      refreshInteractiveStyles();
      return;
    }

    const store = getStore();
    const result =
      store && typeof store.createMember === "function"
        ? store.createMember(startNodeId, endNodeId)
        : { success: false, error: "Member editing is unavailable right now." };

    selectedNodes = [];

    if (!result.success && result.error) {
      notify(result.error, "error");
      refreshInteractiveStyles();
      return;
    }

    console.log("Member created:", startNodeId, endNodeId);
    console.log("Members:", (getCurrentState().members || []).map((member) => ({ ...member })));
    selectedMemberId = null;
    refreshInteractiveStyles();
  }

  function deleteSelectedMember(memberId) {
    const store = getStore();
    const result =
      store && typeof store.deleteMember === "function"
        ? store.deleteMember(memberId)
        : { success: false, error: "Member deletion is unavailable right now." };

    if (!result.success && result.error) {
      notify(result.error, "error");
      return;
    }

    selectedMemberId = null;
    hoveredMember = null;
    console.log("Members:", (getCurrentState().members || []).map((member) => ({ ...member })));
    refreshInteractiveStyles();
  }

  function addMemberHandlers(element, memberId, state) {
    if (state.inputMode !== "advanced") {
      return;
    }

    element.style.cursor = "pointer";

    element.addEventListener("mouseenter", () => {
      hoveredMember = memberId;
      refreshInteractiveStyles();
    });

    element.addEventListener("mouseleave", () => {
      if (hoveredMember === memberId) {
        hoveredMember = null;
        refreshInteractiveStyles();
      }
    });

    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedMemberId = selectedMemberId === memberId ? null : memberId;
      selectedNodes = [];
      refreshInteractiveStyles();
    });

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedMemberId = memberId;
      deleteSelectedMember(memberId);
    });
  }

  function addNodeHandlers(element, nodeId, state) {
    if (state.inputMode !== "advanced") {
      return;
    }

    element.style.cursor = "pointer";

    element.addEventListener("mouseenter", () => {
      hoveredNode = nodeId;
      refreshInteractiveStyles();
    });

    element.addEventListener("mouseleave", () => {
      if (hoveredNode === nodeId) {
        hoveredNode = null;
        refreshInteractiveStyles();
      }
    });

    element.dataset.nodeId = nodeId;
  }

  function getSvgPointerPosition(svg, event) {
    const bounds = svg.getBoundingClientRect();
    const viewBox = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    const viewBoxWidth = viewBox && viewBox.width ? viewBox.width : VIEWBOX_WIDTH;
    const viewBoxHeight = viewBox && viewBox.height ? viewBox.height : VIEWBOX_HEIGHT;
    const scaleX = viewBoxWidth / bounds.width;
    const scaleY = viewBoxHeight / bounds.height;

    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
    };
  }

  function findNodeTargetAtPosition(position) {
    let nearestTarget = null;
    let nearestDistance = Infinity;
    const hitThreshold = NODE_RADIUS + NODE_HIT_TOLERANCE;

    currentNodeTargets.forEach((target) => {
      const distance = Math.hypot(position.x - target.x, position.y - target.y);
      console.log("Checking node:", target.id, target.x, target.y);

      if (distance <= hitThreshold && distance < nearestDistance) {
        nearestTarget = target;
        nearestDistance = distance;
      }
    });

    return nearestTarget;
  }

  function drawFrame(state) {
    clearVisualization();

    const colors = getThemeColors();
    const svg = createBaseSvg(colors);
    const nodeMap = buildNodeMap(state.nodes);
    const memberMap = buildMemberMap(state.members || []);
    const activeView = currentView || computeFitView(state.nodes);
    const mapPoint = (point) => transformPoint(point, activeView);

    const membersGroup = createSvgElement("g", { "aria-hidden": "true" });
    const supportsGroup = createSvgElement("g", { "aria-hidden": "true" });
    const loadsGroup = createSvgElement("g", { "aria-hidden": "true" });
    const memberLoadsGroup = createSvgElement("g", { "aria-hidden": "true" });
    const nodesGroup = createSvgElement("g", { "aria-hidden": "true" });
    const showSupports = state.inputMode !== "quick";

    drawMembers(membersGroup, state.members || [], nodeMap, mapPoint, colors, state);
    if (showSupports) {
      drawSupports(supportsGroup, state.supports || [], nodeMap, mapPoint, colors, activeView);
    }
    drawLoads(loadsGroup, state.loads || [], nodeMap, mapPoint, colors, activeView);
    drawMemberLoads(memberLoadsGroup, state.memberLoads || [], memberMap, nodeMap, mapPoint, colors, activeView);
    drawNodes(nodesGroup, state.nodes, mapPoint, colors, state);

    svg.appendChild(membersGroup);
    svg.appendChild(supportsGroup);
    svg.appendChild(loadsGroup);
    svg.appendChild(memberLoadsGroup);
    svg.appendChild(nodesGroup);
    drawHintText(svg, state, colors);
    attachSceneInteraction(svg, state);

    container.appendChild(svg);
    currentSceneContext = {
      svg,
      state,
      nodeMap,
      mapPoint,
      colors,
      view: activeView,
    };
    refreshInteractiveStyles();
  }

  function animateViewTo(targetView, duration = 360) {
    if (!currentState || !currentState.nodes || currentState.nodes.length === 0) {
      currentView = targetView;
      return;
    }

    if (viewAnimationFrame) {
      window.cancelAnimationFrame(viewAnimationFrame);
    }

    if (!currentView) {
      currentView = targetView;
      drawFrame(currentState);
      return;
    }

    const startView = { ...currentView };
    const startTime = performance.now();

    const step = (timestamp) => {
      const progress = Math.min(1, (timestamp - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      currentView = {
        ...targetView,
        scale: startView.scale + (targetView.scale - startView.scale) * eased,
        fitScale: startView.fitScale + (targetView.fitScale - startView.fitScale) * eased,
        offsetX: startView.offsetX + (targetView.offsetX - startView.offsetX) * eased,
        offsetY: startView.offsetY + (targetView.offsetY - startView.offsetY) * eased,
        centerX: startView.centerX + (targetView.centerX - startView.centerX) * eased,
        centerY: startView.centerY + (targetView.centerY - startView.centerY) * eased,
      };

      drawFrame(currentState);

      if (progress < 1) {
        viewAnimationFrame = window.requestAnimationFrame(step);
      } else {
        currentView = targetView;
        viewAnimationFrame = null;
        drawFrame(currentState);
      }
    };

    viewAnimationFrame = window.requestAnimationFrame(step);
  }

  function fitCurrentView(animate = true) {
    if (!currentState || !Array.isArray(currentState.nodes) || currentState.nodes.length === 0) {
      return;
    }

    const targetView = computeFitView(currentState.nodes);

    if (!animate) {
      if (viewAnimationFrame) {
        window.cancelAnimationFrame(viewAnimationFrame);
        viewAnimationFrame = null;
      }
      currentView = targetView;
      drawFrame(currentState);
      return;
    }

    animateViewTo(targetView);
  }

  function attachSceneInteraction(svg, state) {
    svg.addEventListener("click", (event) => {
      if (state.inputMode !== "advanced") {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const pointerPosition = getSvgPointerPosition(svg, event);
      console.log("Click at:", pointerPosition.x, pointerPosition.y);
      const hitNodeTarget = findNodeTargetAtPosition(pointerPosition);

      if (!hitNodeTarget) {
        if (selectedMemberId) {
          selectedMemberId = null;
          refreshInteractiveStyles();
        }
        return;
      }

      event.preventDefault();
      console.log("node clicked", hitNodeTarget.id);
      selectedMemberId = null;
      updateNodeSelection(hitNodeTarget.id);
    });
  }

  function drawMembers(group, members, nodeMap, mapPoint, colors, state) {
    members.forEach((member) => {
      const startNode = nodeMap.get(member.start);
      const endNode = nodeMap.get(member.end);

      if (!startNode || !endNode) {
        return;
      }

      const start = mapPoint(startNode);
      const end = mapPoint(endNode);
      const style = getMemberStyle(member.id, colors);

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

      addMemberHandlers(hitLine, member.id, state);
      group.appendChild(line);
      group.appendChild(hitLine);
      currentMemberVisuals.set(member.id, { line, hit: hitLine });
    });
  }

  function drawSupports(group, supports, nodeMap, mapPoint, colors, view) {
    const metrics = getVisualMetrics(view);
    const supportSize = metrics.supportSize;
    const wheelRadius = supportSize * 0.14;

    supports.forEach((support) => {
      const node = nodeMap.get(support.node);

      if (!node) {
        return;
      }

      const point = mapPoint(node);
      const triangleTopY = point.y + supportSize * 0.28;
      const triangleBaseY = point.y + supportSize;
      const rollerDirection = String(support.direction || "y").toLowerCase();

      if (support.type === "pinned") {
        group.appendChild(
          createSvgElement("path", {
            d: `M ${point.x - supportSize * 0.55} ${triangleBaseY} L ${point.x} ${triangleTopY} L ${point.x + supportSize * 0.55} ${triangleBaseY} Z`,
            fill: colors.supportFill,
            stroke: colors.supportStroke,
            "stroke-width": String(Math.max(1.5, metrics.loadStrokeWidth * 0.8)),
            opacity: "0.95",
          })
        );
      }

      if (support.type === "roller") {
        if (rollerDirection === "x") {
          const triangleTipX = point.x - supportSize * 0.28;
          const triangleBaseX = point.x - supportSize;
          group.appendChild(
            createSvgElement("path", {
              d: `M ${triangleBaseX} ${point.y - supportSize * 0.55} L ${triangleTipX} ${point.y} L ${triangleBaseX} ${point.y + supportSize * 0.55} Z`,
              fill: colors.supportFill,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1.5, metrics.loadStrokeWidth * 0.8)),
              opacity: "0.95",
            })
          );
          group.appendChild(
            createSvgElement("circle", {
              cx: triangleBaseX - supportSize * 0.18,
              cy: point.y - supportSize * 0.22,
              r: String(wheelRadius),
              fill: colors.supportFill,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1.2, metrics.loadStrokeWidth * 0.7)),
            })
          );
          group.appendChild(
            createSvgElement("circle", {
              cx: triangleBaseX - supportSize * 0.18,
              cy: point.y + supportSize * 0.22,
              r: String(wheelRadius),
              fill: colors.supportFill,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1.2, metrics.loadStrokeWidth * 0.7)),
            })
          );
        } else {
          group.appendChild(
            createSvgElement("path", {
              d: `M ${point.x - supportSize * 0.55} ${triangleBaseY - supportSize * 0.22} L ${point.x} ${triangleTopY} L ${point.x + supportSize * 0.55} ${triangleBaseY - supportSize * 0.22} Z`,
              fill: colors.supportFill,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1.5, metrics.loadStrokeWidth * 0.8)),
              opacity: "0.95",
            })
          );
          group.appendChild(
            createSvgElement("circle", {
              cx: point.x - supportSize * 0.22,
              cy: triangleBaseY + supportSize * 0.18,
              r: String(wheelRadius),
              fill: colors.supportFill,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1.2, metrics.loadStrokeWidth * 0.7)),
            })
          );
          group.appendChild(
            createSvgElement("circle", {
              cx: point.x + supportSize * 0.22,
              cy: triangleBaseY + supportSize * 0.18,
              r: String(wheelRadius),
              fill: colors.supportFill,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1.2, metrics.loadStrokeWidth * 0.7)),
            })
          );
        }
      }

      if (support.type === "fixed") {
        group.appendChild(
          createSvgElement("rect", {
            x: point.x - supportSize * 0.55,
            y: point.y + supportSize * 0.18,
            width: String(supportSize * 1.1),
            height: String(supportSize * 0.5),
            rx: String(supportSize * 0.12),
            fill: colors.supportFill,
            stroke: colors.supportStroke,
            "stroke-width": String(Math.max(1.5, metrics.loadStrokeWidth * 0.8)),
            opacity: "0.95",
          })
        );
        for (let index = 0; index < 4; index += 1) {
          group.appendChild(
            createSvgElement("line", {
              x1: point.x - supportSize * 0.4 + index * (supportSize * 0.24),
              y1: point.y + supportSize * 0.78,
              x2: point.x - supportSize * 0.56 + index * (supportSize * 0.24),
              y2: point.y + supportSize * 1.05,
              stroke: colors.supportStroke,
              "stroke-width": String(Math.max(1, metrics.loadStrokeWidth * 0.6)),
            })
          );
        }
      }
    });
  }

  function drawArrow(group, x1, y1, x2, y2, colors, metrics) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);

    if (length === 0) {
      return;
    }

    const ux = dx / length;
    const uy = dy / length;
    const headLength = metrics.arrowWidth;
    const baseX = x2 - ux * headLength;
    const baseY = y2 - uy * headLength;
    const px = -uy;
    const py = ux;

    group.appendChild(
      createSvgElement("line", {
        x1,
        y1,
        x2: baseX,
        y2: baseY,
        stroke: colors.load,
        "stroke-width": String(metrics.loadStrokeWidth),
        "stroke-linecap": "round",
      })
    );
    group.appendChild(
      createSvgElement("path", {
        d: `M ${x2} ${y2} L ${baseX + px * headLength * 0.55} ${baseY + py * headLength * 0.55} L ${baseX - px * headLength * 0.55} ${baseY - py * headLength * 0.55} Z`,
        fill: colors.load,
      })
    );
  }

  function createLoadLabel(group, x, y, text, colors, anchor = "middle") {
    const label = createSvgElement("text", {
      x,
      y,
      fill: colors.loadLabel,
      "font-size": "12",
      "font-weight": "700",
      "text-anchor": anchor,
      "dominant-baseline": "middle",
    });
    label.textContent = text;
    group.appendChild(label);
  }

  function formatLoadLabel(forceValue) {
    const forceKilonewtons = Math.abs(forceValue) / 1000;
    const decimals = forceKilonewtons >= 10 ? 1 : 2;
    return `${forceKilonewtons.toFixed(decimals)} kN`;
  }

  function drawLoads(group, loads, nodeMap, mapPoint, colors, view) {
    const metrics = getVisualMetrics(view);
    const loadOffsetsByNode = new Map();

    loads.forEach((load) => {
      const node = nodeMap.get(load.node);

      if (!node) {
        return;
      }

      const point = mapPoint(node);
      const fx = Number(load.fx);
      const fy = Number(load.fy);
      const nodeOffsetIndex = loadOffsetsByNode.get(load.node) || 0;
      const baseOffset = nodeOffsetIndex * (metrics.arrowLength * 0.4);

      if (Number.isFinite(fx) && fx !== 0) {
        const direction = fx > 0 ? 1 : -1;
        const arrowStartX = point.x + direction * (metrics.arrowLength * 0.55 + baseOffset);
        const arrowEndX = point.x + direction * (metrics.arrowLength * 1.45 + baseOffset);
        const arrowY = point.y - metrics.arrowLength * 0.45;

        drawArrow(group, arrowStartX, arrowY, arrowEndX, arrowY, colors, metrics);
        createLoadLabel(
          group,
          point.x + direction * (metrics.arrowLength * 1.7 + baseOffset),
          arrowY - metrics.arrowLength * 0.25,
          formatLoadLabel(fx),
          colors,
          direction > 0 ? "start" : "end"
        );
      }

      if (Number.isFinite(fy) && fy !== 0) {
        const direction = fy > 0 ? -1 : 1;
        const arrowStartY = point.y + direction * (metrics.arrowLength * 0.55 + baseOffset);
        const arrowEndY = point.y + direction * (metrics.arrowLength * 1.45 + baseOffset);
        const arrowX = point.x + metrics.arrowLength * 0.45;

        drawArrow(group, arrowX, arrowStartY, arrowX, arrowEndY, colors, metrics);
        createLoadLabel(
          group,
          arrowX + metrics.arrowLength * 0.45,
          point.y + direction * (metrics.arrowLength * 1.7 + baseOffset),
          formatLoadLabel(fy),
          colors,
          "start"
        );
      }

      if ((Number.isFinite(fx) && fx !== 0) || (Number.isFinite(fy) && fy !== 0)) {
        loadOffsetsByNode.set(load.node, nodeOffsetIndex + 1);
      }
    });
  }

  function drawMemberLoads(group, memberLoads, memberMap, nodeMap, mapPoint, colors, view) {
    const metrics = getVisualMetrics(view);
    memberLoads.forEach((memberLoad) => {
      const member = memberMap.get(memberLoad.memberId);

      if (!member) {
        return;
      }

      const startNode = nodeMap.get(member.start);
      const endNode = nodeMap.get(member.end);

      if (!startNode || !endNode) {
        return;
      }

      const referenceNodeId = String(memberLoad.referenceNode || "").toUpperCase();
      const referenceNode = referenceNodeId === member.start ? startNode : referenceNodeId === member.end ? endNode : null;
      const farNode = referenceNodeId === member.start ? endNode : referenceNodeId === member.end ? startNode : null;

      if (!referenceNode || !farNode) {
        return;
      }

      const memberLength = Math.hypot(endNode.x - startNode.x, endNode.y - startNode.y);
      const rawDistance = Number(memberLoad.distance);
      const fx = Number(memberLoad.fx);
      const fy = Number(memberLoad.fy);

      if (!Number.isFinite(memberLength) || memberLength <= 0 || !Number.isFinite(rawDistance)) {
        return;
      }

      const distance = Math.min(Math.max(rawDistance, 0), memberLength);
      const ratio = distance / memberLength;
      const loadPosition = {
        x: referenceNode.x + (farNode.x - referenceNode.x) * ratio,
        y: referenceNode.y + (farNode.y - referenceNode.y) * ratio,
      };
      const point = mapPoint(loadPosition);

      if (Number.isFinite(fx) && fx !== 0) {
        const direction = fx > 0 ? 1 : -1;
        const arrowStartX = point.x + direction * metrics.arrowLength * 0.45;
        const arrowEndX = point.x + direction * metrics.arrowLength * 1.35;
        const arrowY = point.y - metrics.arrowLength * 0.45;

        drawArrow(group, arrowStartX, arrowY, arrowEndX, arrowY, colors, metrics);
        createLoadLabel(
          group,
          point.x + direction * metrics.arrowLength * 1.6,
          arrowY - metrics.arrowLength * 0.25,
          formatLoadLabel(fx * 1000),
          colors,
          direction > 0 ? "start" : "end"
        );
      }

      if (Number.isFinite(fy) && fy !== 0) {
        const direction = fy > 0 ? -1 : 1;
        const arrowStartY = point.y + direction * metrics.arrowLength * 0.45;
        const arrowEndY = point.y + direction * metrics.arrowLength * 1.35;
        const arrowX = point.x + metrics.arrowLength * 0.45;

        drawArrow(group, arrowX, arrowStartY, arrowX, arrowEndY, colors, metrics);
        createLoadLabel(
          group,
          arrowX + metrics.arrowLength * 0.45,
          point.y + direction * metrics.arrowLength * 1.6,
          formatLoadLabel(fy * 1000),
          colors,
          "start"
        );
      }
    });
  }

  function drawNodes(group, nodes, mapPoint, colors, state) {
    nodes.forEach((node) => {
      const point = mapPoint(node);
      const style = getNodeStyle(node.id, colors);

      currentNodeTargets.push({
        id: node.id,
        x: point.x,
        y: point.y,
      });

      const glowCircle = createSvgElement("circle", {
        cx: point.x,
        cy: point.y,
        r: String(style.radius + 5),
        fill: style.fill,
        opacity: style.glow ? "0.18" : "0",
      });
      group.appendChild(glowCircle);

      const nodeCircle = createSvgElement("circle", {
        cx: point.x,
        cy: point.y,
        r: String(style.radius),
        fill: style.fill,
        stroke: style.stroke,
        "stroke-width": "2.5",
      });
      group.appendChild(nodeCircle);

      const hitCircle = createSvgElement("circle", {
        cx: point.x,
        cy: point.y,
        r: String(NODE_RADIUS + NODE_HIT_TOLERANCE),
        fill: "transparent",
        "pointer-events": "all",
      });

      addNodeHandlers(hitCircle, node.id, state);
      group.appendChild(hitCircle);
      currentNodeVisuals.set(node.id, { glow: glowCircle, circle: nodeCircle, hit: hitCircle });

      const label = createSvgElement("text", {
        x: point.x + 10,
        y: point.y - 10,
        fill: colors.nodeLabel,
        "font-size": "12",
        "font-weight": "700",
        "pointer-events": "none",
      });
      label.textContent = node.id;
      group.appendChild(label);
    });
  }

  function renderTruss(state, options = {}) {
    currentState = state;
    syncInteractionState(state);

    if (!state || !Array.isArray(state.nodes) || state.nodes.length === 0) {
      drawEmptyState(state || { inputMode: "advanced" });
      return;
    }

    const geometrySignature = getGeometrySignature(state);
    const shouldFit =
      !currentView || options.forceFit || (!options.preserveView && geometrySignature !== currentGeometrySignature);

    currentGeometrySignature = geometrySignature;

    if (shouldFit) {
      const targetView = computeFitView(state.nodes);

      if (options.skipFade || options.skipAnimation) {
        currentView = targetView;
        drawFrame(state);
      } else {
        animateViewTo(targetView);
      }
      return;
    }

    if (options.skipFade) {
      drawFrame(state);
      return;
    }

    sceneShell.style.opacity = "0.55";
    window.requestAnimationFrame(() => {
      drawFrame(state);
      window.requestAnimationFrame(() => {
        sceneShell.style.opacity = "1";
      });
    });
  }

  window.addEventListener("truss-analysis:statechange", (event) => {
    renderTruss(event.detail, { skipFade: true });
  });

  renderTruss(getCurrentState(), { skipFade: true });
})();
