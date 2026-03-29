from __future__ import annotations

from app.solver.computations.boundary_conditions import (
    build_boundary_conditions,
    classify_truss,
)
from app.solver.computations.post_processing import (
    build_displacement_results,
    build_member_force_results,
    build_reaction_results,
)
from app.solver.computations.stiffness_matrix import assemble_global_stiffness
from app.solver.computations.system_solver import build_load_vector, solve_global_system
from app.solver.utils.exceptions import SolverInputError


def _normalize_nodes(nodes):
    if not nodes:
        raise SolverInputError("At least one node is required.")

    normalized_nodes = []
    seen_ids = set()

    for node in nodes:
        node_id = str(node["id"]).strip()

        if not node_id:
            raise SolverInputError("Each node must have a non-empty id.")

        if node_id in seen_ids:
            raise SolverInputError(f"Duplicate node id found: {node_id}")

        seen_ids.add(node_id)
        normalized_nodes.append(
            {
                "id": node_id,
                "x": float(node["x"]),
                "y": float(node["y"]),
            }
        )

    return normalized_nodes


def _normalize_members(members):
    normalized_members = []
    seen_ids = set()

    for member in members:
        member_id = str(member["id"]).strip()

        if not member_id:
            raise SolverInputError("Each member must have a non-empty id.")

        if member_id in seen_ids:
            raise SolverInputError(f"Duplicate member id found: {member_id}")

        seen_ids.add(member_id)
        normalized_members.append(
            {
                "id": member_id,
                "start": str(member["start"]).strip(),
                "end": str(member["end"]).strip(),
                "E": float(member["E"]),
                "A": float(member["A"]),
            }
        )

    return normalized_members


def _normalize_supports(supports):
    normalized_supports = []

    for support in supports:
        normalized_supports.append(
            {
                "node": str(support["node"]).strip(),
                "type": str(support["type"]).strip().lower(),
                "direction": str(support.get("direction", "y")).strip().lower(),
            }
        )

    return normalized_supports


def _normalize_loads(loads):
    normalized_loads = []

    for load in loads:
        normalized_loads.append(
            {
                "node": str(load["node"]).strip(),
                "fx": float(load.get("fx", 0.0)),
                "fy": float(load.get("fy", 0.0)),
            }
        )

    return normalized_loads


def _normalize_model(model_data):
    if not isinstance(model_data, dict):
        raise SolverInputError("Solver input must be a dictionary.")

    return {
        "nodes": _normalize_nodes(model_data.get("nodes", [])),
        "members": _normalize_members(model_data.get("members", [])),
        "supports": _normalize_supports(model_data.get("supports", [])),
        "loads": _normalize_loads(model_data.get("loads", [])),
    }


def run_analysis(model_data):
    """Run a full 2D plane truss analysis using the stiffness method."""
    normalized_model = _normalize_model(model_data)
    nodes = normalized_model["nodes"]
    members = normalized_model["members"]
    supports = normalized_model["supports"]
    loads = normalized_model["loads"]

    if not members:
        raise SolverInputError("At least one member is required for analysis.")

    classification = classify_truss(nodes, members, supports)
    global_stiffness, dof_map, member_data = assemble_global_stiffness(nodes, members)
    load_vector = build_load_vector(nodes, loads, dof_map)
    boundary_conditions = build_boundary_conditions(nodes, supports, dof_map)
    solution = solve_global_system(global_stiffness, load_vector, boundary_conditions)

    return {
        "member_forces": build_member_force_results(
            member_data,
            solution["displacements"],
        ),
        "reactions": build_reaction_results(
            boundary_conditions,
            solution["reactions"],
        ),
        "displacements": build_displacement_results(
            nodes,
            dof_map,
            solution["displacements"],
        ),
        "truss_type": classification["truss_type"],
        "parameters": classification["parameters"],
    }


analyze_truss = run_analysis
