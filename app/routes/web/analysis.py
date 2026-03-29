from flask import render_template

from app.routes.web import web_bp


@web_bp.get("/analysis")
def analysis_page():
    return render_template("pages/analysis.html")
