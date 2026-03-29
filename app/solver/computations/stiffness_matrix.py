from __future__ import annotations

import numpy as np

from app.solver.utils.exceptions import SolverInputError


def build_dof_map(nodes):
    """Map each node to its global x and y displacement DOF indices."""
    return {
        node["id"]: (index * 2, index * 2 + 1)
        for index, node in enumerate(nodes)
    }


def build_node_lookup(nodes):
    return {node["id"]: node for node in nodes}


def compute_member_geometry(member, node_lookup):
    start_node = node_lookup.get(member["start"])
    end_node = node_lookup.get(member["end"])

    if start_node is None or end_node is None:
        raise SolverInputError(
            f"Member {member['id']} references a node that does not exist."
        )

    dx = float(end_node["x"]) - float(start_node["x"])
    dy = float(end_node["y"]) - float(start_node["y"])
    length = float(np.hypot(dx, dy))

    if length <= 0.0:
        raise SolverInputError(f"Member {member['id']} has zero length.")

    cosine = dx / length
    sine = dy / length

    return {
        "start_node": start_node,
        "end_node": end_node,
        "dx": dx,
        "dy": dy,
        "length": length,
        "cosine": cosine,
        "sine": sine,
    }


def compute_member_stiffness(member, node_lookup, dof_map):
    geometry = compute_member_geometry(member, node_lookup)
    modulus = float(member["E"])
    area = float(member["A"])

    if modulus <= 0.0 or area <= 0.0:
        raise SolverInputError(
            f"Member {member['id']} must have positive E and A values."
        )

    cosine = geometry["cosine"]
    sine = geometry["sine"]
    length = geometry["length"]
    stiffness_scale = (modulus * area) / length

    stiffness_matrix = stiffness_scale * np.array(
        [
            [cosine * cosine, cosine * sine, -cosine * cosine, -cosine * sine],
            [cosine * sine, sine * sine, -cosine * sine, -sine * sine],
            [-cosine * cosine, -cosine * sine, cosine * cosine, cosine * sine],
            [-cosine * sine, -sine * sine, cosine * sine, sine * sine],
        ],
        dtype=float,
    )

    start_dofs = dof_map[member["start"]]
    end_dofs = dof_map[member["end"]]

    return {
        "id": member["id"],
        "start": member["start"],
        "end": member["end"],
        "E": modulus,
        "A": area,
        "length": length,
        "cosine": cosine,
        "sine": sine,
        "dofs": [start_dofs[0], start_dofs[1], end_dofs[0], end_dofs[1]],
        "stiffness_matrix": stiffness_matrix,
    }


def assemble_global_stiffness(nodes, members):
    """Assemble the full global stiffness matrix from all truss members."""
    dof_map = build_dof_map(nodes)
    node_lookup = build_node_lookup(nodes)
    total_dofs = len(nodes) * 2
    global_stiffness = np.zeros((total_dofs, total_dofs), dtype=float)
    member_data = []

    for member in members:
        member_stiffness = compute_member_stiffness(member, node_lookup, dof_map)
        dofs = member_stiffness["dofs"]
        global_stiffness[np.ix_(dofs, dofs)] += member_stiffness["stiffness_matrix"]
        member_data.append(member_stiffness)

    return global_stiffness, dof_map, member_data
