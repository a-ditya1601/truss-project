(function () {
  const controlsRoot = document.querySelector("[data-analysis-controls]");

  if (!controlsRoot) {
    return;
  }

  const state = {
    nodes: [],
    members: [],
    supports: [],
    loads: [],
    memberLoads: [],
    memberLoadDraft: {
      memberId: "",
      referenceNode: "",
      distance: 0,
      fx: 0,
      fy: 0,
    },
    loadMode: "joint",
    inputMode: "advanced",
    quickBuilder: {
      spanLength: 24,
      panelCount: 6,
      height: 4,
      trussType: "pratt",
    },
    materialMode: "global",
    globalMaterial: {
      E: null,
      A: null,
    },
    nextNodeNumber: 1,
    nextMemberNumber: 1,
    nextSupportNumber: 1,
    nextLoadNumber: 1,
    nextMemberLoadNumber: 1,
  };

  const elements = {
    addNodeButton: controlsRoot.querySelector("#add-node-button"),
    addSupportButton: controlsRoot.querySelector("#add-support-button"),
    addLoadButton: controlsRoot.querySelector("#add-load-button"),
    saveInputButton: controlsRoot.querySelector("#save-input-button"),
    loadInputButton: controlsRoot.querySelector("#load-input-button"),
    loadInputFile: controlsRoot.querySelector("#load-input-file"),
    solveButton: controlsRoot.querySelector("#solve-button"),
    nodesTableBody: controlsRoot.querySelector("#nodes-table-body"),
    membersTableHead: controlsRoot.querySelector("#members-table-head"),
    membersTableBody: controlsRoot.querySelector("#members-table-body"),
    connectivitySummaryToggle: controlsRoot.querySelector("#connectivity-summary-toggle"),
    connectivitySummaryContent: controlsRoot.querySelector("#connectivity-summary-content"),
    connectivitySummaryChevron: controlsRoot.querySelector("#connectivity-summary-chevron"),
    connectivitySummaryCount: controlsRoot.querySelector("#connectivity-summary-count"),
    supportsTableBody: controlsRoot.querySelector("#supports-table-body"),
    loadsTableBody: controlsRoot.querySelector("#loads-table-body"),
    loadModeButtons: controlsRoot.querySelectorAll("[data-load-mode]"),
    jointLoadsPanel: controlsRoot.querySelector("#joint-loads-panel"),
    memberLoadsPanel: controlsRoot.querySelector("#member-loads-panel"),
    memberLoadMember: controlsRoot.querySelector("#member-load-member"),
    memberLoadReference: controlsRoot.querySelector("#member-load-reference"),
    memberLoadDistance: controlsRoot.querySelector("#member-load-distance"),
    memberLoadFx: controlsRoot.querySelector("#member-load-fx"),
    memberLoadFy: controlsRoot.querySelector("#member-load-fy"),
    memberLoadLengthNote: controlsRoot.querySelector("#member-load-length-note"),
    convertMemberLoadButton: controlsRoot.querySelector("#convert-member-load-button"),
    nodesCount: controlsRoot.querySelector("#nodes-count"),
    membersCount: controlsRoot.querySelector("#members-count"),
    inputErrorsPanel: controlsRoot.querySelector("#input-errors-panel"),
    inputErrorsList: controlsRoot.querySelector("#input-errors-list"),
    geometryModeButtons: controlsRoot.querySelectorAll("[data-geometry-mode]"),
    quickBuilderPanel: controlsRoot.querySelector("#quick-builder-panel"),
    advancedGeometryPanel: controlsRoot.querySelector("#advanced-geometry-panel"),
    quickSpanLength: controlsRoot.querySelector("#quick-span-length"),
    quickPanelCount: controlsRoot.querySelector("#quick-panel-count"),
    quickHeight: controlsRoot.querySelector("#quick-height"),
    quickTrussType: controlsRoot.querySelector("#quick-truss-type"),
    notificationTargets: controlsRoot.querySelectorAll("[data-controls-notification]"),
    materialModeInputs: controlsRoot.querySelectorAll("input[name='material-mode']"),
    globalMaterialPanel: controlsRoot.querySelector("#global-material-panel"),
    perMemberMaterialPanel: controlsRoot.querySelector("#per-member-material-panel"),
    perMemberMaterialTableBody: controlsRoot.querySelector("#per-member-material-table-body"),
    globalMaterialE: controlsRoot.querySelector("#global-material-e"),
    globalMaterialA: controlsRoot.querySelector("#global-material-a"),
    materialModeTitle: controlsRoot.querySelector("#material-mode-title"),
    materialModeDescription: controlsRoot.querySelector("#material-mode-description"),
  };

  let notificationTimerId = null;
  let isSolving = false;
  let memberValidationErrors = [];
  let invalidMemberRowIds = new Set();
  let isConnectivityExpanded = false;

  function createButtonLabel(label, includeSpinner = false) {
    if (!includeSpinner) {
      return label;
    }

    return `<span class="ui-spinner" aria-hidden="true"></span><span>${label}</span>`;
  }

  function getSnapshot() {
    return {
      nodes: state.nodes.map((node) => ({ ...node })),
      members: state.members.map((member) => ({ ...member })),
      supports: state.supports.map((support) => ({ ...support })),
      loads: state.loads.map((load) => ({ ...load })),
      memberLoads: state.memberLoads.map((memberLoad) => ({
        ...memberLoad,
      })),
      memberLoadDraft: { ...state.memberLoadDraft },
      loadMode: state.loadMode,
      inputMode: state.inputMode,
      quickBuilder: { ...state.quickBuilder },
      materialMode: state.materialMode,
      globalMaterial: { ...state.globalMaterial },
    };
  }

  function sanitizeNodeReference(value) {
    return String(value ?? "")
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function nodeExistsById(nodeId) {
    return state.nodes.some((node) => node.id === nodeId);
  }

  function getNodeById(nodeId) {
    return state.nodes.find((node) => node.id === sanitizeNodeReference(nodeId)) || null;
  }

  function getMemberById(memberId) {
    return state.members.find((member) => member.id === memberId) || null;
  }

  function getMemberLength(member) {
    if (!member) {
      return 0;
    }

    const startNode = getNodeById(member.start);
    const endNode = getNodeById(member.end);

    if (!startNode || !endNode) {
      return 0;
    }

    return Math.hypot(endNode.x - startNode.x, endNode.y - startNode.y);
  }

  function getMemberValidity(member, excludeId = null) {
    const start = sanitizeNodeReference(member.start);
    const end = sanitizeNodeReference(member.end);
    const startExists = nodeExistsById(start);
    const endExists = nodeExistsById(end);
    const sameNode = start !== "" && end !== "" && start === end;
    const duplicate = startExists && endExists && !sameNode && memberExists(start, end, excludeId);

    return {
      start,
      end,
      startExists,
      endExists,
      sameNode,
      duplicate,
      isSolverEligible: startExists && endExists && !sameNode && !duplicate,
    };
  }

  function collectMemberValidationErrors(members = state.members) {
    const duplicateBuckets = new Map();
    const invalidRowIds = new Set();
    const errors = [];

    members.forEach((member) => {
      const validity = getMemberValidity(member, member.id);
      const pairKey = [validity.start, validity.end].sort().join("::");

      if (validity.start === "" || validity.end === "") {
        invalidRowIds.add(member.id);
        errors.push(`${member.id} has invalid node ID`);
      }

      if (!validity.startExists || !validity.endExists) {
        const invalidNodes = [validity.start, validity.end]
          .filter((nodeId) => nodeId !== "" && !nodeExistsById(nodeId));

        if (invalidNodes.length > 0) {
          invalidRowIds.add(member.id);
          errors.push(`${member.id} has invalid node ${invalidNodes.join(", ")}`);
        }
      }

      if (validity.sameNode) {
        invalidRowIds.add(member.id);
        errors.push(`${member.id} has same start and end node`);
      }

      if (validity.startExists && validity.endExists && !validity.sameNode) {
        if (!duplicateBuckets.has(pairKey)) {
          duplicateBuckets.set(pairKey, []);
        }

        duplicateBuckets.get(pairKey).push(member.id);
      }
    });

    duplicateBuckets.forEach((memberIds, pairKey) => {
      if (memberIds.length < 2) {
        return;
      }

      const [firstId, ...duplicateIds] = memberIds;
      const [startNode, endNode] = pairKey.split("::");

      duplicateIds.forEach((memberId) => {
        invalidRowIds.add(firstId);
        invalidRowIds.add(memberId);
        errors.push(`${firstId} duplicates ${memberId} (${startNode}-${endNode})`);
      });
    });

    return {
      errors,
      invalidRowIds,
    };
  }

  function getSupportValidity(support, excludeId = null) {
    const nodeId = sanitizeNodeReference(support.node);
    const nodeExists = nodeExistsById(nodeId);
    const validType = ["pinned", "roller", "fixed"].includes(support.type);
    const duplicate = nodeExists && supportExists(nodeId, excludeId);

    return {
      nodeId,
      nodeExists,
      validType,
      duplicate,
      isSolverEligible: nodeExists && validType && !duplicate,
    };
  }

  function getLoadValidity(load) {
    const nodeId = sanitizeNodeReference(load.node);
    const nodeExists = nodeExistsById(nodeId);
    const validForces = Number.isFinite(Number(load.fx)) && Number.isFinite(Number(load.fy));

    return {
      nodeId,
      nodeExists,
      validForces,
      isSolverEligible: nodeExists && validForces,
    };
  }

  function getNodeInputClasses(isValid) {
    return [
      "ui-input",
      !isValid
        ? "border-red-500 text-red-100 focus:border-red-500 focus:ring-red-500/70 dark:border-red-500/80 dark:focus:border-red-500 dark:focus:ring-red-500/70"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function createDownload(filename, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showNotification(message, type = "error") {
    if (elements.notificationTargets.length === 0) {
      return;
    }

    const variants = {
      error: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
      info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
    };

    elements.notificationTargets.forEach((target) => {
      target.className = `mt-6 rounded-2xl border px-4 py-3 text-sm font-medium ${variants[type] || variants.error}`;
      target.textContent = message;
      target.classList.remove("hidden");
    });

    window.clearTimeout(notificationTimerId);
    notificationTimerId = window.setTimeout(() => {
      elements.notificationTargets.forEach((target) => {
        target.classList.add("hidden");
      });
    }, 3200);
  }

  function clearMemberValidationState() {
    memberValidationErrors = [];
    invalidMemberRowIds = new Set();
  }

  function syncDependentStateToNodes() {
    const nodeIds = new Set(state.nodes.map((node) => node.id));

    state.members = state.members.filter(
      (member) => nodeIds.has(member.start) && nodeIds.has(member.end)
    );
    state.supports = state.supports.filter((support) => nodeIds.has(support.node));
    state.loads = state.loads.filter((load) => nodeIds.has(load.node));
  }

  function setGeometryData(nextNodes, nextMembers, options = {}) {
    const preserveDependentState = Boolean(options.preserveDependentState);

    state.nodes = nextNodes.map((node) => ({ ...node }));
    state.members = nextMembers.map((member) => ({ ...member }));
    state.nextNodeNumber = getNextIdNumber(state.nodes, "N");
    state.nextMemberNumber = getNextIdNumber(state.members, "M");

    if (!preserveDependentState) {
      syncDependentStateToNodes();
    }

    clearMemberValidationState();
  }

  function createMemberRecord(memberList, start, end) {
    const existingPair = memberList.some(
      (member) =>
        (member.start === start && member.end === end) ||
        (member.start === end && member.end === start)
    );

    if (existingPair || start === end) {
      return;
    }

    memberList.push({
      id: `M${memberList.length + 1}`,
      start,
      end,
      E: state.materialMode === "per_member" ? state.globalMaterial.E : null,
      A: state.materialMode === "per_member" ? state.globalMaterial.A : null,
    });
  }

  function validateGeneratedTruss(nodes, members, panelDiagonalCounts, topNodes, spanLength) {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const memberPairs = new Set();
    const connectedTopNodes = new Set();

    for (const member of members) {
      if (!nodeMap.has(member.start) || !nodeMap.has(member.end) || member.start === member.end) {
        return false;
      }

      const pairKey = [member.start, member.end].sort().join("::");

      if (memberPairs.has(pairKey)) {
        return false;
      }

      memberPairs.add(pairKey);

      if (nodeMap.get(member.start).y > 0) {
        connectedTopNodes.add(member.start);
      }

      if (nodeMap.get(member.end).y > 0) {
        connectedTopNodes.add(member.end);
      }
    }

    if (panelDiagonalCounts.some((count) => count > 1)) {
      return false;
    }

    if (!topNodes.every((topNode) => connectedTopNodes.has(topNode.id))) {
      return false;
    }

    const coordinateKeys = new Set(
      nodes.map((node) => `${node.x.toFixed(6)}::${node.y.toFixed(6)}`)
    );

    const hasMirroredNodes = nodes.every((node) => {
      const mirroredKey = `${(spanLength - node.x).toFixed(6)}::${node.y.toFixed(6)}`;
      return coordinateKeys.has(mirroredKey);
    });

    if (!hasMirroredNodes) {
      return false;
    }

    const mirroredMemberKeys = new Set(
      members.map((member) => {
        const startNode = nodeMap.get(member.start);
        const endNode = nodeMap.get(member.end);
        const mirroredStart = `${(spanLength - startNode.x).toFixed(6)}::${startNode.y.toFixed(6)}`;
        const mirroredEnd = `${(spanLength - endNode.x).toFixed(6)}::${endNode.y.toFixed(6)}`;

        return [mirroredStart, mirroredEnd].sort().join("::");
      })
    );

    return members.every((member) => {
      const startNode = nodeMap.get(member.start);
      const endNode = nodeMap.get(member.end);
      const memberKey = [
        `${startNode.x.toFixed(6)}::${startNode.y.toFixed(6)}`,
        `${endNode.x.toFixed(6)}::${endNode.y.toFixed(6)}`,
      ]
        .sort()
        .join("::");

      return mirroredMemberKeys.has(memberKey);
    });
  }

  function generateTruss(type, span, panels, heightInput) {
    const safePanels = Math.max(2, Math.floor(Number(panels) || 2));
    const safeSpan = Math.max(1, Number(span) || 1);
    const panelLength = safeSpan / safePanels;
    const idealHeight = panelLength;
    const requestedHeight = Math.max(0.1, Number(heightInput) || idealHeight);
    const safeHeight = Number(
      Math.min(panelLength * 1.2, Math.max(panelLength * 0.8, requestedHeight)).toFixed(6)
    );
    const normalizedType = ["pratt", "howe", "warren", "custom"].includes(type)
      ? type
      : "pratt";

    const bottomNodes = Array.from({ length: safePanels + 1 }, (_, index) => ({
      id: `N${index + 1}`,
      x: Number((index * panelLength).toFixed(6)),
      y: 0,
    }));

    const topNodes = Array.from({ length: Math.max(safePanels - 1, 0) }, (_, index) => ({
      id: `N${bottomNodes.length + index + 1}`,
      x: Number(((index + 1) * panelLength).toFixed(6)),
      y: safeHeight,
    }));

    const topNodeByIndex = new Map(topNodes.map((node, index) => [index + 1, node]));
    const members = [];
    const panelDiagonalCounts = Array.from({ length: safePanels }, () => 0);

    const addDiagonal = (panelIndex, startId, endId) => {
      if (panelIndex < 0 || panelIndex >= safePanels) {
        return false;
      }

      const memberCountBefore = members.length;
      createMemberRecord(members, startId, endId);
      if (members.length === memberCountBefore) {
        return false;
      }

      panelDiagonalCounts[panelIndex] += 1;
      return true;
    };

    const getRisingDiagonal = (panelIndex) => {
      const topNode = topNodeByIndex.get(panelIndex + 1);

      if (!topNode) {
        return null;
      }

      return {
        start: bottomNodes[panelIndex].id,
        end: topNode.id,
      };
    };

    const getFallingDiagonal = (panelIndex) => {
      const topNode = topNodeByIndex.get(panelIndex);

      if (!topNode) {
        return null;
      }

      return {
        start: topNode.id,
        end: bottomNodes[panelIndex + 1].id,
      };
    };

    const addPanelDiagonal = (panelIndex, preferredDirection) => {
      const primary =
        preferredDirection === "rising"
          ? getRisingDiagonal(panelIndex)
          : getFallingDiagonal(panelIndex);
      const fallback =
        preferredDirection === "rising"
          ? getFallingDiagonal(panelIndex)
          : getRisingDiagonal(panelIndex);
      const selectedDiagonal = primary || fallback;

      if (!selectedDiagonal) {
        return;
      }

      addDiagonal(panelIndex, selectedDiagonal.start, selectedDiagonal.end);
    };

    for (let index = 0; index < bottomNodes.length - 1; index += 1) {
      createMemberRecord(members, bottomNodes[index].id, bottomNodes[index + 1].id);
    }

    for (let index = 0; index < topNodes.length - 1; index += 1) {
      createMemberRecord(members, topNodes[index].id, topNodes[index + 1].id);
    }

    for (let topIndex = 1; topIndex < safePanels; topIndex += 1) {
      const topNode = topNodeByIndex.get(topIndex);

      if (topNode) {
        createMemberRecord(members, bottomNodes[topIndex].id, topNode.id);
      }
    }

    if (normalizedType === "pratt" || normalizedType === "howe" || normalizedType === "warren") {
      const mid = Math.floor(safePanels / 2);

      for (let panelIndex = 0; panelIndex < safePanels; panelIndex += 1) {
        if (normalizedType === "pratt") {
          addPanelDiagonal(panelIndex, panelIndex < mid ? "rising" : "falling");
        } else if (normalizedType === "howe") {
          addPanelDiagonal(panelIndex, panelIndex < mid ? "falling" : "rising");
        } else if (normalizedType === "warren") {
          addPanelDiagonal(panelIndex, panelIndex % 2 === 0 ? "rising" : "falling");
        }
      }
    }

    const nodes = [...bottomNodes, ...topNodes];
    const isValid = validateGeneratedTruss(
      nodes,
      members,
      panelDiagonalCounts,
      topNodes,
      safeSpan
    );

    if (!isValid) {
      const fallbackGeometry = generateTruss("pratt", 24, 6, 4);

      if (
        normalizedType === "pratt" &&
        safeSpan === 24 &&
        safePanels === 6 &&
        Number(safeHeight.toFixed(6)) === 4
      ) {
        return {
          nodes,
          members,
          type: normalizedType,
        };
      }

      return fallbackGeometry;
    }

    return {
      nodes,
      members,
      type: normalizedType,
    };
  }

  function applyQuickBuilderGeometry() {
    const generatedGeometry = generateTruss(
      state.quickBuilder.trussType,
      state.quickBuilder.spanLength,
      state.quickBuilder.panelCount,
      state.quickBuilder.height
    );

    setGeometryData(generatedGeometry.nodes, generatedGeometry.members, {
      preserveDependentState: true,
    });

    console.log("QB Nodes:", state.nodes.map((node) => ({ ...node })));
    console.log("QB Members:", state.members.map((member) => ({ ...member })));
    console.log("Truss Type:", generatedGeometry.type);
  }

  function renderInputErrorsPanel() {
    if (!elements.inputErrorsPanel || !elements.inputErrorsList) {
      return;
    }

    if (memberValidationErrors.length === 0) {
      elements.inputErrorsPanel.classList.add("hidden");
      elements.inputErrorsList.innerHTML = "";
      return;
    }

    elements.inputErrorsList.innerHTML = memberValidationErrors
      .map((errorMessage) => `<li>${escapeHtml(errorMessage)}</li>`)
      .join("");
    elements.inputErrorsPanel.classList.remove("hidden");
  }

  function setSolveButtonState() {
    if (!elements.solveButton) {
      return;
    }

    elements.solveButton.disabled = isSolving;
    elements.solveButton.classList.toggle("opacity-50", isSolving);
    elements.solveButton.classList.toggle("cursor-not-allowed", isSolving);
    elements.solveButton.innerHTML = createButtonLabel(
      isSolving ? "Solving..." : "Solve",
      isSolving
    );
  }

  function isFiniteNumber(value) {
    return value.trim() !== "" && Number.isFinite(Number(value));
  }

  function isPositiveNumber(value) {
    return isFiniteNumber(value) && Number(value) > 0;
  }

  function memberExists(start, end, excludeId = null) {
    return state.members.some((member) => {
      if (member.id === excludeId) {
        return false;
      }

      const sameDirection = member.start === start && member.end === end;
      const oppositeDirection = member.start === end && member.end === start;

      return sameDirection || oppositeDirection;
    });
  }

  function supportExists(nodeId, excludeId = null) {
    return state.supports.some((support) => support.id !== excludeId && support.node === nodeId);
  }

  function isPositiveFiniteNumber(value) {
    return Number.isFinite(value) && value > 0;
  }

  function isOptionalPositiveFiniteNumber(value) {
    return value === null || value === undefined || isPositiveFiniteNumber(value);
  }

  function parseNumericSuffix(identifier, prefix) {
    if (typeof identifier !== "string") {
      return null;
    }

    const match = identifier.match(new RegExp(`^${prefix}(\\d+)$`));

    if (!match) {
      return null;
    }

    return Number(match[1]);
  }

  function getNextIdNumber(items, prefix) {
    const maxValue = items.reduce((currentMax, item) => {
      const parsedValue = parseNumericSuffix(item.id, prefix);
      return parsedValue && parsedValue > currentMax ? parsedValue : currentMax;
    }, 0);

    return maxValue + 1;
  }

  function findAvailableSupportNode() {
    return state.nodes.find((node) => !supportExists(node.id)) || null;
  }

  function buildSupportTypeOptions(selectedValue) {
    const supportTypes = [
      { value: "pinned", label: "Pinned" },
      { value: "roller", label: "Roller" },
      { value: "fixed", label: "Fixed" },
    ];

    return supportTypes
      .map((supportType) => {
        const isSelected = supportType.value === selectedValue ? "selected" : "";
        return `<option value="${supportType.value}" ${isSelected}>${supportType.label}</option>`;
      })
      .join("");
  }

  function updateCounts() {
    elements.nodesCount.textContent = String(state.nodes.length);
    elements.membersCount.textContent = String(state.members.length);
  }

  function enableOrDisableMemberButton() {
    const canAddSupport = Boolean(findAvailableSupportNode());
    const canAddLoad = state.nodes.length > 0;

    if (elements.addSupportButton) {
      elements.addSupportButton.disabled = !canAddSupport;
      elements.addSupportButton.classList.toggle("opacity-50", !canAddSupport);
      elements.addSupportButton.classList.toggle("cursor-not-allowed", !canAddSupport);
    }

    if (elements.addLoadButton) {
      elements.addLoadButton.disabled = !canAddLoad;
      elements.addLoadButton.classList.toggle("opacity-50", !canAddLoad);
      elements.addLoadButton.classList.toggle("cursor-not-allowed", !canAddLoad);
    }
  }

  function animateNewRows(tableBody) {
    const newRows = tableBody.querySelectorAll("[data-new-row='true']");

    newRows.forEach((row) => {
      window.requestAnimationFrame(() => {
        row.classList.remove("opacity-0", "translate-y-2");
        row.classList.add("opacity-100", "translate-y-0");
        row.dataset.newRow = "false";
      });
    });
  }

  function renderMaterialModeCards() {
    elements.materialModeInputs.forEach((input) => {
      const wrapper = input.closest("label");

      if (!wrapper) {
        return;
      }

      const isActive = input.value === state.materialMode;

      wrapper.classList.toggle("border-green-500", isActive);
      wrapper.classList.toggle("bg-green-50", isActive);
      wrapper.classList.toggle("dark:bg-green-500/10", isActive);
      wrapper.classList.toggle("dark:border-green-500/40", isActive);
      wrapper.classList.toggle("shadow-md", isActive);
    });
  }

  function renderGeometryModeControls() {
    elements.geometryModeButtons.forEach((button) => {
      const isActive = button.dataset.geometryMode === state.inputMode;

      button.classList.toggle("bg-white", isActive);
      button.classList.toggle("shadow-sm", isActive);
      button.classList.toggle("dark:bg-white/10", isActive);
      button.classList.toggle("bg-transparent", !isActive);
      button.classList.toggle("shadow-none", !isActive);
      button.classList.toggle("dark:bg-transparent", !isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (elements.quickBuilderPanel) {
      elements.quickBuilderPanel.classList.toggle("hidden", state.inputMode !== "quick");
    }

    if (elements.advancedGeometryPanel) {
      elements.advancedGeometryPanel.classList.toggle("hidden", state.inputMode !== "advanced");
    }

    if (elements.quickSpanLength) {
      elements.quickSpanLength.value = state.quickBuilder.spanLength;
    }

    if (elements.quickPanelCount) {
      elements.quickPanelCount.value = state.quickBuilder.panelCount;
    }

    if (elements.quickHeight) {
      elements.quickHeight.value = state.quickBuilder.height;
    }

    if (elements.quickTrussType) {
      elements.quickTrussType.value = state.quickBuilder.trussType;
    }
  }

  function renderLoadModeControls() {
    elements.loadModeButtons.forEach((button) => {
      const isActive = button.dataset.loadMode === state.loadMode;

      button.classList.toggle("bg-white", isActive);
      button.classList.toggle("shadow-sm", isActive);
      button.classList.toggle("dark:bg-white/10", isActive);
      button.classList.toggle("bg-transparent", !isActive);
      button.classList.toggle("shadow-none", !isActive);
      button.classList.toggle("dark:bg-transparent", !isActive);
      button.classList.toggle("border-transparent", !isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (elements.jointLoadsPanel) {
      elements.jointLoadsPanel.classList.toggle("hidden", state.loadMode !== "joint");
    }

    if (elements.memberLoadsPanel) {
      elements.memberLoadsPanel.classList.toggle("hidden", state.loadMode !== "member");
    }
  }

  function renderConnectivitySummary() {
    if (
      !elements.connectivitySummaryToggle ||
      !elements.connectivitySummaryContent ||
      !elements.connectivitySummaryChevron ||
      !elements.connectivitySummaryCount
    ) {
      return;
    }

    const memberCount = state.members.length;
    elements.connectivitySummaryCount.textContent = `(${memberCount} member${memberCount === 1 ? "" : "s"})`;
    elements.connectivitySummaryToggle.setAttribute("aria-expanded", String(isConnectivityExpanded));
    elements.connectivitySummaryChevron.textContent = isConnectivityExpanded ? "▼" : "▶";
    elements.connectivitySummaryChevron.classList.toggle("rotate-90", isConnectivityExpanded);
    elements.connectivitySummaryContent.classList.toggle("opacity-0", !isConnectivityExpanded);
    elements.connectivitySummaryContent.classList.toggle("opacity-100", isConnectivityExpanded);

    if (isConnectivityExpanded) {
      const contentHeight = elements.connectivitySummaryContent.scrollHeight;
      elements.connectivitySummaryContent.style.maxHeight = `${contentHeight}px`;
    } else {
      elements.connectivitySummaryContent.style.maxHeight = "0px";
    }
  }

  function renderMembersTableHead() {
    elements.membersTableHead.innerHTML = `
      <tr class="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
        <th class="px-4 py-3">Member ID</th>
        <th class="px-4 py-3">Start Node</th>
        <th class="px-4 py-3">End Node</th>
      </tr>
    `;
  }

  function renderNodesTable(highlightId = null) {
    if (state.nodes.length === 0) {
      elements.nodesTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No nodes added yet.
          </td>
        </tr>
      `;
      return;
    }

    elements.nodesTableBody.innerHTML = state.nodes
      .map((node) => {
        const isNewRow = node.id === highlightId;

        return `
          <tr data-node-row="${node.id}" data-new-row="${isNewRow}" class="transition-all duration-200 ${isNewRow ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}">
            <td class="px-4 py-4 font-medium text-gray-900 dark:text-white">${node.id}</td>
            <td class="px-4 py-4">
              <input
                class="ui-input"
                type="number"
                step="any"
                inputmode="decimal"
                data-node-id="${node.id}"
                data-node-field="x"
                value="${node.x}"
                aria-label="${node.id} x coordinate"
              >
            </td>
            <td class="px-4 py-4">
              <input
                class="ui-input"
                type="number"
                step="any"
                inputmode="decimal"
                data-node-id="${node.id}"
                data-node-field="y"
                value="${node.y}"
                aria-label="${node.id} y coordinate"
              >
            </td>
            <td class="px-4 py-4 text-right">
              <button
                type="button"
                class="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                data-delete-node="${node.id}"
              >
                Delete
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    animateNewRows(elements.nodesTableBody);
  }

  function renderMembersTable(highlightId = null) {
    const columnCount = 3;

    if (state.inputMode === "advanced" && state.members.length === 0) {
      elements.membersTableBody.innerHTML = `
        <tr>
          <td colspan="${columnCount}" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Member connectivity will appear here after it is created from the canvas workflow.
          </td>
        </tr>
      `;
      return;
    }

    if (state.members.length === 0) {
      elements.membersTableBody.innerHTML = `
        <tr>
          <td colspan="${columnCount}" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No members added yet.
          </td>
        </tr>
      `;
      return;
    }

    elements.membersTableBody.innerHTML = state.members
        .map((member) => {
          const isNewRow = member.id === highlightId;
          const isInvalid = invalidMemberRowIds.has(member.id);

          return `
          <tr data-member-row="${member.id}" data-new-row="${isNewRow}" class="transition-all duration-200 ${isNewRow ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"} ${isInvalid ? "bg-red-500/[0.04]" : ""}">
            <td class="px-4 py-4 font-medium text-gray-900 dark:text-white">${member.id}</td>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-200 ${isInvalid ? "border-y border-red-500/40" : ""}">${sanitizeNodeReference(member.start)}</td>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-200 ${isInvalid ? "border-y border-red-500/40" : ""}">${sanitizeNodeReference(member.end)}</td>
          </tr>
        `;
        })
        .join("");

    animateNewRows(elements.membersTableBody);
  }

  function renderMaterialsPanel() {
    elements.materialModeInputs.forEach((input) => {
      input.checked = input.value === state.materialMode;
    });

    renderMaterialModeCards();

    const globalMode = state.materialMode === "global";

    elements.globalMaterialPanel.classList.toggle("hidden", !globalMode);
    elements.perMemberMaterialPanel.classList.toggle("hidden", globalMode);

    elements.globalMaterialE.value = state.globalMaterial.E ?? "";
    elements.globalMaterialA.value = state.globalMaterial.A ?? "";

    if (globalMode) {
      elements.materialModeTitle.textContent = "Global material assignment";
      elements.materialModeDescription.textContent = "A shared set of material properties will apply to all members in the current model.";
    } else {
      elements.materialModeTitle.textContent = "Per-member material assignment";
      elements.materialModeDescription.textContent = "Each member now stores its own Young's modulus and area in the material assignment table.";
    }

    renderPerMemberMaterialTable();
  }

  function renderPerMemberMaterialTable() {
    if (!elements.perMemberMaterialTableBody) {
      return;
    }

    if (state.members.length === 0) {
      elements.perMemberMaterialTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No members available yet.
          </td>
        </tr>
      `;
      return;
    }

    elements.perMemberMaterialTableBody.innerHTML = state.members
      .map((member) => `
        <tr>
          <td class="px-4 py-4 font-medium text-gray-900 dark:text-white">${member.id}</td>
          <td class="px-4 py-4">
            <input
              class="ui-input"
              type="number"
              step="any"
              inputmode="decimal"
              min="0"
              data-member-material-id="${member.id}"
              data-member-material-field="E"
              value="${member.E ?? ""}"
              aria-label="${member.id} Young's modulus"
            >
          </td>
          <td class="px-4 py-4">
            <input
              class="ui-input"
              type="number"
              step="any"
              inputmode="decimal"
              min="0"
              data-member-material-id="${member.id}"
              data-member-material-field="A"
              value="${member.A ?? ""}"
              aria-label="${member.id} cross-sectional area"
            >
          </td>
        </tr>
      `)
      .join("");
  }

  function renderSupportsTable(highlightId = null) {
    if (state.nodes.length === 0) {
      elements.supportsTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Add at least one node to begin assigning supports.
          </td>
        </tr>
      `;
      return;
    }

    if (state.supports.length === 0) {
      elements.supportsTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No supports assigned yet.
          </td>
        </tr>
      `;
      return;
    }

    elements.supportsTableBody.innerHTML = state.supports
      .map((support) => {
        const isNewRow = support.id === highlightId;
        const validity = getSupportValidity(support, support.id);

        return `
          <tr data-support-row="${support.id}" data-new-row="${isNewRow}" class="transition-all duration-200 ${isNewRow ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}">
            <td class="px-4 py-4 font-medium text-gray-900 dark:text-white">${support.id}</td>
            <td class="px-4 py-4">
              <input
                class="${getNodeInputClasses(validity.nodeExists)}"
                type="text"
                placeholder="e.g., N1"
                data-support-id="${support.id}"
                data-support-field="node"
                value="${validity.nodeId}"
                aria-label="${support.id} support node"
              >
              ${!validity.nodeExists ? '<p class="mt-2 text-xs font-medium text-red-500">Invalid node ID</p>' : ""}
              ${validity.duplicate ? '<p class="mt-2 text-xs font-medium text-amber-500">A node can only have one support.</p>' : ""}
            </td>
            <td class="px-4 py-4">
              <select
                class="ui-input"
                data-support-id="${support.id}"
                data-support-field="type"
                aria-label="${support.id} support type"
              >
                ${buildSupportTypeOptions(support.type)}
              </select>
            </td>
            <td class="px-4 py-4 text-right">
              <button
                type="button"
                class="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                data-delete-support="${support.id}"
              >
                Delete
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    animateNewRows(elements.supportsTableBody);
  }

  function renderLoadsTable(highlightId = null) {
    if (state.nodes.length === 0) {
      elements.loadsTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Add at least one node to begin assigning loads.
          </td>
        </tr>
      `;
      return;
    }

    if (state.loads.length === 0) {
      elements.loadsTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No loads assigned yet.
          </td>
        </tr>
      `;
      return;
    }

    elements.loadsTableBody.innerHTML = state.loads
      .map((load) => {
        const isNewRow = load.id === highlightId;
        const validity = getLoadValidity(load);

        return `
          <tr data-load-row="${load.id}" data-new-row="${isNewRow}" class="transition-all duration-200 ${isNewRow ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}">
            <td class="px-4 py-4 font-medium text-gray-900 dark:text-white">${load.id}</td>
            <td class="px-4 py-4">
              <input
                class="${getNodeInputClasses(validity.nodeExists)}"
                type="text"
                placeholder="e.g., N1"
                data-load-id="${load.id}"
                data-load-field="node"
                value="${validity.nodeId}"
                aria-label="${load.id} load node"
              >
              ${!validity.nodeExists ? '<p class="mt-2 text-xs font-medium text-red-500">Invalid node ID</p>' : ""}
            </td>
            <td class="px-4 py-4">
              <input
                class="ui-input"
                type="number"
                step="any"
                inputmode="decimal"
                data-load-id="${load.id}"
                data-load-field="fx"
                value="${load.fx}"
                aria-label="${load.id} horizontal force"
              >
            </td>
            <td class="px-4 py-4">
              <input
                class="ui-input"
                type="number"
                step="any"
                inputmode="decimal"
                data-load-id="${load.id}"
                data-load-field="fy"
                value="${load.fy}"
                aria-label="${load.id} vertical force"
              >
            </td>
            <td class="px-4 py-4 text-right">
              <button
                type="button"
                class="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                data-delete-load="${load.id}"
              >
                Delete
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    animateNewRows(elements.loadsTableBody);
  }

  function syncMemberLoadDraft() {
    const availableMembers = state.members.filter(
      (member) => getNodeById(member.start) && getNodeById(member.end)
    );

    if (availableMembers.length === 0) {
      state.memberLoadDraft = {
        memberId: "",
        referenceNode: "",
        distance: 0,
        fx: 0,
        fy: 0,
      };
      return;
    }

    const selectedMember = getMemberById(state.memberLoadDraft.memberId) || availableMembers[0];

    state.memberLoadDraft.memberId = selectedMember.id;

    const validReferenceNodes = [selectedMember.start, selectedMember.end];

    if (!validReferenceNodes.includes(state.memberLoadDraft.referenceNode)) {
      state.memberLoadDraft.referenceNode = selectedMember.start;
    }

    const memberLength = getMemberLength(selectedMember);

    if (!Number.isFinite(Number(state.memberLoadDraft.distance))) {
      state.memberLoadDraft.distance = 0;
    }

    state.memberLoadDraft.distance = Number(
      Math.min(Math.max(Number(state.memberLoadDraft.distance), 0), memberLength).toFixed(6)
    );
  }

  function buildMemberOptions(selectedMemberId) {
    if (state.members.length === 0) {
      return '<option value="">No members available</option>';
    }

    return state.members
      .map((member) => {
        const selected = member.id === selectedMemberId ? "selected" : "";
        return `<option value="${member.id}" ${selected}>${member.id} (${member.start}-${member.end})</option>`;
      })
      .join("");
  }

  function buildReferenceNodeOptions(member, selectedReferenceNode) {
    if (!member) {
      return '<option value="">Select a member first</option>';
    }

    return [member.start, member.end]
      .map((nodeId) => {
        const selected = nodeId === selectedReferenceNode ? "selected" : "";
        return `<option value="${nodeId}" ${selected}>${nodeId}</option>`;
      })
      .join("");
  }

  function renderMemberLoadsPanel() {
    if (
      !elements.memberLoadMember ||
      !elements.memberLoadReference ||
      !elements.memberLoadDistance ||
      !elements.memberLoadFx ||
      !elements.memberLoadFy ||
      !elements.memberLoadLengthNote ||
      !elements.convertMemberLoadButton
    ) {
      return;
    }

    syncMemberLoadDraft();

    const selectedMember = getMemberById(state.memberLoadDraft.memberId);
    const memberLength = getMemberLength(selectedMember);
    const hasMembers = state.members.length > 0;

    elements.memberLoadMember.innerHTML = buildMemberOptions(state.memberLoadDraft.memberId);
    elements.memberLoadMember.disabled = !hasMembers;
    elements.memberLoadReference.innerHTML = buildReferenceNodeOptions(
      selectedMember,
      state.memberLoadDraft.referenceNode
    );
    elements.memberLoadReference.disabled = !selectedMember;
    elements.memberLoadDistance.value = hasMembers ? state.memberLoadDraft.distance : 0;
    elements.memberLoadDistance.disabled = !selectedMember;
    elements.memberLoadFx.value = state.memberLoadDraft.fx;
    elements.memberLoadFx.disabled = !selectedMember;
    elements.memberLoadFy.value = state.memberLoadDraft.fy;
    elements.memberLoadFy.disabled = !selectedMember;
    elements.convertMemberLoadButton.disabled = !selectedMember;
    elements.convertMemberLoadButton.classList.toggle("opacity-50", !selectedMember);
    elements.convertMemberLoadButton.classList.toggle("cursor-not-allowed", !selectedMember);
    elements.memberLoadLengthNote.textContent = selectedMember
      ? `Member length: ${memberLength.toFixed(3)} m`
      : "Create at least one member to use smart conversion.";
  }

  function render(highlight = {}, focusConfig = null) {
    renderGeometryModeControls();
    renderLoadModeControls();
    renderMembersTableHead();
    renderNodesTable(highlight.nodeId || null);
    renderMembersTable(highlight.memberId || null);
    renderConnectivitySummary();
    renderMaterialsPanel();
    renderSupportsTable(highlight.supportId || null);
    renderLoadsTable(highlight.loadId || null);
    renderMemberLoadsPanel();
    renderInputErrorsPanel();
    updateCounts();
    enableOrDisableMemberButton();

    window.dispatchEvent(
      new CustomEvent("truss-analysis:statechange", {
        detail: getSnapshot(),
      })
    );

    setSolveButtonState();

    if (focusConfig) {
      window.requestAnimationFrame(() => {
        const target = controlsRoot.querySelector(focusConfig.selector);

        if (!target) {
          return;
        }

        target.focus();

        if (typeof target.setSelectionRange === "function") {
          const cursorPosition = target.value.length;
          target.setSelectionRange(cursorPosition, cursorPosition);
        }
      });
    }
  }

  function setGeometryMode(mode) {
    if (mode !== "quick" && mode !== "advanced") {
      return;
    }

    if (mode === state.inputMode) {
      return;
    }

    if (mode === "quick") {
      state.inputMode = "quick";
      applyQuickBuilderGeometry();
      showNotification("Quick Builder replaced the current node and member layout.", "info");
      render();
      return;
    }

    state.inputMode = "advanced";
    render();
  }

  function setLoadMode(mode) {
    if (mode !== "joint" && mode !== "member") {
      return;
    }

    if (mode === state.loadMode) {
      return;
    }

    state.loadMode = mode;
    render();
  }

  function toggleConnectivitySummary() {
    isConnectivityExpanded = !isConnectivityExpanded;
    render();
  }

  function updateQuickBuilderField(field, rawValue) {
    if (field === "trussType") {
      state.quickBuilder.trussType = rawValue;
    } else if (field === "panelCount") {
      state.quickBuilder.panelCount = Math.max(2, Math.floor(Number(rawValue) || 2));
    } else {
      state.quickBuilder[field] = Math.max(1, Number(rawValue) || 1);
    }

    if (state.inputMode === "quick") {
      applyQuickBuilderGeometry();
      render();
    } else {
      render();
    }
  }

  function addNode() {
    const newNode = {
      id: `N${state.nextNodeNumber}`,
      x: 0,
      y: 0,
    };

    state.nextNodeNumber += 1;
    state.nodes = [...state.nodes, newNode];
    clearMemberValidationState();

    render({ nodeId: newNode.id });
  }

  function createMemberFromNodes(startNodeId, endNodeId) {
    const start = sanitizeNodeReference(startNodeId);
    const end = sanitizeNodeReference(endNodeId);

    console.log("createMember called", { start, end });

    if (!nodeExistsById(start) || !nodeExistsById(end)) {
      return {
        success: false,
        error: "Both selected nodes must exist before creating a member.",
      };
    }

    if (start === end) {
      return {
        success: false,
        error: "A member cannot connect a node to itself.",
      };
    }

    if (memberExists(start, end)) {
      return {
        success: false,
        error: `A member already exists between ${start} and ${end}.`,
      };
    }

    const newMember = {
      id: `M${state.nextMemberNumber}`,
      start,
      end,
      E: state.materialMode === "per_member" ? state.globalMaterial.E : null,
      A: state.materialMode === "per_member" ? state.globalMaterial.A : null,
    };

    state.nextMemberNumber += 1;
    state.members = [...state.members, newMember];
    clearMemberValidationState();
    console.log("member created", newMember);
    render({ memberId: newMember.id });

    return {
      success: true,
      member: { ...newMember },
    };
  }

  function deleteMemberById(memberId) {
    const memberExistsInState = state.members.some((member) => member.id === memberId);

    if (!memberExistsInState) {
      return {
        success: false,
        error: "The selected member could not be found.",
      };
    }

    state.members = state.members.filter((member) => member.id !== memberId);
    clearMemberValidationState();
    render();

    return { success: true };
  }

  function addSupport() {
    if (state.nodes.length === 0) {
      showNotification("Add at least one node before assigning a support.");
      return;
    }

    const availableNode = findAvailableSupportNode();

    if (!availableNode) {
      showNotification("Every current node already has a support assignment.");
      return;
    }

    const newSupport = {
      id: `S${state.nextSupportNumber}`,
      node: availableNode.id,
      type: "pinned",
    };

    state.nextSupportNumber += 1;
    state.supports = [...state.supports, newSupport];

    render({ supportId: newSupport.id });
  }

  function addLoad() {
    if (state.nodes.length === 0) {
      showNotification("Add at least one node before assigning a load.");
      return;
    }

    const firstNode = state.nodes[0];
    const newLoad = {
      id: `L${state.nextLoadNumber}`,
      node: firstNode.id,
      fx: 0,
      fy: 0,
    };

    state.nextLoadNumber += 1;
    state.loads = [...state.loads, newLoad];

    render({ loadId: newLoad.id });
  }

  function getEquivalentLoadsForMemberLoad(memberLoad, nodes = state.nodes, members = state.members) {
    const member = members.find((entry) => entry.id === memberLoad.memberId);

    if (!member) {
      return null;
    }

    const startNode = nodes.find((node) => node.id === sanitizeNodeReference(member.start));
    const endNode = nodes.find((node) => node.id === sanitizeNodeReference(member.end));

    if (!startNode || !endNode) {
      return null;
    }

    const referenceNode = sanitizeNodeReference(memberLoad.referenceNode);

    if (referenceNode !== member.start && referenceNode !== member.end) {
      return null;
    }

    const memberLength = Math.hypot(endNode.x - startNode.x, endNode.y - startNode.y);

    if (!Number.isFinite(memberLength) || memberLength <= 0) {
      return null;
    }

    const distance = Number(memberLoad.distance);
    const fx = Number(memberLoad.fx);
    const fy = Number(memberLoad.fy);

    if (!Number.isFinite(distance) || !Number.isFinite(fx) || !Number.isFinite(fy)) {
      return null;
    }

    const clampedDistance = Math.min(Math.max(distance, 0), memberLength);
    const farNode = referenceNode === member.start ? member.end : member.start;
    const a = clampedDistance;
    const b = memberLength - a;
    const factorAtReference = b / memberLength;
    const factorAtFarNode = a / memberLength;

    return [
      {
        node: referenceNode,
        fx: Number((fx * factorAtReference).toFixed(6)),
        fy: Number((fy * factorAtReference).toFixed(6)),
      },
      {
        node: farNode,
        fx: Number((fx * factorAtFarNode).toFixed(6)),
        fy: Number((fy * factorAtFarNode).toFixed(6)),
      },
    ];
  }

  function convertMemberLoad() {
    const member = getMemberById(state.memberLoadDraft.memberId);

    if (!member) {
      showNotification("Choose a valid member before converting a member load.");
      return;
    }

    const startNode = getNodeById(member.start);
    const endNode = getNodeById(member.end);

    if (!startNode || !endNode) {
      showNotification("The selected member references nodes that no longer exist.");
      return;
    }

    const referenceNode = sanitizeNodeReference(state.memberLoadDraft.referenceNode);

    if (referenceNode !== member.start && referenceNode !== member.end) {
      showNotification("Reference node must be one of the selected member end joints.");
      return;
    }

    const memberLength = getMemberLength(member);
    const distance = Number(state.memberLoadDraft.distance);
    const fx = Number(state.memberLoadDraft.fx);
    const fy = Number(state.memberLoadDraft.fy);

    if (!Number.isFinite(distance) || distance < 0 || distance > memberLength) {
      showNotification(`Distance must be between 0 and ${memberLength.toFixed(3)} m.`);
      return;
    }

    if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
      showNotification("Member load force values must be valid numbers.");
      return;
    }

    if (Math.abs(fx) < 1e-9 && Math.abs(fy) < 1e-9) {
      showNotification("Enter a non-zero Fx or Fy value before converting a member load.");
      return;
    }

    const newMemberLoad = {
      id: `ML${state.nextMemberLoadNumber}`,
      memberId: member.id,
      referenceNode,
      distance: Number(distance.toFixed(6)),
      fx: Number(fx.toFixed(6)),
      fy: Number(fy.toFixed(6)),
    };

    state.nextMemberLoadNumber += 1;
    state.memberLoads = [...state.memberLoads, newMemberLoad];
    state.memberLoadDraft = {
      memberId: member.id,
      referenceNode: member.start,
      distance: 0,
      fx: 0,
      fy: 0,
    };

    showNotification("Member load applied successfully.", "info");
    render();
  }

  function animateAndRemove(row, callback) {
    if (!row) {
      callback();
      return;
    }

    row.classList.add("opacity-0", "-translate-y-1");
    window.setTimeout(callback, 180);
  }

  function deleteNode(nodeId, row) {
    animateAndRemove(row, () => {
      const existingMemberCount = state.members.length;
      const existingSupportCount = state.supports.length;
      const existingLoadCount = state.loads.length;

      state.nodes = state.nodes.filter((node) => node.id !== nodeId);
      state.members = state.members.filter((member) => member.start !== nodeId && member.end !== nodeId);
      state.supports = state.supports.filter((support) => support.node !== nodeId);
      state.loads = state.loads.filter((load) => load.node !== nodeId);
      clearMemberValidationState();

      const removedMembersCount = existingMemberCount - state.members.length;
      const removedSupportsCount = existingSupportCount - state.supports.length;
      const removedLoadsCount = existingLoadCount - state.loads.length;
      render();

      const removalMessages = [];

      if (removedMembersCount > 0) {
        removalMessages.push(`${removedMembersCount} member${removedMembersCount > 1 ? "s" : ""}`);
      }

      if (removedSupportsCount > 0) {
        removalMessages.push(`${removedSupportsCount} support${removedSupportsCount > 1 ? "s" : ""}`);
      }

      if (removedLoadsCount > 0) {
        removalMessages.push(`${removedLoadsCount} load${removedLoadsCount > 1 ? "s" : ""}`);
      }

      if (removalMessages.length > 0) {
        showNotification(`Removed ${removalMessages.join(", ")} linked to ${nodeId}.`, "info");
      }
    });
  }

  function deleteSupport(supportId, row) {
    animateAndRemove(row, () => {
      state.supports = state.supports.filter((support) => support.id !== supportId);
      render();
    });
  }

  function deleteLoad(loadId, row) {
    animateAndRemove(row, () => {
      state.loads = state.loads.filter((load) => load.id !== loadId);
      render();
    });
  }

  function updateNodeField(nodeId, field, rawValue) {
    if (!isFiniteNumber(rawValue)) {
      showNotification("Node coordinates must be valid numbers.");
      render();
      return;
    }

    const numericValue = Number(rawValue);

    state.nodes = state.nodes.map((node) =>
      node.id === nodeId ? { ...node, [field]: numericValue } : node
    );

    render();
  }

  function updateMemberField(memberId, field, nextValue, focusConfig = null) {
    const currentMember = state.members.find((member) => member.id === memberId);

    if (!currentMember) {
      return;
    }

    if (field === "E" || field === "A") {
      if (!isPositiveNumber(nextValue)) {
        showNotification(`Member ${field} values must be greater than zero.`);
        render({}, focusConfig);
        return;
      }

      const numericValue = Number(nextValue);
      state.members = state.members.map((member) =>
        member.id === memberId ? { ...member, [field]: numericValue } : member
      );
      clearMemberValidationState();
      render({}, focusConfig);
      return;
    }

    state.members = state.members.map((member) =>
      member.id === memberId ? { ...member, [field]: sanitizeNodeReference(nextValue) } : member
    );
    render({}, focusConfig);
  }

  function updateGlobalMaterialField(field, rawValue) {
    if (!isPositiveNumber(rawValue)) {
      showNotification(`Global ${field} must be greater than zero.`);
      render();
      return;
    }

    state.globalMaterial = {
      ...state.globalMaterial,
      [field]: Number(rawValue),
    };

    render();
  }

  function updateSupportField(supportId, field, nextValue, focusConfig = null) {
    const currentSupport = state.supports.find((support) => support.id === supportId);

    if (!currentSupport) {
      return;
    }

    if (field === "type" && !["pinned", "roller", "fixed"].includes(nextValue)) {
      showNotification("Choose a valid support type.");
      render({}, focusConfig);
      return;
    }

    state.supports = state.supports.map((support) =>
      support.id === supportId
        ? { ...support, [field]: field === "node" ? sanitizeNodeReference(nextValue) : nextValue }
        : support
    );

    render({}, focusConfig);
  }

  function updateLoadField(loadId, field, nextValue, focusConfig = null) {
    const currentLoad = state.loads.find((load) => load.id === loadId);

    if (!currentLoad) {
      return;
    }

    if (field === "fx" || field === "fy") {
      if (!isFiniteNumber(nextValue)) {
        showNotification(`Load ${field.toUpperCase()} values must be valid numbers.`);
        render({}, focusConfig);
        return;
      }

      const numericValue = Number(nextValue);
      state.loads = state.loads.map((load) =>
        load.id === loadId ? { ...load, [field]: numericValue } : load
      );
      render({}, focusConfig);
      return;
    }

    state.loads = state.loads.map((load) =>
      load.id === loadId ? { ...load, node: sanitizeNodeReference(nextValue) } : load
    );

    render({}, focusConfig);
  }

  function updateMemberLoadDraftField(field, nextValue) {
    if (field === "memberId") {
      const member = getMemberById(nextValue);

      state.memberLoadDraft = {
        ...state.memberLoadDraft,
        memberId: member ? member.id : "",
        referenceNode: member ? member.start : "",
        distance: 0,
      };
      render();
      return;
    }

    if (field === "referenceNode") {
      state.memberLoadDraft = {
        ...state.memberLoadDraft,
        referenceNode: sanitizeNodeReference(nextValue),
      };
      render();
      return;
    }

    if (field === "distance" || field === "fx" || field === "fy") {
      if (!isFiniteNumber(nextValue)) {
        state.memberLoadDraft = {
          ...state.memberLoadDraft,
          [field]: nextValue === "" ? 0 : state.memberLoadDraft[field],
        };
        render();
        return;
      }

      state.memberLoadDraft = {
        ...state.memberLoadDraft,
        [field]: Number(nextValue),
      };
      render();
    }
  }

  function hasIncompletePerMemberMaterials(members = state.members) {
    return members.some(
      (member) => !(Number.isFinite(member.E) && member.E > 0 && Number.isFinite(member.A) && member.A > 0)
    );
  }

  function buildSolverInput() {
    const snapshot = getSnapshot();
    const acceptedSupportNodes = new Set();
    const combinedLoadsByNode = new Map();

    const members = snapshot.members.map((member) => ({
      ...member,
      start: sanitizeNodeReference(member.start),
      end: sanitizeNodeReference(member.end),
    }));

    const supports = snapshot.supports.filter((support) => {
      const validity = getSupportValidity(support, support.id);

      if (!validity.isSolverEligible || acceptedSupportNodes.has(validity.nodeId)) {
        return false;
      }

      acceptedSupportNodes.add(validity.nodeId);
      support.node = validity.nodeId;
      return true;
    });

    snapshot.loads.forEach((load) => {
      const validity = getLoadValidity(load);

      if (!validity.isSolverEligible) {
        return;
      }

      const existingLoad = combinedLoadsByNode.get(validity.nodeId) || {
        id: `L${combinedLoadsByNode.size + 1}`,
        node: validity.nodeId,
        fx: 0,
        fy: 0,
      };

      existingLoad.fx = Number((existingLoad.fx + Number(load.fx)).toFixed(6));
      existingLoad.fy = Number((existingLoad.fy + Number(load.fy)).toFixed(6));
      combinedLoadsByNode.set(validity.nodeId, existingLoad);
    });

    snapshot.memberLoads.forEach((memberLoad) => {
      const equivalentLoads = getEquivalentLoadsForMemberLoad(memberLoad, snapshot.nodes, snapshot.members);

      if (!equivalentLoads) {
        return;
      }

      equivalentLoads.forEach((entry) => {
        const existingLoad = combinedLoadsByNode.get(entry.node) || {
          id: `L${combinedLoadsByNode.size + 1}`,
          node: entry.node,
          fx: 0,
          fy: 0,
        };

        existingLoad.fx = Number((existingLoad.fx + Number(entry.fx)).toFixed(6));
        existingLoad.fy = Number((existingLoad.fy + Number(entry.fy)).toFixed(6));
        combinedLoadsByNode.set(entry.node, existingLoad);
      });
    });

    const loads = Array.from(combinedLoadsByNode.values());

    return {
      nodes: snapshot.nodes.map((node) => ({
        ...node,
        id: sanitizeNodeReference(node.id),
      })),
      members,
      supports,
      loads,
      materialMode: snapshot.materialMode,
      globalMaterial: { ...snapshot.globalMaterial },
    };
  }

  function getExcludedInputSummary(snapshot, solverInput) {
    return {
      members: 0,
      supports: Math.max(0, snapshot.supports.length - solverInput.supports.length),
      loads: Math.max(0, snapshot.loads.length - solverInput.loads.length),
    };
  }

  function validateImportedState(candidateState) {
    if (!candidateState || typeof candidateState !== "object" || Array.isArray(candidateState)) {
      return "The selected file does not contain a valid truss input object.";
    }

    const {
      nodes,
      members,
      supports,
      loads,
      memberLoads,
      memberLoadDraft,
      loadMode,
      inputMode,
      quickBuilder,
      materialMode,
      globalMaterial,
    } = candidateState;

    if (!Array.isArray(nodes) || !Array.isArray(members) || !Array.isArray(supports) || !Array.isArray(loads)) {
      return "The input file must include nodes, members, supports, and loads arrays.";
    }

    if (memberLoads !== undefined && !Array.isArray(memberLoads)) {
      return "Member loads must be stored as an array when provided.";
    }

    if (materialMode !== "global" && materialMode !== "per_member") {
      return "The input file must specify a valid material mode.";
    }

    if (inputMode !== undefined && inputMode !== "advanced" && inputMode !== "quick") {
      return "The input file must specify a valid input mode.";
    }

    if (loadMode !== undefined && loadMode !== "joint" && loadMode !== "member") {
      return "The input file must specify a valid load mode.";
    }

    if (!globalMaterial || typeof globalMaterial !== "object" || Array.isArray(globalMaterial)) {
      return "The input file must include a valid globalMaterial object.";
    }

    if (quickBuilder !== undefined) {
      if (!quickBuilder || typeof quickBuilder !== "object" || Array.isArray(quickBuilder)) {
        return "The input file must include a valid quickBuilder object.";
      }

      const validTrussTypes = ["pratt", "howe", "warren", "custom"];

      if (
        !isPositiveFiniteNumber(Number(quickBuilder.spanLength)) ||
        !Number.isInteger(Number(quickBuilder.panelCount)) ||
        Number(quickBuilder.panelCount) < 2 ||
        !isPositiveFiniteNumber(Number(quickBuilder.height)) ||
        !validTrussTypes.includes(quickBuilder.trussType)
      ) {
        return "Quick Builder settings are invalid.";
      }
    }

    if (!isOptionalPositiveFiniteNumber(globalMaterial.E) || !isOptionalPositiveFiniteNumber(globalMaterial.A)) {
      return "Global material values must be empty or greater than zero.";
    }

    const nodeIds = new Set();
    const memberIds = new Set();
    const memberPairs = new Set();
    const supportIds = new Set();
    const supportedNodes = new Set();
    const loadIds = new Set();
    const memberLoadIds = new Set();

    for (const node of nodes) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        return "Each node entry must be a valid object.";
      }

      if (typeof node.id !== "string" || node.id.trim() === "") {
        return "Each node must include a valid id.";
      }

      if (nodeIds.has(node.id)) {
        return `Duplicate node id found: ${node.id}.`;
      }

      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        return `Node ${node.id} must include numeric x and y coordinates.`;
      }

      nodeIds.add(node.id);
    }

    for (const member of members) {
      if (!member || typeof member !== "object" || Array.isArray(member)) {
        return "Each member entry must be a valid object.";
      }

      if (typeof member.id !== "string" || member.id.trim() === "") {
        return "Each member must include a valid id.";
      }

      if (memberIds.has(member.id)) {
        return `Duplicate member id found: ${member.id}.`;
      }

      if (!nodeIds.has(member.start) || !nodeIds.has(member.end)) {
        return `Member ${member.id} references a node that does not exist.`;
      }

      if (member.start === member.end) {
        return `Member ${member.id} cannot connect a node to itself.`;
      }

      if (!isOptionalPositiveFiniteNumber(member.E) || !isOptionalPositiveFiniteNumber(member.A)) {
        return `Member ${member.id} must have empty or positive material values.`;
      }

      const pairKey = [member.start, member.end].sort().join("::");

      if (memberPairs.has(pairKey)) {
        return `Duplicate member connection found between ${member.start} and ${member.end}.`;
      }

      memberIds.add(member.id);
      memberPairs.add(pairKey);
    }

    for (const support of supports) {
      if (!support || typeof support !== "object" || Array.isArray(support)) {
        return "Each support entry must be a valid object.";
      }

      if (typeof support.id !== "string" || support.id.trim() === "") {
        return "Each support must include a valid id.";
      }

      if (supportIds.has(support.id)) {
        return `Duplicate support id found: ${support.id}.`;
      }

      if (!nodeIds.has(support.node)) {
        return `Support ${support.id} references a node that does not exist.`;
      }

      if (!["pinned", "roller", "fixed"].includes(support.type)) {
        return `Support ${support.id} has an invalid type.`;
      }

      if (supportedNodes.has(support.node)) {
        return `Node ${support.node} has more than one support assignment.`;
      }

      supportIds.add(support.id);
      supportedNodes.add(support.node);
    }

    for (const load of loads) {
      if (!load || typeof load !== "object" || Array.isArray(load)) {
        return "Each load entry must be a valid object.";
      }

      if (typeof load.id !== "string" || load.id.trim() === "") {
        return "Each load must include a valid id.";
      }

      if (loadIds.has(load.id)) {
        return `Duplicate load id found: ${load.id}.`;
      }

      if (!nodeIds.has(load.node)) {
        return `Load ${load.id} references a node that does not exist.`;
      }

      if (!Number.isFinite(load.fx) || !Number.isFinite(load.fy)) {
        return `Load ${load.id} must include numeric Fx and Fy values.`;
      }

      loadIds.add(load.id);
    }

    if (memberLoads !== undefined) {
      for (const memberLoad of memberLoads) {
        if (!memberLoad || typeof memberLoad !== "object" || Array.isArray(memberLoad)) {
          return "Each member load entry must be a valid object.";
        }

        if (typeof memberLoad.id !== "string" || memberLoad.id.trim() === "") {
          return "Each member load must include a valid id.";
        }

        if (memberLoadIds.has(memberLoad.id)) {
          return `Duplicate member load id found: ${memberLoad.id}.`;
        }

        if (!memberIds.has(memberLoad.memberId)) {
          return `Member load ${memberLoad.id} references a member that does not exist.`;
        }

        const referencedMember = members.find((member) => member.id === memberLoad.memberId);

        if (
          memberLoad.referenceNode !== referencedMember.start &&
          memberLoad.referenceNode !== referencedMember.end
        ) {
          return `Member load ${memberLoad.id} references an invalid member end node.`;
        }

        if (
          !Number.isFinite(memberLoad.distance) ||
          !Number.isFinite(memberLoad.fx) ||
          !Number.isFinite(memberLoad.fy)
        ) {
          return `Member load ${memberLoad.id} must include numeric distance, Fx, and Fy values.`;
        }

        memberLoadIds.add(memberLoad.id);
      }
    }

    if (memberLoadDraft !== undefined) {
      if (!memberLoadDraft || typeof memberLoadDraft !== "object" || Array.isArray(memberLoadDraft)) {
        return "The input file must include a valid memberLoadDraft object.";
      }

      if (
        (memberLoadDraft.memberId !== "" && typeof memberLoadDraft.memberId !== "string") ||
        (memberLoadDraft.referenceNode !== "" && typeof memberLoadDraft.referenceNode !== "string") ||
        !Number.isFinite(Number(memberLoadDraft.distance)) ||
        !Number.isFinite(Number(memberLoadDraft.fx)) ||
        !Number.isFinite(Number(memberLoadDraft.fy))
      ) {
        return "Member load draft values are invalid.";
      }
    }

    return null;
  }

  function restoreStateFromImport(importedState) {
    state.nodes = importedState.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
    }));

    state.members = importedState.members.map((member) => ({
      id: member.id,
      start: member.start,
      end: member.end,
      E: member.E ?? null,
      A: member.A ?? null,
    }));

    state.supports = importedState.supports.map((support) => ({
      id: support.id,
      node: support.node,
      type: support.type,
    }));

    state.loads = importedState.loads.map((load) => ({
      id: load.id,
      node: load.node,
      fx: load.fx,
      fy: load.fy,
    }));
    state.memberLoads = (importedState.memberLoads || []).map((memberLoad) => ({
      id: memberLoad.id,
      memberId: memberLoad.memberId,
      referenceNode: memberLoad.referenceNode,
      distance: memberLoad.distance,
      fx: memberLoad.fx,
      fy: memberLoad.fy,
    }));
    state.memberLoadDraft = {
      memberId: importedState.memberLoadDraft?.memberId ?? "",
      referenceNode: importedState.memberLoadDraft?.referenceNode ?? "",
      distance: Number(importedState.memberLoadDraft?.distance) || 0,
      fx: Number(importedState.memberLoadDraft?.fx) || 0,
      fy: Number(importedState.memberLoadDraft?.fy) || 0,
    };

    state.materialMode = importedState.materialMode;
    state.loadMode =
      importedState.loadMode === "member" || importedState.loadMode === "joint"
        ? importedState.loadMode
        : "joint";
    state.inputMode =
      importedState.inputMode === "quick" || importedState.inputMode === "advanced"
        ? importedState.inputMode
        : "advanced";
    state.quickBuilder = {
      spanLength: Number(importedState.quickBuilder?.spanLength) || state.quickBuilder.spanLength,
      panelCount: Math.max(2, Math.floor(Number(importedState.quickBuilder?.panelCount) || state.quickBuilder.panelCount)),
      height: Number(importedState.quickBuilder?.height) || state.quickBuilder.height,
      trussType: ["pratt", "howe", "warren", "custom"].includes(importedState.quickBuilder?.trussType)
        ? importedState.quickBuilder.trussType
        : state.quickBuilder.trussType,
    };
    state.globalMaterial = {
      E: importedState.globalMaterial.E ?? null,
      A: importedState.globalMaterial.A ?? null,
    };
    state.nextNodeNumber = getNextIdNumber(state.nodes, "N");
    state.nextMemberNumber = getNextIdNumber(state.members, "M");
    state.nextSupportNumber = getNextIdNumber(state.supports, "S");
    state.nextLoadNumber = getNextIdNumber(state.loads, "L");
    state.nextMemberLoadNumber = getNextIdNumber(state.memberLoads, "ML");
    clearMemberValidationState();
  }

  function handleSaveInput() {
    const snapshot = getSnapshot();
    const serializedInput = JSON.stringify(snapshot, null, 2);

    createDownload("truss-input.json", serializedInput);
    showNotification("Input saved successfully.", "info");
  }

  function handleLoadInput() {
    if (!elements.loadInputFile) {
      showNotification("The file input control is not available.");
      return;
    }

    elements.loadInputFile.value = "";
    elements.loadInputFile.click();
  }

  function handleLoadFileSelection(event) {
    const [selectedFile] = Array.from(event.target.files || []);

    if (!selectedFile) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsedData = JSON.parse(reader.result);
        const validationError = validateImportedState(parsedData);

        if (validationError) {
          showNotification(validationError);
          return;
        }

        restoreStateFromImport(parsedData);
        render();
        showNotification("Input loaded successfully.", "info");
      } catch (error) {
        showNotification("Unable to load the selected JSON file.");
      }
    };

    reader.onerror = () => {
      showNotification("The selected file could not be read.");
    };

    reader.readAsText(selectedFile);
  }

  function validateBeforeSolve(snapshot) {
    if (snapshot.nodes.length === 0) {
      return "Add at least one node before solving.";
    }

    if (snapshot.members.length === 0) {
      return "Add at least one valid member before solving.";
    }

    if (snapshot.materialMode === "global") {
      const globalE = snapshot.globalMaterial?.E;
      const globalA = snapshot.globalMaterial?.A;

      if (!(Number.isFinite(globalE) && globalE > 0 && Number.isFinite(globalA) && globalA > 0)) {
        return "Global material mode requires valid E and A values.";
      }
    }

    if (snapshot.materialMode === "per_member" && hasIncompletePerMemberMaterials(snapshot.members)) {
      return "Each member must include valid E and A values before solving.";
    }

    return null;
  }

  async function handleSolveRequest() {
    if (isSolving) {
      return;
    }

    if (typeof window.solveTruss !== "function") {
      showNotification("The analysis API client is not available.");
      return;
    }

    clearMemberValidationState();

    const snapshot = getSnapshot();
    const memberValidationResult = collectMemberValidationErrors(snapshot.members);

    if (memberValidationResult.errors.length > 0) {
      memberValidationErrors = memberValidationResult.errors;
      invalidMemberRowIds = memberValidationResult.invalidRowIds;
      render();

      if (elements.inputErrorsPanel) {
        elements.inputErrorsPanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }

      return;
    }

    const solverInput = buildSolverInput();
    const validationError = validateBeforeSolve(solverInput);

    if (validationError) {
      render();
      showNotification(validationError);
      return;
    }

    isSolving = true;
    window.dispatchEvent(
      new CustomEvent("truss-analysis:solvingstatechange", {
        detail: { isSolving: true },
      })
    );
    render();

    try {
      const exclusionSummary = getExcludedInputSummary(snapshot, solverInput);
      const hasExcludedInputs =
        exclusionSummary.members > 0 ||
        exclusionSummary.supports > 0 ||
        exclusionSummary.loads > 0;

      if (hasExcludedInputs) {
        const warningParts = [];

        if (exclusionSummary.members > 0) {
          warningParts.push(`${exclusionSummary.members} invalid member${exclusionSummary.members > 1 ? "s" : ""}`);
        }

        if (exclusionSummary.supports > 0) {
          warningParts.push(`${exclusionSummary.supports} invalid support${exclusionSummary.supports > 1 ? "s were" : " was"}`);
        }

        if (exclusionSummary.loads > 0) {
          warningParts.push(`${exclusionSummary.loads} invalid load${exclusionSummary.loads > 1 ? "s were" : " was"}`);
        }

        showNotification(`${warningParts.join(", ")} excluded from analysis.`, "info");
      }

      const result = await window.solveTruss(solverInput);

      window.dispatchEvent(
        new CustomEvent("truss-analysis:solved", {
          detail: result,
        })
      );

      showNotification("Truss solved successfully.", "info");
    } catch (error) {
      showNotification(error.message || "Failed to solve the truss.");
      window.dispatchEvent(
        new CustomEvent("truss-analysis:solveerror", {
          detail: {
            error: error.message || "Failed to solve the truss.",
          },
        })
      );
    } finally {
      isSolving = false;
      window.dispatchEvent(
        new CustomEvent("truss-analysis:solvingstatechange", {
          detail: { isSolving: false },
        })
      );
      render();
    }
  }

  function setMaterialMode(mode) {
    if (mode !== "global" && mode !== "per_member") {
      return;
    }

    state.materialMode = mode;
    render();

    if (mode === "per_member" && hasIncompletePerMemberMaterials()) {
      showNotification("Per-member mode requires each member to have E and A values greater than zero.");
    }
  }

  function handleClick(event) {
    const addNodeTrigger = event.target.closest("#add-node-button");
    const addSupportTrigger = event.target.closest("#add-support-button");
    const addLoadTrigger = event.target.closest("#add-load-button");
    const convertMemberLoadTrigger = event.target.closest("#convert-member-load-button");
    const geometryModeTrigger = event.target.closest("[data-geometry-mode]");
    const loadModeTrigger = event.target.closest("[data-load-mode]");
    const connectivityToggleTrigger = event.target.closest("#connectivity-summary-toggle");
    const deleteNodeTrigger = event.target.closest("[data-delete-node]");
    const deleteSupportTrigger = event.target.closest("[data-delete-support]");
    const deleteLoadTrigger = event.target.closest("[data-delete-load]");

    if (addNodeTrigger) {
      addNode();
      return;
    }

    if (addSupportTrigger) {
      addSupport();
      return;
    }

    if (addLoadTrigger) {
      addLoad();
      return;
    }

    if (convertMemberLoadTrigger) {
      convertMemberLoad();
      return;
    }

    if (geometryModeTrigger) {
      setGeometryMode(geometryModeTrigger.dataset.geometryMode);
      return;
    }

    if (loadModeTrigger) {
      setLoadMode(loadModeTrigger.dataset.loadMode);
      return;
    }

    if (connectivityToggleTrigger) {
      toggleConnectivitySummary();
      return;
    }

    if (event.target.closest("#save-input-button")) {
      handleSaveInput();
      return;
    }

    if (event.target.closest("#load-input-button")) {
      handleLoadInput();
      return;
    }

    if (event.target.closest("#solve-button")) {
      handleSolveRequest();
      return;
    }

    if (deleteNodeTrigger) {
      deleteNode(deleteNodeTrigger.dataset.deleteNode, deleteNodeTrigger.closest("tr"));
      return;
    }

    if (deleteSupportTrigger) {
      deleteSupport(deleteSupportTrigger.dataset.deleteSupport, deleteSupportTrigger.closest("tr"));
      return;
    }

    if (deleteLoadTrigger) {
      deleteLoad(deleteLoadTrigger.dataset.deleteLoad, deleteLoadTrigger.closest("tr"));
    }
  }

  function handleChange(event) {
    const nodeInput = event.target.closest("[data-node-id][data-node-field]");
    const memberMaterialField = event.target.closest("[data-member-material-id][data-member-material-field]");
    const supportField = event.target.closest("[data-support-id][data-support-field]");
    const loadField = event.target.closest("[data-load-id][data-load-field]");
    const materialModeInput = event.target.closest("input[name='material-mode']");
    const geometryModeInput = event.target.closest("[data-geometry-mode]");
    const loadModeInput = event.target.closest("[data-load-mode]");
    const globalMaterialInput = event.target.closest("#global-material-e, #global-material-a");
    const quickBuilderInput = event.target.closest("#quick-span-length, #quick-panel-count, #quick-height, #quick-truss-type");
    const memberLoadInput = event.target.closest(
      "#member-load-member, #member-load-reference, #member-load-distance, #member-load-fx, #member-load-fy"
    );

    if (nodeInput) {
      updateNodeField(nodeInput.dataset.nodeId, nodeInput.dataset.nodeField, nodeInput.value);
      return;
    }

    if (memberMaterialField) {
      updateMemberField(
        memberMaterialField.dataset.memberMaterialId,
        memberMaterialField.dataset.memberMaterialField,
        memberMaterialField.value
      );
      return;
    }

    if (supportField) {
      updateSupportField(supportField.dataset.supportId, supportField.dataset.supportField, supportField.value);
      return;
    }

    if (loadField) {
      updateLoadField(loadField.dataset.loadId, loadField.dataset.loadField, loadField.value);
      return;
    }

    if (materialModeInput) {
      setMaterialMode(materialModeInput.value);
      return;
    }

    if (geometryModeInput) {
      setGeometryMode(geometryModeInput.dataset.geometryMode);
      return;
    }

    if (loadModeInput) {
      setLoadMode(loadModeInput.dataset.loadMode);
      return;
    }

    if (globalMaterialInput) {
      const field = globalMaterialInput.id === "global-material-e" ? "E" : "A";
      updateGlobalMaterialField(field, globalMaterialInput.value);
      return;
    }

    if (quickBuilderInput) {
      const fieldMap = {
        "quick-span-length": "spanLength",
        "quick-panel-count": "panelCount",
        "quick-height": "height",
        "quick-truss-type": "trussType",
      };
      updateQuickBuilderField(fieldMap[quickBuilderInput.id], quickBuilderInput.value);
      return;
    }

    if (memberLoadInput) {
      const fieldMap = {
        "member-load-member": "memberId",
        "member-load-reference": "referenceNode",
        "member-load-distance": "distance",
        "member-load-fx": "fx",
        "member-load-fy": "fy",
      };
      updateMemberLoadDraftField(fieldMap[memberLoadInput.id], memberLoadInput.value);
    }
  }

  function handleInput(event) {
    const supportField = event.target.closest("[data-support-id][data-support-field='node']");
    const loadField = event.target.closest("[data-load-id][data-load-field='node']");
    const quickBuilderInput = event.target.closest("#quick-span-length, #quick-panel-count, #quick-height");
    const memberLoadInput = event.target.closest("#member-load-distance, #member-load-fx, #member-load-fy");

    if (supportField) {
      updateSupportField(
        supportField.dataset.supportId,
        supportField.dataset.supportField,
        supportField.value,
        {
          selector: `[data-support-id="${supportField.dataset.supportId}"][data-support-field="node"]`,
        }
      );
      return;
    }

    if (loadField) {
      updateLoadField(
        loadField.dataset.loadId,
        loadField.dataset.loadField,
        loadField.value,
        {
          selector: `[data-load-id="${loadField.dataset.loadId}"][data-load-field="node"]`,
        }
      );
    }

    if (quickBuilderInput) {
      const fieldMap = {
        "quick-span-length": "spanLength",
        "quick-panel-count": "panelCount",
        "quick-height": "height",
      };
      updateQuickBuilderField(fieldMap[quickBuilderInput.id], quickBuilderInput.value);
      return;
    }

    if (memberLoadInput) {
      const fieldMap = {
        "member-load-distance": "distance",
        "member-load-fx": "fx",
        "member-load-fy": "fy",
      };
      updateMemberLoadDraftField(fieldMap[memberLoadInput.id], memberLoadInput.value);
    }
  }

  controlsRoot.addEventListener("click", handleClick);
  controlsRoot.addEventListener("change", handleChange);
  controlsRoot.addEventListener("input", handleInput);

  if (elements.loadInputFile) {
    elements.loadInputFile.addEventListener("change", handleLoadFileSelection);
  }

  const publicStore = {
    getState: getSnapshot,
    getSolverInput: buildSolverInput,
    createMember(startNodeId, endNodeId) {
      return createMemberFromNodes(startNodeId, endNodeId);
    },
    deleteMember(memberId) {
      return deleteMemberById(memberId);
    },
    notify(message, type = "info") {
      showNotification(message, type);
    },
  };

  window.trussGeometryStore = publicStore;
  window.trussAnalysisInputStore = publicStore;

  applyQuickBuilderGeometry();
  render();
})();
