from flask import jsonify, request

from app.routes.api import api_bp
from app.services.truss_analysis_service import solve_truss_analysis
from app.solver.utils.exceptions import SolverComputationError, SolverInputError


@api_bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@api_bp.post("/solve")
def solve():
    payload = request.get_json(silent=True)

    if payload is None:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Request body must be valid JSON.",
                }
            ),
            400,
        )

    try:
        result = solve_truss_analysis(payload)
    except (SolverInputError, SolverComputationError) as error:
        return jsonify({"success": False, "error": str(error)}), 400
    except Exception:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "An unexpected error occurred while solving the truss.",
                }
            ),
            500,
        )

    return jsonify({"success": True, "data": result})
