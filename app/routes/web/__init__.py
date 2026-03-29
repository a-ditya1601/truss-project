from flask import Blueprint


web_bp = Blueprint("web", __name__)


from app.routes.web import analysis, pages  # noqa: E402,F401
