from fastapi import FastAPI
from app.api.ingestion import router as ingestion_router
from app.api.records import router as records_router
from app.api.search import router as search_router
from app.api.alerts import router as alerts_router
from app.api.profiles import router as profiles_router

app = FastAPI(title="Health Intelligence Layer API")

app.include_router(profiles_router, prefix="/api/profiles", tags=["profiles"])
app.include_router(ingestion_router, prefix="/api/documents", tags=["ingestion"])
app.include_router(records_router, prefix="/api/records", tags=["records"])
app.include_router(search_router, prefix="/api/search", tags=["search"])
app.include_router(alerts_router, prefix="/api/alerts", tags=["alerts"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
