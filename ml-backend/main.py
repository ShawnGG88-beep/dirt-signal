"""Dirt Signal FastAPI sidecar."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.readings import router as readings_router
from routes.soil_tests import router as soil_tests_router

app = FastAPI(
    title="Dirt Signal ML Backend",
    description="Local sidecar for the Dirt Signal desktop app",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(readings_router)
app.include_router(soil_tests_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
