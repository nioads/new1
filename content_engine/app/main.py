from fastapi import FastAPI

from content_engine.app.api.routes import router

app = FastAPI(title="Content Engine API", version="0.1.0")
app.include_router(router)
