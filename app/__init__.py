from flask import Flask

from app.extensions import init_extensions
from app.routes.api import api_bp
from app.routes.web import web_bp
from config.settings import Config


def create_app(config_class=Config):
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )
    app.config.from_object(config_class)

    init_extensions(app)
    register_blueprints(app)

    return app


def register_blueprints(app):
    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp)
