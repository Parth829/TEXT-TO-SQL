from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class ChatRequest(BaseModel):
    query: str = Field(..., description="The natural language question from the user.")
    session_id: Optional[str] = Field(None, description="Session ID for tracking conversation history.")

class Insight(BaseModel):
    title: str
    description: str
    impact: Optional[str] = None
    recommendation: Optional[str] = None

class ForecastResult(BaseModel):
    expected_value: str
    confidence_interval: str
    model_used: str
    drivers: List[str]
    forecast_data: Dict[str, Any] = Field(default_factory=dict) # For charting

class DashboardChart(BaseModel):
    id: str
    type: str # 'line', 'bar', 'pie', 'metric'
    title: str
    data_source_col_x: Optional[str] = None
    data_source_col_y: Optional[str] = None

class DashboardConfig(BaseModel):
    title: str
    charts: List[DashboardChart]

class ChatResponse(BaseModel):
    answer: str
    generated_sql: Optional[str] = None
    execution_plan: Optional[str] = None
    forecast: Optional[ForecastResult] = None
    insights: List[Insight] = Field(default_factory=list)
    citations: List[str] = Field(default_factory=list)
    agent_timeline: List[str] = Field(default_factory=list)
    dashboard: Optional[DashboardConfig] = None
    query_results: Optional[List[Dict[str, Any]]] = None
    has_forecast_potential: bool = False
    has_explainability_potential: bool = False
    clarification_questions: Optional[List[str]] = None
    business_context: Optional[List[Dict[str, str]]] = None

class AgentState(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    
    query: str
    intent: str = "data_query"
    clarified_query: Optional[str] = None
    query_plan: Optional[str] = None
    schema_context: str = ""
    sql_query: Optional[str] = None
    is_valid_sql: bool = False
    validation_errors: List[str] = []
    query_results: Optional[List[Dict[str, Any]]] = None
    query_results_df: Optional[Any] = None # Will hold pandas DataFrame
    execution_error: Optional[str] = None
    retries: int = 0
    forecast_result: Optional[Dict[str, Any]] = None
    insights: List[Dict[str, Any]] = []
    dashboard_layout: Optional[Dict[str, Any]] = None
    timeline: List[str] = []
    final_answer: Optional[str] = None
    has_forecast_potential: bool = False
    has_explainability_potential: bool = False
    clarification_questions: Optional[List[str]] = None
    business_context: Optional[List[Dict[str, str]]] = None
