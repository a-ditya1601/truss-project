from flask import render_template

from app.routes.web import web_bp


@web_bp.get("/")
def index():
    return render_template("pages/index.html")


@web_bp.get("/learn")
def learn_page():
    return render_template("pages/learn.html")
