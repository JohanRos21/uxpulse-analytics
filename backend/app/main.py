from fastapi import FastAPI

app = FastAPI(
    title="UXPulse Analytics API",
    version="0.1.0",
    description="Self-hosted UX and behavior analytics platform.",
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "uxpulse-analytics",
        "version": "0.1.0",
    }