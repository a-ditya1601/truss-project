class SolverError(Exception):
    """Base exception for solver-related failures."""


class SolverInputError(SolverError):
    """Raised when the truss input data is invalid or incomplete."""


class SolverComputationError(SolverError):
    """Raised when the numerical system cannot be solved reliably."""
