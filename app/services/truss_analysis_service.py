from __future__ import annotations

from copy import deepcopy

from app.solver.utils.exceptions import SolverComputationError, SolverInputError
from app.solver.workflows.analysis_workflow import run_analysis


def _require_list(payload, key):
    value = payload.get(key)

    if not isinstance(value, list):
        raise SolverInputError(f"'{key}' must be provided as a list.")

    return value


def _normalize_payload(payload):
    if not isinstance(payload, dict):
        raise SolverInputError("Request payload must be a JSON object.")

    normalized = {
        "nodes": deepcopy(_require_list(payload, "nodes")),
        "members": deepcopy(_require_list(payload, "members")),
        "supports": deepcopy(payload.get("supports", [])),
        "loads": deepcopy(payload.get("loads", [])),
        "material_mode": str(
            payload.get("material_mode", payload.get("materialMode", "global"))
        ).strip().lower(),
        "global_material": deepcopy(
            payload.get("global_material", payload.get("globalMaterial", {}))
        ),
    }

    if not isinstance(normalized["supports"], list):
        raise SolverInputError("'supports' must be provided as a list.")

    if not isinstance(normalized["loads"], list):
        raise SolverInputError("'loads' must be provided as a list.")

    if normalized["material_mode"] not in {"global", "per_member"}:
        raise SolverInputError("material_mode must be either 'global' or 'per_member'.")

    return normalized


def _apply_global_materials(members, global_material):
    try:
        modulus = float(global_material["E"])
        area = float(global_material["A"])
    except (KeyError, TypeError, ValueError) as error:
        raise SolverInputError(
            "Global material mode requires valid E and A values."
        ) from error

    if modulus <= 0.0 or area <= 0.0:
        raise SolverInputError("Global material E and A must be greater than zero.")

    updated_members = []

    for member in members:
        updated_member = deepcopy(member)
        updated_member["E"] = modulus
        updated_member["A"] = area
        updated_members.append(updated_member)

    return updated_members


def _validate_per_member_materials(members):
    updated_members = []

    for member in members:
        updated_member = deepcopy(member)

        try:
            modulus = float(updated_member["E"])
            area = float(updated_member["A"])
        except (KeyError, TypeError, ValueError) as error:
            raise SolverInputError(
                f"Member {member.get('id', '<unknown>')} must include valid E and A values."
            ) from error

        if modulus <= 0.0 or area <= 0.0:
            raise SolverInputError(
                f"Member {member.get('id', '<unknown>')} must have E and A greater than zero."
            )

        updated_member["E"] = modulus
        updated_member["A"] = area
        updated_members.append(updated_member)

    return updated_members


def solve_truss_analysis(payload):
    normalized_payload = _normalize_payload(payload)
    members = normalized_payload["members"]

    if len(normalized_payload["nodes"]) == 0:
        raise SolverInputError("At least one node is required.")

    if len(members) == 0:
        raise SolverInputError("At least one member is required.")

    if normalized_payload["material_mode"] == "global":
        prepared_members = _apply_global_materials(
            members,
            normalized_payload["global_material"],
        )
    else:
        prepared_members = _validate_per_member_materials(members)

    solver_input = {
        "nodes": normalized_payload["nodes"],
        "members": prepared_members,
        "supports": normalized_payload["supports"],
        "loads": normalized_payload["loads"],
    }

    try:
        return run_analysis(solver_input)
    except (SolverInputError, SolverComputationError):
        raise
