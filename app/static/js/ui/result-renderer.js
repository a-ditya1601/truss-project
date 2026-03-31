(function () {
  const panelRoot = document.querySelector("[data-results-panel]");

  if (!panelRoot) {
    return;
  }

  const FORCE_TOLERANCE = 1e-9;

  const elements = {
    status: panelRoot.querySelector("#results-status-message"),
    trussTypeBadge: panelRoot.querySelector("#results-truss-type-badge"),
    parameterM: panelRoot.querySelector("#results-parameter-m"),
    parameterJ: panelRoot.querySelector("#results-parameter-j"),
    parameterR: panelRoot.querySelector("#results-parameter-r"),
    memberTableBody: panelRoot.querySelector("#results-member-table-body"),
    explanationContent: panelRoot.querySelector("#results-explanation-content"),
  };

  if (elements.memberTableBody) {
    elements.memberTablePanel = elements.memberTableBody.closest(".overflow-hidden");
  }

  function setResultsVisible(isVisible) {
    panelRoot.classList.toggle("hidden", !isVisible);
    panelRoot.setAttribute("aria-hidden", String(!isVisible));
  }

  function triggerResultsEntrance() {
    setResultsVisible(true);
    panelRoot.classList.remove("is-visible");
    panelRoot.classList.remove("translate-y-3", "opacity-0");

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        panelRoot.classList.add("is-visible");
        panelRoot.classList.add("translate-y-0", "opacity-100");
      });
    });
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

  function toKilonewtons(forceValue) {
    return Number(forceValue) / 1000;
  }

  function formatNumber(value, digits = 3) {
    return Number(value).toFixed(digits);
  }

  function getForceType(forceValue) {
    if (forceValue > FORCE_TOLERANCE) {
      return "tension";
    }

    if (forceValue < -FORCE_TOLERANCE) {
      return "compression";
    }

    return "zero";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderStatus(message, type = "info") {
    const variants = {
      info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
      error: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
      success: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200",
    };

    elements.status.className = `mt-6 rounded-2xl border px-4 py-3 text-sm font-medium ${variants[type] || variants.info}`;
    elements.status.textContent = message;
    elements.status.classList.remove("hidden");
  }

  function renderTrussBadge(trussType) {
    const variants = {
      determinate: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200",
      indeterminate: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
      unstable: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
    };

    const normalized = String(trussType || "pending").toLowerCase();
    elements.trussTypeBadge.className = `inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${variants[normalized] || "border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"}`;
    elements.trussTypeBadge.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function renderParameters(parameters = {}) {
    elements.parameterM.textContent = parameters.m ?? "-";
    elements.parameterJ.textContent = parameters.j ?? "-";
    elements.parameterR.textContent = parameters.r ?? "-";
  }

  function renderMemberTable(memberForces = []) {
    if (elements.memberTablePanel) {
      elements.memberTablePanel.classList.remove("hidden");
    }

    if (!Array.isArray(memberForces) || memberForces.length === 0) {
      elements.memberTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No member force results are available.
          </td>
        </tr>
      `;
      return;
    }

    elements.memberTableBody.innerHTML = memberForces
      .map((memberForce, index) => {
        const type = String(memberForce.type || getForceType(memberForce.force)).toLowerCase();
        const forceKilonewtons = toKilonewtons(memberForce.force);
        const rowBackground = index % 2 === 0
          ? "bg-white dark:bg-white/5"
          : "bg-gray-50 dark:bg-slate-900/70";
        const typeClasses =
          type === "tension"
            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200"
            : type === "compression"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
              : "border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/10 dark:text-gray-200";

        return `
          <tr class="${rowBackground}">
            <td class="px-4 py-4 font-medium text-gray-900 dark:text-white">${escapeHtml(memberForce.id)}</td>
            <td class="px-4 py-4 text-right font-semibold text-gray-900 dark:text-white">${formatNumber(forceKilonewtons, 3)}</td>
            <td class="px-4 py-4">
              <span class="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${typeClasses}">
                ${escapeHtml(type)}
              </span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function getSupportStats(model) {
    if (!model) {
      return { rollerCount: 0, freeNodes: [] };
    }

    const supportedNodes = new Set();
    let rollerCount = 0;

    (model.supports || []).forEach((support) => {
      supportedNodes.add(support.node);
      if (support.type === "roller") {
        rollerCount += 1;
      }
    });

    const freeNodes = (model.nodes || [])
      .map((node) => node.id)
      .filter((nodeId) => !supportedNodes.has(nodeId));

    return { rollerCount, freeNodes };
  }

  function buildUnstableMessage(model, result) {
    const parameters = result?.parameters || {};
    const memberCount = Number(parameters.m ?? 0);
    const jointCount = Number(parameters.j ?? 0);
    const reactionCount = Number(parameters.r ?? 0);
    const expressionValue = memberCount + reactionCount;
    const stabilityTarget = jointCount * 2;
    const missing = Math.max(0, stabilityTarget - expressionValue);
    const { rollerCount, freeNodes } = getSupportStats(model);
    const suggestions = [];

    if (rollerCount > 0) {
      suggestions.push("Change a roller to pinned to add 1 reaction.");
    }

    if (freeNodes.length > 0 && missing >= 2) {
      suggestions.push("Add a pinned support at an unsupported node to add 2 reactions.");
    }

    if (missing > 0) {
      suggestions.push(`Add ${missing} member${missing > 1 ? "s" : ""} to increase stability.`);
    }

    const base = `Structure is unstable (m + r = ${expressionValue} < 2j = ${stabilityTarget}). Missing ${missing} constraint${missing === 1 ? "" : "s"}.`;
    return suggestions.length > 0 ? `${base} ${suggestions.join(" ")}` : base;
  }

  function buildNodeLookup(nodes) {
    return new Map(nodes.map((node) => [node.id, node]));
  }

  function buildMemberLookup(members) {
    return new Map(members.map((member) => [member.id, member]));
  }

  function buildMemberForceLookup(memberForces) {
    return new Map(
      memberForces.map((memberForce) => [memberForce.id, Number(memberForce.force)])
    );
  }

  function buildReactionLookup(reactions) {
    const lookup = new Map();

    reactions.forEach((reaction) => {
      const current = lookup.get(reaction.node) || { fx: 0, fy: 0 };

      if (reaction.direction === "x") {
        current.fx += Number(reaction.value);
      }

      if (reaction.direction === "y") {
        current.fy += Number(reaction.value);
      }

      lookup.set(reaction.node, current);
    });

    return lookup;
  }

  function buildLoadLookup(loads) {
    const lookup = new Map();

    (loads || []).forEach((load) => {
      const current = lookup.get(load.node) || { fx: 0, fy: 0 };
      current.fx += Number(load.fx || 0);
      current.fy += Number(load.fy || 0);
      lookup.set(load.node, current);
    });

    return lookup;
  }

  function buildJointMemberMap(members) {
    const jointMap = new Map();

    members.forEach((member) => {
      if (!jointMap.has(member.start)) {
        jointMap.set(member.start, []);
      }

      if (!jointMap.has(member.end)) {
        jointMap.set(member.end, []);
      }

      jointMap.get(member.start).push(member);
      jointMap.get(member.end).push(member);
    });

    return jointMap;
  }

  function getUnitVectorForJoint(member, jointId, nodeLookup) {
    const startNode = nodeLookup.get(member.start);
    const endNode = nodeLookup.get(member.end);
    const otherNode = jointId === member.start ? endNode : startNode;
    const jointNode = jointId === member.start ? startNode : endNode;
    const dx = Number(otherNode.x) - Number(jointNode.x);
    const dy = Number(otherNode.y) - Number(jointNode.y);
    const length = Math.hypot(dx, dy);

    return {
      x: dx / length,
      y: dy / length,
    };
  }

  function formatEquation(axisLabel, unknowns, constantValueKn) {
    const unknownTerms = unknowns.map((unknown) => {
      const coefficient = axisLabel === "Fx" ? unknown.vector.x : unknown.vector.y;
      const sign = coefficient >= 0 ? "+" : "-";
      return `${sign} ${Math.abs(coefficient).toFixed(3)} ${unknown.member.id}`;
    });

    const constantSign = constantValueKn >= 0 ? "+" : "-";
    const constantTerm = `${constantSign} ${Math.abs(constantValueKn).toFixed(3)}`;

    return `Σ${axisLabel} = 0 -> ${[...unknownTerms, constantTerm].join(" ")} = 0`;
  }

  function solveSingleUnknown(unknown, rhsX, rhsY) {
    const candidates = [];

    if (Math.abs(unknown.vector.x) > FORCE_TOLERANCE) {
      candidates.push(rhsX / unknown.vector.x);
    }

    if (Math.abs(unknown.vector.y) > FORCE_TOLERANCE) {
      candidates.push(rhsY / unknown.vector.y);
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates[0];
  }

  function solveTwoUnknowns(firstUnknown, secondUnknown, rhsX, rhsY) {
    const determinant =
      firstUnknown.vector.x * secondUnknown.vector.y -
      firstUnknown.vector.y * secondUnknown.vector.x;

    if (Math.abs(determinant) < FORCE_TOLERANCE) {
      return null;
    }

    const firstValue =
      (rhsX * secondUnknown.vector.y - rhsY * secondUnknown.vector.x) / determinant;
    const secondValue =
      (firstUnknown.vector.x * rhsY - firstUnknown.vector.y * rhsX) / determinant;

    return [firstValue, secondValue];
  }

  function formatSolvedForce(forceValue) {
    const forceKilonewtons = toKilonewtons(forceValue);
    const type = getForceType(forceValue);
    const label = type === "zero" ? "Zero" : type.charAt(0).toUpperCase() + type.slice(1);
    return `${formatNumber(forceKilonewtons, 3)} kN (${label})`;
  }

  function generateMethodOfJointsExplanation(model, result) {
    if (result.truss_type === "unstable") {
      return `
        <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          The structure is unstable and cannot be solved.
        </div>
      `;
    }

    if (result.truss_type !== "determinate") {
      return `
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Method of joints is not applicable for indeterminate trusses. Analysis has been performed using the stiffness method.
        </div>
      `;
    }

    if (!model) {
      return `
        <div class="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 dark:border-white/10 dark:bg-slate-900 dark:text-gray-300">
          Method-of-joints explanation is unavailable because the current truss input model could not be read.
        </div>
      `;
    }

    const nodeLookup = buildNodeLookup(model.nodes || []);
    const memberLookup = buildMemberLookup(model.members || []);
    const memberForceLookup = buildMemberForceLookup(result.member_forces || []);
    const reactionLookup = buildReactionLookup(result.reactions || []);
    const loadLookup = buildLoadLookup(model.loads || []);
    const jointMemberMap = buildJointMemberMap(model.members || []);
    const solvedMembers = new Set();
    const explanationSteps = [];
    const memberIds = (model.members || []).map((member) => member.id);

    while (solvedMembers.size < memberIds.length) {
      let solvedThisPass = false;

      for (const node of model.nodes || []) {
        const incidentMembers = jointMemberMap.get(node.id) || [];
        const unknownMembers = incidentMembers.filter(
          (member) => !solvedMembers.has(member.id)
        );

        if (unknownMembers.length === 0 || unknownMembers.length > 2) {
          continue;
        }

        let knownFx = (loadLookup.get(node.id)?.fx || 0) + (reactionLookup.get(node.id)?.fx || 0);
        let knownFy = (loadLookup.get(node.id)?.fy || 0) + (reactionLookup.get(node.id)?.fy || 0);

        incidentMembers
          .filter((member) => solvedMembers.has(member.id))
          .forEach((member) => {
            const solvedForce = memberForceLookup.get(member.id) || 0;
            const vector = getUnitVectorForJoint(member, node.id, nodeLookup);
            knownFx += solvedForce * vector.x;
            knownFy += solvedForce * vector.y;
          });

        const rhsX = -knownFx;
        const rhsY = -knownFy;
        const unknownDetails = unknownMembers.map((member) => ({
          member,
          vector: getUnitVectorForJoint(member, node.id, nodeLookup),
        }));

        const equationFx = formatEquation("Fx", unknownDetails, knownFx / 1000);
        const equationFy = formatEquation("Fy", unknownDetails, knownFy / 1000);
        const solvedLines = [];

        if (unknownDetails.length === 1) {
          const solvedValue = solveSingleUnknown(unknownDetails[0], rhsX, rhsY);

          if (solvedValue === null || !Number.isFinite(solvedValue)) {
            continue;
          }

          solvedMembers.add(unknownDetails[0].member.id);
          solvedLines.push(
            `${unknownDetails[0].member.id} = ${formatSolvedForce(solvedValue)}`
          );
        } else {
          const solvedValues = solveTwoUnknowns(
            unknownDetails[0],
            unknownDetails[1],
            rhsX,
            rhsY
          );

          if (!solvedValues || !solvedValues.every(Number.isFinite)) {
            continue;
          }

          solvedMembers.add(unknownDetails[0].member.id);
          solvedMembers.add(unknownDetails[1].member.id);
          solvedLines.push(
            `${unknownDetails[0].member.id} = ${formatSolvedForce(solvedValues[0])}`
          );
          solvedLines.push(
            `${unknownDetails[1].member.id} = ${formatSolvedForce(solvedValues[1])}`
          );
        }

        explanationSteps.push(`
          <article class="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-white/10 dark:bg-slate-900">
            <p class="ui-label">Joint ${escapeHtml(node.id)}</p>
            <h4 class="ui-heading mt-2 text-lg">Equilibrium at ${escapeHtml(node.id)}</h4>
            <div class="mt-4 rounded-xl border border-gray-200 bg-white p-4 font-mono text-sm leading-7 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
              <div>${escapeHtml(equationFx)}</div>
              <div>${escapeHtml(equationFy)}</div>
            </div>
            <div class="mt-4 space-y-2">
              ${solvedLines
                .map(
                  (line) => `<p class="text-sm font-semibold text-gray-900 dark:text-white">${escapeHtml(line)}</p>`
                )
                .join("")}
            </div>
          </article>
        `);

        solvedThisPass = true;
        break;
      }

      if (!solvedThisPass) {
        break;
      }
    }

    if (solvedMembers.size !== memberIds.length) {
      return `
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          A complete method-of-joints sequence could not be derived automatically from the current connectivity, even though the solver returned a determinate result.
        </div>
      `;
    }

    return explanationSteps.join("");
  }

  function renderSolvedResult(result) {
    triggerResultsEntrance();
    if (String(result.truss_type || "").toLowerCase() === "unstable") {
      const warningMessage = buildUnstableMessage(getCurrentModel(), result);
      renderStatus(warningMessage, "error");
      renderTrussBadge(result.truss_type);
      renderParameters(result.parameters);

      if (elements.memberTablePanel) {
        elements.memberTablePanel.classList.add("hidden");
      }

      elements.explanationContent.innerHTML = generateMethodOfJointsExplanation(
        getCurrentModel(),
        result
      );
      window.dispatchEvent(new CustomEvent("truss-results:visible"));
      return;
    }

    renderStatus("Analysis completed successfully. Review the force summary and explanation tabs below.", "success");
    renderTrussBadge(result.truss_type);
    renderParameters(result.parameters);
    renderMemberTable(result.member_forces);
    elements.explanationContent.innerHTML = generateMethodOfJointsExplanation(
      getCurrentModel(),
      result
    );
    window.dispatchEvent(new CustomEvent("truss-results:visible"));
  }

  function renderErrorState(errorMessage) {
    setResultsVisible(false);
    panelRoot.classList.add("translate-y-3", "opacity-0");
    panelRoot.classList.remove("translate-y-0", "opacity-100", "is-visible");
    elements.status.classList.add("hidden");
  }

  window.addEventListener("truss-analysis:solved", (event) => {
    renderSolvedResult(event.detail);
  });

  window.addEventListener("truss-analysis:solveerror", (event) => {
    renderErrorState(event.detail?.error || "Unable to complete the analysis.");
  });

  setResultsVisible(false);
})();
