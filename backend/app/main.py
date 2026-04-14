import logging
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.api.routes import auth, stations, employees, schedules, checklists, dashboard, assignment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="KT 기지국 현장관리 시스템",
    description="기지국 A/S 작업 관리 및 동선 최적화 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def error_logging_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        logger.error(f"Unhandled error on {request.method} {request.url.path}: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": str(e)})


app.include_router(auth.router, prefix="/api")
app.include_router(stations.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(checklists.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(assignment.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "KT 기지국 현장관리 시스템 API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
