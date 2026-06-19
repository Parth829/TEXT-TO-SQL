from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .models import ChatRequest, ChatResponse, ForecastResult, Insight
from .agent_graph import app_graph, AgentState, run_forecast, run_shap_analysis
import json
import asyncio

app = FastAPI(title="Enterprise Agentic AI Analytics Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Analytics Copilot API is running."}


def _build_response(result_state: dict) -> dict:
    """Builds the ChatResponse dict from the final graph state."""
    response = ChatResponse(
        answer=result_state.get("final_answer", "No answer generated."),
        generated_sql=result_state.get("sql_query"),
        execution_plan="Query executed successfully." if result_state.get("query_results") else "Execution skipped or failed.",
        insights=[Insight(**i) for i in result_state.get("insights", [])],
        agent_timeline=result_state.get("timeline", []),
        citations=result_state.get("citations", []),
        dashboard=result_state.get("dashboard_layout"),
        query_results=result_state.get("query_results"),
        has_forecast_potential=result_state.get("has_forecast_potential", False),
        has_explainability_potential=result_state.get("has_explainability_potential", False),
        clarification_questions=result_state.get("clarification_questions"),
        business_context=result_state.get("business_context"),
    )
    
    if result_state.get("forecast_result"):
        response.forecast = ForecastResult(**result_state["forecast_result"])
    
    return response.model_dump()


# ============================================================
# Original blocking endpoint (kept for backward compatibility)
# ============================================================
@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        initial_state = AgentState(query=request.query)
        result_state = app_graph.invoke(initial_state)
        return _build_response(result_state)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# SSE Streaming endpoint — streams agent progress in real-time
# ============================================================
@app.post("/api/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    async def event_generator():
        try:
            initial_state = AgentState(query=request.query)
            
            # Stream node-by-node using LangGraph's stream method
            last_timeline_len = 0
            final_state = None
            
            for event in app_graph.stream(initial_state):
                # event is a dict like {"node_name": state_dict}
                for node_name, state_data in event.items():
                    final_state = state_data
                    
                    # Extract new timeline entries since last event
                    timeline = state_data.get("timeline", [])
                    new_entries = timeline[last_timeline_len:]
                    last_timeline_len = len(timeline)
                    
                    # Send progress event for each new timeline entry
                    for entry in new_entries:
                        progress = {
                            "type": "progress",
                            "node": node_name,
                            "step": entry,
                        }
                        yield f"data: {json.dumps(progress)}\n\n"
                    
                    # If we have SQL, send it as an intermediate result
                    if node_name in ("sql_guard", "execute") and state_data.get("sql_query"):
                        sql_event = {
                            "type": "sql",
                            "generated_sql": state_data.get("sql_query"),
                            "is_valid": state_data.get("is_valid_sql", False),
                        }
                        yield f"data: {json.dumps(sql_event)}\n\n"
            
            # Send the final complete response
            if final_state:
                response_data = _build_response(final_state)
                final_event = {
                    "type": "complete",
                    "data": response_data,
                }
                yield f"data: {json.dumps(final_event, default=str)}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            error_event = {
                "type": "error",
                "message": str(e),
            }
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ============================================================
# On-demand endpoints for heavy ML workloads
# ============================================================

class OnDemandRequest(BaseModel):
    sql_query: str
    query: str

@app.post("/api/forecast")
async def forecast_endpoint(request: OnDemandRequest):
    try:
        result = await asyncio.to_thread(run_forecast, request.sql_query, request.query)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/explain")
async def explain_endpoint(request: OnDemandRequest):
    try:
        result = await asyncio.to_thread(run_shap_analysis, request.sql_query, request.query)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Existing endpoints (PDF export, data sources)
# ============================================================



class DataSourceReq(BaseModel):
    name: str
    source_type: str
    connection_string: str

@app.get("/api/sources")
def api_get_sources():
    from .data_sources import get_data_sources
    return get_data_sources()

@app.post("/api/sources")
def api_add_source(req: DataSourceReq):
    from .data_sources import add_data_source
    result = add_data_source(req.name, req.source_type, req.connection_string)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to connect"))
    return {"status": "ok", "stats": result.get("stats")}

@app.delete("/api/sources/{source_name}")
def api_delete_source(source_name: str):
    from .data_sources import remove_data_source
    success = remove_data_source(source_name)
    if success:
        return {"status": "ok"}
    else:
        raise HTTPException(status_code=404, detail="Source not found")

@app.get("/api/preview")
def api_preview(source_name: str = None, table_name: str = None):
    from .data_sources import _CONNECTED_SOURCES
    import pandas as pd
    from sqlalchemy import inspect, text
    try:
        if source_name:
            for src in _CONNECTED_SOURCES:
                if src.name == source_name and getattr(src, 'engine', None):
                    inspector = inspect(src.engine)
                    tables = inspector.get_table_names()
                    if tables:
                        target_table = table_name if table_name and table_name in tables else tables[0]
                        with src.engine.connect() as conn:
                            # Use dialect-specific quoting (e.g. backticks for MySQL, double quotes for Postgres)
                            identifier = src.engine.dialect.identifier_preparer.quote(target_table)
                            result = conn.execute(text(f'SELECT * FROM {identifier} LIMIT 100'))
                            df = pd.DataFrame(result.fetchall(), columns=result.keys())
                            return {
                                "tables": tables,
                                "current_table": target_table,
                                "data": df.fillna("").to_dict(orient='records')
                            }
                    else:
                        return {"error": "No tables found in this database."}
                        
        # If we reach here, the source wasn't found in memory.
        # This happens if the backend server restarts and clears _CONNECTED_SOURCES.
        return {"error": "Connection lost (backend restarted). Please reconnect your data source."}
    except Exception as e:
        return {"error": str(e)}
