import asyncio
import logging
import mimetypes
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from qyebot import db, engine
from qyebot.api import router
from qyebot.auth import COOKIE, ensure_auth, token_ok
from qyebot.config import SRC
from qyebot.wecom import WeComError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("qyebot")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")


async def _loop():
    while True:
        try:
            settings = db.get_settings()
            if settings.get("scheduler_enabled", "1") != "0":
                await asyncio.to_thread(engine.tick)
        except Exception:
            log.exception("scheduler loop")
        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(_app):
    db.init_db()
    ensure_auth()
    task = asyncio.create_task(_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="qyekq", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def invalid_body(_request, _exc):
    return JSONResponse(status_code=422, content={"detail": "有字段没填对，检查一下再保存"})


@app.exception_handler(WeComError)
async def wecom_error(_request, exc):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.middleware("http")
async def no_cache_ui(request, call_next):
    path = request.url.path
    if path.startswith("/api") and path not in {"/api/auth/login", "/api/auth/salt", "/api/auth/logout"}:
        if not token_ok(request.cookies.get(COOKIE)):
            return JSONResponse(status_code=401, content={"detail": "请先登录"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    if path == "/" or path.startswith("/assets"):
        response.headers["Cache-Control"] = "no-cache"
    return response


app.mount("/", StaticFiles(directory=str(SRC), html=True), name="ui")
