from __future__ import annotations

from app.solver.utils.exceptions import SolverInputError


def get_support_restraints(support):
    """Return restrained translational directions for a support.

    For a plane truss there are only translational DOFs, so a fixed support
    is treated the same as a pinned support in the solver.
    """

    support_type = str(support["type"]).strip().lower()

    if support_type in {"pinned", "fixed"}:
        return ["x", "y"]

    if support_type == "roller":
        direction = str(support.get("direction", "y")).strip().lower()

        if direction not in {"x", "y"}:
            raise SolverInputError("Roller supports must restrain either 'x' or 'y'.")

        return [direction]

    raise SolverInputError(f"Unsupported support type: {support['type']}")


def build_boundary_conditions(nodes, supports, dof_map):
    """Compute restrained and free DOF sets from the support configuration."""
    node_ids = {node["id"] for node in nodes}
    restrained_dofs = []
    reaction_dofs = []
    supported_nodes = set()

    for support in supports:
        node_id = support["node"]

        if node_id not in node_ids:
            raise SolverInputError(f"Support references unknown node: {node_id}")

        if node_id in supported_nodes:
            raise SolverInputError(f"Node {node_id} cannot have more than one support.")

        supported_nodes.add(node_id)
        dof_x, dof_y = dof_map[node_id]

        for direction in get_support_restraints(support):
            dof_index = dof_x if direction == "x" else dof_y
            restrained_dofs.append(dof_index)
            reaction_dofs.append(
                {
                    "node": node_id,
                    "direction": direction,
                    "dof": dof_index,
                    "type": support["type"],
                }
            )

    restrained_dofs = sorted(set(restrained_dofs))
    total_dofs = len(nodes) * 2
    free_dofs = [index for index in range(total_dofs) if index not in restrained_dofs]

    return {
        "restrained_dofs": restrained_dofs,
        "free_dofs": free_dofs,
        "reaction_dofs": reaction_dofs,
    }


def classify_truss(nodes, members, supports):
    """Classify the truss by the standard m + r versus 2j criterion."""
    joint_count = len(nodes)
    member_count = len(members)
    reaction_count = sum(len(get_support_restraints(support)) for support in supports)

    expression_value = member_count + reaction_count
    stability_target = 2 * joint_count

    if expression_value < stability_target:
        truss_type = "unstable"
    elif expression_value == stability_target:
        truss_type = "determinate"
    else:
        truss_type = "indeterminate"

    return {
        "truss_type": truss_type,
        "parameters": {
            "m": member_count,
            "j": joint_count,
            "r": reaction_count,
        },
    }
