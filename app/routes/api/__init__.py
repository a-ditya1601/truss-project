from flask import Blueprint


api_bp = Blueprint("api", __name__, url_prefix="/api")


from app.routes.api import analysis  # noqa: E402,F401
