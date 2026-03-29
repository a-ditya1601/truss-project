from __future__ import annotations

import numpy as np

from app.solver.utils.exceptions import SolverComputationError, SolverInputError


def build_load_vector(nodes, loads, dof_map):
    """Assemble the global nodal load vector."""
    total_dofs = len(nodes) * 2
    load_vector = np.zeros(total_dofs, dtype=float)
    valid_node_ids = {node["id"] for node in nodes}

    for load in loads:
        node_id = load["node"]

        if node_id not in valid_node_ids:
            raise SolverInputError(f"Load references unknown node: {node_id}")

        dof_x, dof_y = dof_map[node_id]
        load_vector[dof_x] += float(load.get("fx", 0.0))
        load_vector[dof_y] += float(load.get("fy", 0.0))

    return load_vector


def solve_global_system(global_stiffness, load_vector, boundary_conditions):
    """Solve the reduced system and recover the full displacement vector."""
    free_dofs = boundary_conditions["free_dofs"]
    total_dofs = global_stiffness.shape[0]
    displacements = np.zeros(total_dofs, dtype=float)

    if free_dofs:
        reduced_stiffness = global_stiffness[np.ix_(free_dofs, free_dofs)]
        reduced_load_vector = load_vector[free_dofs]

        try:
            reduced_displacements = np.linalg.solve(
                reduced_stiffness,
                reduced_load_vector,
            )
        except np.linalg.LinAlgError as error:
            raise SolverComputationError(
                "The global stiffness matrix is singular. The truss may be unstable."
            ) from error

        displacements[free_dofs] = reduced_displacements

    reactions = global_stiffness @ displacements - load_vector

    return {
        "displacements": displacements,
        "reactions": reactions,
    }
