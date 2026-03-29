from __future__ import annotations

import numpy as np


TOLERANCE = 1e-9


def _clean_value(value):
    return 0.0 if abs(float(value)) < TOLERANCE else float(value)


def build_displacement_results(nodes, dof_map, global_displacements):
    results = []

    for node in nodes:
        dof_x, dof_y = dof_map[node["id"]]
        results.append(
            {
                "node": node["id"],
                "ux": _clean_value(global_displacements[dof_x]),
                "uy": _clean_value(global_displacements[dof_y]),
            }
        )

    return results


def build_reaction_results(boundary_conditions, reactions):
    results = []

    for reaction_dof in boundary_conditions["reaction_dofs"]:
        results.append(
            {
                "node": reaction_dof["node"],
                "direction": reaction_dof["direction"],
                "value": _clean_value(reactions[reaction_dof["dof"]]),
            }
        )

    return results


def build_member_force_results(member_data, global_displacements):
    results = []

    for member in member_data:
        dofs = member["dofs"]
        member_displacements = global_displacements[dofs]
        transformation_vector = np.array(
            [-member["cosine"], -member["sine"], member["cosine"], member["sine"]],
            dtype=float,
        )
        elongation = float(transformation_vector @ member_displacements)
        axial_force = ((member["E"] * member["A"]) / member["length"]) * elongation

        if axial_force > TOLERANCE:
            force_type = "tension"
        elif axial_force < -TOLERANCE:
            force_type = "compression"
        else:
            force_type = "zero"

        results.append(
            {
                "id": member["id"],
                "force": _clean_value(axial_force),
                "type": force_type,
                "elongation": _clean_value(elongation),
                "stress": _clean_value(axial_force / member["A"]),
            }
        )

    return results
